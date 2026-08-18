"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireWorkspace } from "@/lib/workspace";

const idSchema = z.string().uuid();
const searchSchema = z.object({
  niches: z.string().trim().min(2).max(500),
  location: z.string().trim().min(2).max(160),
  targetProblem: z.string().trim().max(500),
  requestedCount: z.coerce.number().int().min(1).max(100),
  radiusKm: z.coerce.number().int().min(1).max(50),
  minRating: z.coerce.number().min(0).max(5),
  minReviews: z.coerce.number().int().min(0).max(1_000_000),
  sortBy: z.enum(["relevance", "rating", "reviews"]),
});

type GooglePlace = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  primaryType?: string;
  businessStatus?: string;
  googleMapsUri?: string;
  nationalPhoneNumber?: string;
  websiteUri?: string;
  rating?: number;
  userRatingCount?: number;
  location?: { latitude?: number; longitude?: number };
};

type FinderResult = {
  id: string;
  provider_place_id: string;
  business_name: string;
  formatted_address: string | null;
  primary_type: string | null;
  google_maps_url: string | null;
  niche: string;
  target_problem: string | null;
  status: string;
};

type WorkspaceContext = Awaited<ReturnType<typeof requireWorkspace>>;
type PlaceCandidate = { place: GooglePlace; niche: string };

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function checked(formData: FormData, key: string) {
  return formData.get(key) === "on";
}

function optional(input: string | null | undefined) {
  return input?.trim() || null;
}

function clip(input: string | null | undefined, max: number) {
  return input?.trim().slice(0, max) || null;
}

function parseNiches(raw: string) {
  return Array.from(
    new Set(
      raw
        .split(/[,;\n]+/)
        .map((item) => item.trim())
        .filter((item) => item.length >= 2 && item.length <= 100)
        .slice(0, 8),
    ),
  );
}

function finderRedirect(kind: "error" | "notice", message: string): never {
  redirect(`/dashboard/leads/add?mode=google&${kind}=${encodeURIComponent(message)}#review-results`);
}

function done(message: string): never {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/leads");
  revalidatePath("/dashboard/leads/add");
  revalidatePath("/dashboard/leads/finder");
  finderRedirect("notice", message);
}

function apiKey() {
  const key = process.env.GOOGLE_PLACES_API_KEY?.trim();
  if (!key) {
    finderRedirect("error", "Google Places is not connected yet. Add GOOGLE_PLACES_API_KEY in Vercel.");
  }
  return key;
}

function calculateScore(place: GooglePlace, niche: string, targetProblem: string | null) {
  const fit = 30;
  const hasWebsite = Boolean(place.websiteUri);
  const hasPhone = Boolean(place.nationalPhoneNumber);
  const reviews = place.userRatingCount ?? 0;
  const rating = place.rating ?? 0;
  const problem = hasWebsite ? 10 : 30;
  const contactability = Math.min(20, (hasPhone ? 15 : 0) + (hasWebsite ? 5 : 0));
  let commercial = reviews >= 100 ? 18 : reviews >= 50 ? 16 : reviews >= 20 ? 13 : reviews >= 5 ? 9 : reviews > 0 ? 6 : 3;
  if (rating >= 4.2) commercial = Math.min(20, commercial + 2);
  const total = fit + problem + contactability + commercial;
  const weakness = hasWebsite
    ? `A public website exists, but conversion quality, proof, mobile UX and enquiry flow still need a manual audit${targetProblem ? ` against the target problem: ${targetProblem}` : ""}.`
    : `No public website was returned by Google Places. The business is likely dependent on Maps, social pages or direct messaging${targetProblem ? ` while the target problem is: ${targetProblem}` : ""}.`;
  const offer = hasWebsite
    ? "Conversion audit, proof system and enquiry-flow upgrade"
    : "Launch website, Google proof layer and enquiry system";
  const nextAction = hasPhone
    ? "Review the Google profile, verify the weakness, then prepare one concise personalised outreach message."
    : "Review the Google profile and website, verify the weakness, then identify a lawful public contact channel.";
  const reason = `${niche} fit ${fit}/30; visible problem ${problem}/30; contactability ${contactability}/20; commercial signal ${commercial}/20. Google shows ${reviews} reviews${rating ? ` at ${rating.toFixed(1)}` : ""}.`;
  return { fit, problem, contactability, commercial, total, weakness, offer, nextAction, reason };
}

