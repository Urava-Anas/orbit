"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireWorkspace } from "@/lib/workspace";

const idSchema = z.string().uuid();
const searchSchema = z.object({
  niche: z.string().trim().min(2).max(100),
  location: z.string().trim().min(2).max(160),
  targetProblem: z.string().trim().max(500),
  requestedCount: z.coerce.number().int().min(1).max(20),
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

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function optional(input: string | null | undefined) {
  return input?.trim() || null;
}

function finderRedirect(kind: "error" | "notice", message: string): never {
  redirect(`/dashboard/leads/finder?${kind}=${encodeURIComponent(message)}`);
}

function done(message: string): never {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/leads");
  revalidatePath("/dashboard/leads/finder");
  finderRedirect("notice", message);
}

function apiKey() {
  const key = process.env.GOOGLE_PLACES_API_KEY?.trim();
  if (!key) finderRedirect("error", "Google Places is not connected yet. Add GOOGLE_PLACES_API_KEY in Vercel.");
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
    ? `A public website exists, but conversion quality, proof, mobile UX and WhatsApp flow still need a manual audit${targetProblem ? ` against the target problem: ${targetProblem}` : ""}.`
    : `No public website was returned by Google Places. The business is likely dependent on Maps, social pages or direct messaging${targetProblem ? ` while the target problem is: ${targetProblem}` : ""}.`;
  const offer = hasWebsite
    ? "Conversion audit, proof system and WhatsApp lead-flow upgrade"
    : "Launch website, Google proof layer and WhatsApp enquiry system";
  const nextAction = hasPhone
    ? "Open the Google Maps profile, verify the weakness, then prepare a short PBIC-backed WhatsApp audit."
    : "Open the Google Maps profile and website, verify the weakness, then identify a lawful public contact channel.";
  const reason = `${niche} fit ${fit}/30; visible problem ${problem}/30; contactability ${contactability}/20; commercial signal ${commercial}/20. Google shows ${reviews} ratings${rating ? ` at ${rating.toFixed(1)}` : ""}.`;

  return { fit, problem, contactability, commercial, total, weakness, offer, nextAction, reason };
}

export async function searchPlaces(formData: FormData) {
  const parsed = searchSchema.safeParse({
    niche: value(formData, "niche"),
    location: value(formData, "location"),
    targetProblem: value(formData, "targetProblem"),
    requestedCount: value(formData, "requestedCount") || "10",
  });
  if (!parsed.success) finderRedirect("error", "Check the search brief and try again.");

  const { supabase, user, workspace } = await requireWorkspace();
  const key = apiKey();
  const queryText = `${parsed.data.niche} in ${parsed.data.location}`;

  await supabase
    .from("lead_finder_results")
    .delete()
    .eq("workspace_id", workspace.id)
    .lt("expires_at", new Date().toISOString());

  const { data: search, error: searchError } = await supabase
    .from("lead_finder_searches")
    .insert({
      workspace_id: workspace.id,
      query_text: queryText,
      niche: parsed.data.niche,
      location: parsed.data.location,
      target_problem: optional(parsed.data.targetProblem),
      requested_count: parsed.data.requestedCount,
      status: "running",
      created_by: user.id,
    })
    .select("id")
    .single();
  if (searchError || !search) finderRedirect("error", "Orbit could not create the discovery search.");

  try {
    const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.primaryType,places.businessStatus,places.googleMapsUri",
      },
      body: JSON.stringify({
        textQuery: queryText,
        maxResultCount: parsed.data.requestedCount,
        languageCode: "en",
        regionCode: "PK",
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      const body = (await response.text()).slice(0, 700);
      await supabase.from("lead_finder_searches").update({
        status: "failed",
        error_summary: `Google Places ${response.status}: ${body}`,
        completed_at: new Date().toISOString(),
      }).eq("id", search.id).eq("workspace_id", workspace.id);
      finderRedirect("error", "Google Places rejected the search. Check the API key, billing and Places API access.");
    }

    const payload = (await response.json()) as { places?: GooglePlace[] };
    const places = (payload.places ?? []).filter((place) => place.id && place.displayName?.text);
    const placeIds = places.map((place) => place.id as string);

    const [{ data: existingResults }, { data: existingLeads }] = await Promise.all([
      placeIds.length
        ? supabase.from("lead_finder_results").select("provider_place_id").eq("workspace_id", workspace.id).in("provider_place_id", placeIds)
        : Promise.resolve({ data: [] as { provider_place_id: string }[] }),
      placeIds.length
        ? supabase.from("leads").select("google_place_id").eq("workspace_id", workspace.id).in("google_place_id", placeIds)
        : Promise.resolve({ data: [] as { google_place_id: string | null }[] }),
    ]);

    const known = new Set([
      ...(existingResults ?? []).map((item) => item.provider_place_id),
      ...(existingLeads ?? []).map((item) => item.google_place_id).filter(Boolean) as string[],
    ]);
    const newPlaces = places.filter((place) => !known.has(place.id as string));

    if (newPlaces.length) {
      const { error: insertError } = await supabase.from("lead_finder_results").insert(
        newPlaces.map((place) => ({
          workspace_id: workspace.id,
          search_id: search.id,
          provider_place_id: place.id,
          business_name: place.displayName?.text,
          formatted_address: optional(place.formattedAddress),
          primary_type: optional(place.primaryType),
          business_status: optional(place.businessStatus),
          google_maps_url: optional(place.googleMapsUri),
          niche: parsed.data.niche,
          target_problem: optional(parsed.data.targetProblem),
          status: "new",
          created_by: user.id,
        })),
      );
      if (insertError) throw insertError;
    }

    await supabase.from("lead_finder_searches").update({
      status: "completed",
      result_count: places.length,
      completed_at: new Date().toISOString(),
    }).eq("id", search.id).eq("workspace_id", workspace.id);

    done(`${newPlaces.length} new opportunities found; ${places.length - newPlaces.length} known or duplicate businesses skipped.`);
  } catch (error) {
    await supabase.from("lead_finder_searches").update({
      status: "failed",
      error_summary: error instanceof Error ? error.message.slice(0, 1000) : "Unknown provider error",
      completed_at: new Date().toISOString(),
    }).eq("id", search.id).eq("workspace_id", workspace.id);
    finderRedirect("error", "Lead Finder could not complete this search.");
  }
}

export async function analyzeFinderResult(formData: FormData) {
  const id = idSchema.safeParse(value(formData, "id"));
  if (!id.success) finderRedirect("error", "Invalid discovery result.");
  const { supabase, workspace } = await requireWorkspace();
  const key = apiKey();

  const { data, error } = await supabase
    .from("lead_finder_results")
    .select("id, provider_place_id, business_name, formatted_address, primary_type, google_maps_url, niche, target_problem, status")
    .eq("id", id.data)
    .eq("workspace_id", workspace.id)
    .single();
  if (error || !data) finderRedirect("error", "Discovery result not found.");
  const result = data as FinderResult;
  if (["approved", "rejected", "duplicate"].includes(result.status)) finderRedirect("error", "This opportunity has already been decided.");

  const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(result.provider_place_id)}`, {
    headers: {
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "id,displayName,formattedAddress,nationalPhoneNumber,websiteUri,rating,userRatingCount,businessStatus,googleMapsUri,primaryType",
    },
    cache: "no-store",
  });
  if (!response.ok) finderRedirect("error", "Google Places could not enrich this business.");

  const place = (await response.json()) as GooglePlace;
  const score = calculateScore(place, result.niche, result.target_problem);
  const { error: updateError } = await supabase
    .from("lead_finder_results")
    .update({
      business_name: place.displayName?.text ?? result.business_name,
      formatted_address: optional(place.formattedAddress) ?? result.formatted_address,
      primary_type: optional(place.primaryType) ?? result.primary_type,
      business_status: optional(place.businessStatus),
      google_maps_url: optional(place.googleMapsUri) ?? result.google_maps_url,
      phone: optional(place.nationalPhoneNumber),
      website_url: optional(place.websiteUri),
      rating: place.rating ?? null,
      review_count: place.userRatingCount ?? null,
      fit_score: score.fit,
      problem_score: score.problem,
      contactability_score: score.contactability,
      commercial_score: score.commercial,
      total_score: score.total,
      score_reason: score.reason,
      detected_weakness: score.weakness,
      recommended_offer: score.offer,
      suggested_next_action: score.nextAction,
      status: "analyzed",
      analyzed_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    })
    .eq("id", result.id)
    .eq("workspace_id", workspace.id);
  if (updateError) finderRedirect("error", "Orbit could not save the opportunity analysis.");
  done(`${result.business_name} analyzed and scored.`);
}

export async function approveFinderResult(formData: FormData) {
  const id = idSchema.safeParse(value(formData, "id"));
  if (!id.success) finderRedirect("error", "Invalid discovery result.");
  const { supabase, user, workspace } = await requireWorkspace();

  const { data, error } = await supabase
    .from("lead_finder_results")
    .select("*")
    .eq("id", id.data)
    .eq("workspace_id", workspace.id)
    .single();
  if (error || !data) finderRedirect("error", "Discovery result not found.");
  if (data.status !== "analyzed") finderRedirect("error", "Analyze this opportunity before approving it.");

  const { data: duplicate } = await supabase
    .from("leads")
    .select("id")
    .eq("workspace_id", workspace.id)
    .eq("google_place_id", data.provider_place_id)
    .maybeSingle();
  if (duplicate) {
    await supabase.from("lead_finder_results").update({ status: "duplicate", lead_id: duplicate.id, decided_at: new Date().toISOString() }).eq("id", data.id).eq("workspace_id", workspace.id);
    done("This business already exists in the Lead Engine and was marked duplicate.");
  }

  const notes = [
    data.score_reason,
    data.formatted_address ? `Address: ${data.formatted_address}` : null,
    data.rating !== null ? `Google Maps rating signal: ${data.rating} from ${data.review_count ?? 0} ratings.` : null,
    `Discovered through Orbit Lead Finder. Google Place ID: ${data.provider_place_id}`,
  ].filter(Boolean).join("\n\n");

  const { data: lead, error: insertError } = await supabase
    .from("leads")
    .insert({
      workspace_id: workspace.id,
      name: data.business_name,
      company: data.business_name,
      phone: data.phone,
      whatsapp: data.phone,
      source: "google",
      stage: "scored",
      niche: data.niche,
      lead_score: data.total_score,
      estimated_value: 0,
      currency: "PKR",
      pain_point: data.detected_weakness ?? data.target_problem,
      next_action: data.suggested_next_action,
      google_maps_url: data.google_maps_url,
      google_place_id: data.provider_place_id,
      notes,
      owner_id: user.id,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (insertError || !lead) finderRedirect("error", "Orbit could not approve this opportunity into the Lead Engine.");

  await supabase.from("lead_finder_results").update({
    status: "approved",
    lead_id: lead.id,
    decided_at: new Date().toISOString(),
  }).eq("id", data.id).eq("workspace_id", workspace.id);

  done(`${data.business_name} approved into the Lead Engine.`);
}

export async function rejectFinderResult(formData: FormData) {
  const id = idSchema.safeParse(value(formData, "id"));
  if (!id.success) finderRedirect("error", "Invalid discovery result.");
  const { supabase, workspace } = await requireWorkspace();
  const { error } = await supabase
    .from("lead_finder_results")
    .update({ status: "rejected", decided_at: new Date().toISOString() })
    .eq("id", id.data)
    .eq("workspace_id", workspace.id)
    .neq("status", "approved");
  if (error) finderRedirect("error", "Orbit could not reject this opportunity.");
  done("Opportunity rejected. Orbit will remember the decision.");
}