async function resolveLocation(key: string, location: string) {
  const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "places.location",
    },
    body: JSON.stringify({ textQuery: location, pageSize: 1, languageCode: "en" }),
    cache: "no-store",
  });
  if (!response.ok) return null;
  const payload = (await response.json()) as { places?: GooglePlace[] };
  const center = payload.places?.[0]?.location;
  if (typeof center?.latitude !== "number" || typeof center?.longitude !== "number") return null;
  return { latitude: center.latitude, longitude: center.longitude };
}

function locationRectangle(center: { latitude: number; longitude: number } | null, radiusKm: number) {
  if (!center) return undefined;
  const latDelta = radiusKm / 111;
  const cosine = Math.max(0.2, Math.cos((center.latitude * Math.PI) / 180));
  const lonDelta = radiusKm / (111 * cosine);
  return {
    rectangle: {
      low: {
        latitude: Math.max(-90, center.latitude - latDelta),
        longitude: Math.max(-180, center.longitude - lonDelta),
      },
      high: {
        latitude: Math.min(90, center.latitude + latDelta),
        longitude: Math.min(180, center.longitude + lonDelta),
      },
    },
  };
}

function sortCandidates(candidates: PlaceCandidate[], sortBy: string) {
  if (sortBy === "rating") return [...candidates].sort((a, b) => (b.place.rating ?? 0) - (a.place.rating ?? 0));
  if (sortBy === "reviews") return [...candidates].sort((a, b) => (b.place.userRatingCount ?? 0) - (a.place.userRatingCount ?? 0));
  return candidates;
}

async function rememberDecision({ supabase, workspaceId, placeId, decision, leadId, userId }: {
  supabase: WorkspaceContext["supabase"];
  workspaceId: string;
  placeId: string;
  decision: "approved" | "rejected" | "duplicate";
  leadId: string | null;
  userId: string;
}) {
  const { error } = await supabase.from("lead_finder_place_memory").upsert(
    {
      workspace_id: workspaceId,
      provider: "google_places",
      provider_place_id: placeId,
      decision,
      lead_id: leadId,
      decided_by: userId,
      decided_at: new Date().toISOString(),
    },
    { onConflict: "workspace_id,provider,provider_place_id" },
  );
  if (error) throw error;
}

export async function searchPlaces(formData: FormData) {
  const parsed = searchSchema.safeParse({
    niches: value(formData, "niches"),
    location: value(formData, "location"),
    targetProblem: value(formData, "targetProblem"),
    requestedCount: value(formData, "requestedCount") || "20",
    radiusKm: value(formData, "radiusKm") || "25",
    minRating: value(formData, "minRating") || "0",
    minReviews: value(formData, "minReviews") || "0",
    sortBy: value(formData, "sortBy") || "relevance",
  });
  if (!parsed.success) finderRedirect("error", "Check the search brief and try again.");

  const niches = parseNiches(parsed.data.niches);
  if (!niches.length) finderRedirect("error", "Add at least one valid niche.");

  const hasWebsite = checked(formData, "hasWebsite");
  const hasPhone = checked(formData, "hasPhone");
  const openNow = checked(formData, "openNow");
  const operationalOnly = checked(formData, "operationalOnly");
  const { supabase, user, workspace } = await requireWorkspace();
  const key = apiKey();
  const targetProblem = optional(parsed.data.targetProblem);
  const queryText = `${niches.join(", ")} in ${parsed.data.location}`;

  await supabase.from("lead_finder_results").delete().eq("workspace_id", workspace.id).lt("expires_at", new Date().toISOString());

  const { data: search, error: searchError } = await supabase
    .from("lead_finder_searches")
    .insert({
      workspace_id: workspace.id,
      query_text: queryText,
      niche: niches.join(", "),
      location: parsed.data.location,
      target_problem: targetProblem,
      requested_count: parsed.data.requestedCount,
      status: "running",
      created_by: user.id,
    })
    .select("id")
    .single();
  if (searchError || !search) finderRedirect("error", "Orbit could not create the discovery search.");

  try {
    const center = await resolveLocation(key, parsed.data.location);
    const restriction = locationRectangle(center, parsed.data.radiusKm);
    const candidates: PlaceCandidate[] = [];
    const seenInSearch = new Set<string>();

    for (const niche of niches) {
      if (candidates.length >= parsed.data.requestedCount) break;
      let pageToken: string | undefined;
      let page = 0;
      do {
        const remaining = parsed.data.requestedCount - candidates.length;
        const requestBody: Record<string, unknown> = {
          textQuery: niche,
          pageSize: Math.max(1, Math.min(20, remaining)),
          languageCode: "en",
        };
        if (restriction) requestBody.locationRestriction = restriction;
        if (openNow) requestBody.openNow = true;
        if (parsed.data.minRating > 0) requestBody.minRating = parsed.data.minRating;
        if (pageToken) requestBody.pageToken = pageToken;

        const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": key,
            "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.primaryType,places.businessStatus,places.googleMapsUri,places.nationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,nextPageToken",
          },
          body: JSON.stringify(requestBody),
          cache: "no-store",
        });
        if (!response.ok) throw new Error(`Google Places ${response.status}: ${(await response.text()).slice(0, 700)}`);

        const payload = (await response.json()) as { places?: GooglePlace[]; nextPageToken?: string };
        for (const place of payload.places ?? []) {
          if (!place.id || !place.displayName?.text || seenInSearch.has(place.id)) continue;
          if (operationalOnly && place.businessStatus && place.businessStatus !== "OPERATIONAL") continue;
          if (hasWebsite && !place.websiteUri) continue;
          if (hasPhone && !place.nationalPhoneNumber) continue;
          if ((place.userRatingCount ?? 0) < parsed.data.minReviews) continue;
          if ((place.rating ?? 0) < parsed.data.minRating) continue;
          seenInSearch.add(place.id);
          candidates.push({ place, niche });
          if (candidates.length >= parsed.data.requestedCount) break;
        }
        pageToken = payload.nextPageToken;
        page += 1;
      } while (pageToken && page < 3 && candidates.length < parsed.data.requestedCount);
    }

    const placeIds = candidates.map((item) => item.place.id).filter((id): id is string => Boolean(id));
    let existingResults: { provider_place_id: string }[] = [];
    let existingLeads: { google_place_id: string | null }[] = [];
    let rememberedPlaces: { provider_place_id: string }[] = [];

    if (placeIds.length) {
      const [resultsQuery, leadsQuery, memoryQuery] = await Promise.all([
        supabase.from("lead_finder_results").select("provider_place_id").eq("workspace_id", workspace.id).in("provider_place_id", placeIds),
        supabase.from("leads").select("google_place_id").eq("workspace_id", workspace.id).in("google_place_id", placeIds),
        supabase.from("lead_finder_place_memory").select("provider_place_id").eq("workspace_id", workspace.id).in("provider_place_id", placeIds),
      ]);
      if (resultsQuery.error || leadsQuery.error || memoryQuery.error) throw new Error("Orbit could not check duplicate Place IDs.");
      existingResults = resultsQuery.data ?? [];
      existingLeads = leadsQuery.data ?? [];
      rememberedPlaces = memoryQuery.data ?? [];
    }

    const known = new Set([
      ...existingResults.map((item) => item.provider_place_id),
      ...existingLeads.map((item) => item.google_place_id).filter((id): id is string => Boolean(id)),
      ...rememberedPlaces.map((item) => item.provider_place_id),
    ]);

    const freshCandidates = sortCandidates(
      candidates.filter((item) => !known.has(item.place.id as string)),
      parsed.data.sortBy,
    ).slice(0, parsed.data.requestedCount);

    if (freshCandidates.length) {
      const rows = freshCandidates.map(({ place, niche }) => {
        const score = calculateScore(place, niche, targetProblem);
        return {
          workspace_id: workspace.id,
          search_id: search.id,
          provider_place_id: place.id,
          business_name: place.displayName?.text?.slice(0, 200),
          formatted_address: clip(place.formattedAddress, 500),
          primary_type: clip(place.primaryType, 120),
          business_status: clip(place.businessStatus, 80),
          google_maps_url: clip(place.googleMapsUri, 1000),
          website_url: clip(place.websiteUri, 1000),
          phone: clip(place.nationalPhoneNumber, 60),
          rating: place.rating ?? null,
          review_count: place.userRatingCount ?? null,
          niche,
          target_problem: targetProblem,
          fit_score: score.fit,
          problem_score: score.problem,
          contactability_score: score.contactability,
          commercial_score: score.commercial,
          total_score: score.total,
          score_reason: score.reason.slice(0, 2000),
          detected_weakness: score.weakness.slice(0, 1000),
          recommended_offer: score.offer.slice(0, 1000),
          suggested_next_action: score.nextAction.slice(0, 500),
          status: "analyzed",
          analyzed_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          created_by: user.id,
        };
      });
      const { error: insertError } = await supabase.from("lead_finder_results").insert(rows);
      if (insertError) throw insertError;
    }

    const { error: completionError } = await supabase
      .from("lead_finder_searches")
      .update({ status: "completed", result_count: freshCandidates.length, completed_at: new Date().toISOString() })
      .eq("id", search.id)
      .eq("workspace_id", workspace.id);
    if (completionError) throw completionError;

    const skipped = candidates.length - freshCandidates.length;
    const placeNote = center ? ` within about ${parsed.data.radiusKm} km of ${parsed.data.location}` : ` around ${parsed.data.location}`;
    done(`${freshCandidates.length} review-ready leads found${placeNote}. ${skipped} known or filtered businesses skipped.`);
  } catch (error) {
    await supabase
      .from("lead_finder_searches")
      .update({
        status: "failed",
        error_summary: error instanceof Error ? error.message.slice(0, 1000) : "Unknown provider error",
        completed_at: new Date().toISOString(),
      })
      .eq("id", search.id)
      .eq("workspace_id", workspace.id);
    finderRedirect("error", "Lead Finder could not complete the search. Check the Google Places key, billing and API access.");
  }
}

export async function analyzeFinderResult(formData: FormData) {
  const id = idSchema.safeParse(value(formData, "id"));
  if (!id.success) finderRedirect("error", "Invalid discovery result.");
  const { supabase, workspace } = await requireWorkspace();
  const key = apiKey();
  const { data, error } = await supabase
    .from("lead_finder_results")
    .select("id,provider_place_id,business_name,formatted_address,primary_type,google_maps_url,niche,target_problem,status")
    .eq("id", id.data)
    .eq("workspace_id", workspace.id)
    .single();
  if (error || !data) finderRedirect("error", "Discovery result not found.");
  const result = data as FinderResult;
  if (["approved", "rejected", "duplicate"].includes(result.status)) finderRedirect("error", "This opportunity has already been decided.");

  let place: GooglePlace;
  try {
    const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(result.provider_place_id)}`, {
      headers: {
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "id,displayName,formattedAddress,nationalPhoneNumber,websiteUri,rating,userRatingCount,businessStatus,googleMapsUri,primaryType",
      },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(String(response.status));
    place = (await response.json()) as GooglePlace;
  } catch {
    finderRedirect("error", "Google Places could not enrich this business. Check the provider connection and try again.");
  }

  const score = calculateScore(place, result.niche, result.target_problem);
  const { error: updateError } = await supabase
    .from("lead_finder_results")
    .update({
      business_name: place.displayName?.text?.slice(0, 200) ?? result.business_name,
      formatted_address: clip(place.formattedAddress, 500) ?? result.formatted_address,
      primary_type: clip(place.primaryType, 120) ?? result.primary_type,
      business_status: clip(place.businessStatus, 80),
      google_maps_url: clip(place.googleMapsUri, 1000) ?? result.google_maps_url,
      phone: clip(place.nationalPhoneNumber, 60),
      website_url: clip(place.websiteUri, 1000),
      rating: place.rating ?? null,
      review_count: place.userRatingCount ?? null,
      fit_score: score.fit,
      problem_score: score.problem,
      contactability_score: score.contactability,
      commercial_score: score.commercial,
      total_score: score.total,
      score_reason: score.reason.slice(0, 2000),
      detected_weakness: score.weakness.slice(0, 1000),
      recommended_offer: score.offer.slice(0, 1000),
      suggested_next_action: score.nextAction.slice(0, 500),
      status: "analyzed",
      analyzed_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    })
    .eq("id", result.id)
    .eq("workspace_id", workspace.id);
  if (updateError) finderRedirect("error", "Orbit could not save the opportunity analysis.");
  done(`${result.business_name} analyzed and scored.`);
}

async function approveResult(context: WorkspaceContext, id: string) {
  const { supabase, user, workspace } = context;
  const { data, error } = await supabase.from("lead_finder_results").select("*").eq("id", id).eq("workspace_id", workspace.id).single();
  if (error || !data) return { outcome: "failed" as const, businessName: "Lead" };
  if (data.status === "approved") return { outcome: "approved" as const, businessName: data.business_name };
  if (data.status !== "analyzed") return { outcome: "not_ready" as const, businessName: data.business_name };

  const { data: duplicate } = await supabase
    .from("leads")
    .select("id")
    .eq("workspace_id", workspace.id)
    .eq("google_place_id", data.provider_place_id)
    .maybeSingle();

  if (duplicate) {
    await Promise.all([
      supabase.from("lead_finder_results").update({ status: "duplicate", lead_id: duplicate.id, decided_at: new Date().toISOString() }).eq("id", data.id).eq("workspace_id", workspace.id),
      rememberDecision({ supabase, workspaceId: workspace.id, placeId: data.provider_place_id, decision: "duplicate", leadId: duplicate.id, userId: user.id }),
    ]);
    return { outcome: "duplicate" as const, businessName: data.business_name };
  }

  const businessName = String(data.business_name).slice(0, 160);
  const notes = [
    data.score_reason,
    data.formatted_address ? `Address: ${data.formatted_address}` : null,
    data.rating !== null ? `Google Maps rating signal: ${data.rating} from ${data.review_count ?? 0} reviews.` : null,
    `Discovered through Orbit Lead Finder. Google Place ID: ${data.provider_place_id}`,
  ].filter(Boolean).join("\n\n").slice(0, 4000);

  const { data: lead, error: insertError } = await supabase
    .from("leads")
    .insert({
      workspace_id: workspace.id,
      name: businessName,
      company: businessName,
      phone: clip(data.phone, 40),
      whatsapp: clip(data.phone, 40),
      source: "google",
      stage: "scored",
      niche: clip(data.niche, 100),
      lead_score: data.total_score,
      estimated_value: 0,
      currency: "PKR",
      pain_point: clip(data.detected_weakness ?? data.target_problem, 4000),
      next_action: clip(data.suggested_next_action, 240),
      google_maps_url: clip(data.google_maps_url, 500),
      google_place_id: data.provider_place_id,
      notes,
      owner_id: user.id,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (insertError || !lead) return { outcome: "failed" as const, businessName };

  try {
    await rememberDecision({ supabase, workspaceId: workspace.id, placeId: data.provider_place_id, decision: "approved", leadId: lead.id, userId: user.id });
  } catch {
    await supabase.from("leads").delete().eq("id", lead.id).eq("workspace_id", workspace.id);
    return { outcome: "failed" as const, businessName };
  }

  const { error: updateError } = await supabase
    .from("lead_finder_results")
    .update({ status: "approved", lead_id: lead.id, decided_at: new Date().toISOString() })
    .eq("id", data.id)
    .eq("workspace_id", workspace.id);
  if (updateError) return { outcome: "failed" as const, businessName };
  return { outcome: "approved" as const, businessName };
}

export async function approveFinderResult(formData: FormData) {
  const id = idSchema.safeParse(value(formData, "id"));
  if (!id.success) finderRedirect("error", "Invalid discovery result.");
  const result = await approveResult(await requireWorkspace(), id.data);
  if (result.outcome === "approved") done(`${result.businessName} approved into the Lead Engine.`);
  if (result.outcome === "duplicate") done(`${result.businessName} already exists and was marked duplicate.`);
  if (result.outcome === "not_ready") finderRedirect("error", "Analyze this opportunity before approving it.");
  finderRedirect("error", `Orbit could not approve ${result.businessName}.`);
}

export async function approveSelectedFinderResults(formData: FormData) {
  const ids = Array.from(new Set(formData.getAll("ids").map(String).filter((item) => idSchema.safeParse(item).success))).slice(0, 100);
  if (!ids.length) finderRedirect("error", "Select at least one analyzed lead first.");
  const context = await requireWorkspace();
  let approved = 0;
  let duplicates = 0;
  let skipped = 0;
  for (const id of ids) {
    const result = await approveResult(context, id);
    if (result.outcome === "approved") approved += 1;
    else if (result.outcome === "duplicate") duplicates += 1;
    else skipped += 1;
  }
  done(`${approved} selected leads added to the Lead Engine. ${duplicates} duplicates and ${skipped} unavailable records skipped.`);
}

export async function rejectFinderResult(formData: FormData) {
  const id = idSchema.safeParse(value(formData, "id"));
  if (!id.success) finderRedirect("error", "Invalid discovery result.");
  const { supabase, user, workspace } = await requireWorkspace();
  const { data, error: fetchError } = await supabase
    .from("lead_finder_results")
    .select("id,provider_place_id,status")
    .eq("id", id.data)
    .eq("workspace_id", workspace.id)
    .single();
  if (fetchError || !data) finderRedirect("error", "Discovery result not found.");
  if (data.status === "approved") finderRedirect("error", "An approved opportunity cannot be rejected here.");
  try {
    await rememberDecision({ supabase, workspaceId: workspace.id, placeId: data.provider_place_id, decision: "rejected", leadId: null, userId: user.id });
  } catch {
    finderRedirect("error", "Orbit could not preserve this rejection decision.");
  }
  const { error } = await supabase.from("lead_finder_results").update({ status: "rejected", decided_at: new Date().toISOString() }).eq("id", data.id).eq("workspace_id", workspace.id);
  if (error) finderRedirect("error", "Orbit could not reject this opportunity.");
  done("Opportunity rejected. Orbit will remember the Google Place ID.");
}
