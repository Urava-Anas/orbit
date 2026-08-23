"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getGeoapifyApiKey } from "@/lib/geoapify";
import { enrichPublicBusinessContact } from "@/lib/lead-enrichment";
import { requireWorkspace } from "@/lib/workspace";

const PROVIDER = "geoapify" as const;
const idSchema = z.string().uuid();
const searchSchema = z.object({
  niches: z.string().trim().min(2).max(500),
  location: z.string().trim().min(2).max(160),
  targetProblem: z.string().trim().max(500),
  requestedCount: z.coerce.number().int().min(1).max(100),
  radiusKm: z.coerce.number().int().min(1).max(50),
  sortBy: z.enum(["relevance", "contactability", "name"]),
});

type GeoapifyFeature = {
  properties?: {
    place_id?: string;
    name?: string;
    formatted?: string;
    categories?: string[];
    lat?: number;
    lon?: number;
  };
  geometry?: { coordinates?: [number, number] };
};

type GeoapifyDetails = {
  feature_type?: string;
  place_id?: string;
  name?: string;
  formatted?: string;
  categories?: string[];
  lat?: number;
  lon?: number;
  website?: string;
  opening_hours?: string;
  brand?: string;
  contact?: { phone?: string; email?: string };
  operator_details?: { website?: string };
  brand_details?: { website?: string };
};

type LeadPlace = {
  id: string;
  name: string;
  formattedAddress: string | null;
  primaryType: string | null;
  mapUrl: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  contactPerson: string | null;
  contactRole: string | null;
  enrichmentStatus: "pending" | "enriched" | "partial" | "unresolved";
  enrichmentConfidence: number | null;
  enrichmentSource: string | null;
  openingHours: string | null;
  brand: string | null;
  lat: number | null;
  lon: number | null;
};

type FinderResult = {
  id: string;
  provider: string;
  provider_place_id: string;
  business_name: string;
  formatted_address: string | null;
  primary_type: string | null;
  google_maps_url: string | null;
  phone: string | null;
  email: string | null;
  website_url: string | null;
  niche: string;
  target_problem: string | null;
  status: string;
};

type WorkspaceContext = Awaited<ReturnType<typeof requireWorkspace>>;
type PlaceCandidate = { place: LeadPlace; niche: string };

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

function categoryKeys(niche: string) {
  const text = niche.toLowerCase();
  if (/restaurant|fast food|food court|dining|pizza|burger|biryani|bbq/.test(text)) return ["catering.restaurant", "catering.fast_food"];
  if (/cafe|coffee|tea shop/.test(text)) return ["catering.cafe"];
  if (/hotel|guest house|motel|lodging/.test(text)) return ["accommodation"];
  if (/real estate|property|estate agent|realtor/.test(text)) return ["office.estate_agent"];
  if (/immigration|visa|consultant|consultancy|business consultant/.test(text)) return ["office.consulting"];
  if (/lawyer|law firm|legal|attorney/.test(text)) return ["office.lawyer"];
  if (/accountant|accounting|tax advisor/.test(text)) return ["office.accountant"];
  if (/marketing|advertising|creative agency|media agency/.test(text)) return ["office.advertising_agency"];
  if (/software|web development|it company|technology|tech company/.test(text)) return ["office.it"];
  if (/travel|tour operator|tour agency/.test(text)) return ["office.travel_agent"];
  if (/school|college|university|academy|education|training institute/.test(text)) return ["education"];
  if (/hospital|clinic|doctor|dentist|pharmacy|medical|healthcare/.test(text)) return ["healthcare"];
  if (/gym|fitness|sports club|yoga/.test(text)) return ["sport"];
  if (/shop|store|retail|supermarket|grocery|clothing|electronics|salon|barber|beauty/.test(text)) return ["commercial"];
  return ["office", "commercial", "service"];
}

function osmUrl(lat: number | null, lon: number | null) {
  if (lat === null || lon === null) return null;
  return `https://www.openstreetmap.org/?mlat=${encodeURIComponent(String(lat))}&mlon=${encodeURIComponent(String(lon))}#map=18/${lat}/${lon}`;
}

function basePlace(feature: GeoapifyFeature): LeadPlace | null {
  const properties = feature.properties;
  const id = properties?.place_id;
  const name = properties?.name;
  if (!id || !name) return null;
  const lon = typeof properties.lon === "number" ? properties.lon : feature.geometry?.coordinates?.[0] ?? null;
  const lat = typeof properties.lat === "number" ? properties.lat : feature.geometry?.coordinates?.[1] ?? null;
  return {
    id,
    name,
    formattedAddress: optional(properties.formatted),
    primaryType: properties.categories?.[0] ?? null,
    mapUrl: osmUrl(lat, lon),
    phone: null,
    email: null,
    website: null,
    contactPerson: null,
    contactRole: null,
    enrichmentStatus: "pending",
    enrichmentConfidence: null,
    enrichmentSource: null,
    openingHours: null,
    brand: null,
    lat,
    lon,
  };
}

function mergeDetails(place: LeadPlace, details: GeoapifyDetails | null): LeadPlace {
  if (!details) return place;
  const lat = typeof details.lat === "number" ? details.lat : place.lat;
  const lon = typeof details.lon === "number" ? details.lon : place.lon;
  return {
    ...place,
    name: details.name?.trim() || place.name,
    formattedAddress: optional(details.formatted) ?? place.formattedAddress,
    primaryType: details.categories?.[0] ?? place.primaryType,
    mapUrl: osmUrl(lat, lon) ?? place.mapUrl,
    phone: optional(details.contact?.phone),
    email: optional(details.contact?.email),
    website: optional(details.website) ?? optional(details.operator_details?.website) ?? optional(details.brand_details?.website),
    openingHours: optional(details.opening_hours),
    brand: optional(details.brand),
    lat,
    lon,
  };
}

function calculateScore(place: LeadPlace, niche: string, targetProblem: string | null) {
  const fit = 30;
  const hasWebsite = Boolean(place.website);
  const hasPhone = Boolean(place.phone);
  const hasEmail = Boolean(place.email);
  const problem = hasWebsite ? 12 : 30;
  const contactability = Math.min(20, (hasPhone ? 10 : 0) + (hasEmail ? 6 : 0) + (hasWebsite ? 4 : 0));
  const commercial = Math.min(20, 6 + (place.openingHours ? 4 : 0) + (place.brand ? 4 : 0) + (hasWebsite ? 3 : 0) + (hasPhone || hasEmail ? 3 : 0));
  const total = fit + problem + contactability + commercial;
  const weakness = hasWebsite
    ? `A public website exists, but conversion quality, proof, mobile UX and enquiry flow still need a manual audit${targetProblem ? ` against the target problem: ${targetProblem}` : ""}.`
    : `No public website was returned by Geoapify. The business may depend on listings, social pages or direct messaging${targetProblem ? ` while the target problem is: ${targetProblem}` : ""}.`;
  const offer = hasWebsite
    ? "Conversion audit, proof system and enquiry-flow upgrade"
    : "Launch website, local proof layer and enquiry system";
  const nextAction = hasPhone || hasEmail
    ? "Verify the visible opportunity, then prepare one concise personalised outreach message using an approved public contact channel."
    : "Review the business profile, verify the opportunity, then identify a lawful public contact channel.";
  const signals = [hasPhone ? "phone" : null, hasEmail ? "email" : null, hasWebsite ? "website" : null, place.openingHours ? "hours" : null].filter(Boolean);
  const reason = `${niche} fit ${fit}/30; visible problem ${problem}/30; contactability ${contactability}/20; commercial signal ${commercial}/20. Geoapify returned ${signals.length ? signals.join(", ") : "basic place data only"}.`;
  return { fit, problem, contactability, commercial, total, weakness, offer, nextAction, reason };
}

async function resolveLocation(key: string, location: string) {
  const url = new URL("https://api.geoapify.com/v1/geocode/search");
  url.searchParams.set("text", location);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  url.searchParams.set("apiKey", key);
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error(`Geoapify geocoding ${response.status}`);
  const payload = (await response.json()) as { results?: Array<{ lat?: number; lon?: number }> };
  const center = payload.results?.[0];
  if (typeof center?.lat !== "number" || typeof center?.lon !== "number") return null;
  return { lat: center.lat, lon: center.lon };
}

async function searchCategory(key: string, categories: string[], center: { lat: number; lon: number }, radiusKm: number, limit: number) {
  const url = new URL("https://api.geoapify.com/v2/places");
  url.searchParams.set("categories", categories.join(","));
  url.searchParams.set("filter", `circle:${center.lon},${center.lat},${Math.round(radiusKm * 1000)}`);
  url.searchParams.set("bias", `proximity:${center.lon},${center.lat}`);
  url.searchParams.set("limit", String(Math.max(1, Math.min(500, limit))));
  url.searchParams.set("lang", "en");
  url.searchParams.set("apiKey", key);
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`Geoapify Places ${response.status}: ${(await response.text()).slice(0, 500)}`);
  const payload = (await response.json()) as { features?: GeoapifyFeature[] };
  return payload.features ?? [];
}

async function placeDetails(key: string, placeId: string) {
  const url = new URL("https://api.geoapify.com/v2/place-details");
  url.searchParams.set("id", placeId);
  url.searchParams.set("features", "details");
  url.searchParams.set("lang", "en");
  url.searchParams.set("apiKey", key);
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(12_000) });
  if (!response.ok) return null;
  const payload = (await response.json()) as { features?: Array<{ properties?: GeoapifyDetails }> };
  return payload.features?.find((feature) => feature.properties?.feature_type === "details")?.properties ?? payload.features?.[0]?.properties ?? null;
}

async function enrichCandidates(key: string, candidates: PlaceCandidate[]) {
  const enriched: PlaceCandidate[] = [];
  for (let index = 0; index < candidates.length; index += 5) {
    const batch = candidates.slice(index, index + 5);
    const values = await Promise.all(batch.map(async (candidate) => {
      try {
        const detailed = mergeDetails(candidate.place, await placeDetails(key, candidate.place.id));
        const contact = await enrichPublicBusinessContact({ website: detailed.website, phone: detailed.phone, email: detailed.email });
        return {
          ...candidate,
          place: {
            ...detailed,
            phone: contact.phone ?? detailed.phone,
            email: contact.email ?? detailed.email,
            website: contact.website ?? detailed.website,
            contactPerson: contact.contactPerson,
            contactRole: contact.contactRole,
            enrichmentStatus: contact.status,
            enrichmentConfidence: contact.confidence,
            enrichmentSource: contact.source,
          },
        };
      } catch {
        return { ...candidate, place: { ...candidate.place, enrichmentStatus: "unresolved" as const, enrichmentConfidence: 0, enrichmentSource: "none" } };
      }
    }));
    enriched.push(...values);
  }
  return enriched;
}

function contactability(place: LeadPlace) {
  return (place.phone ? 3 : 0) + (place.email ? 2 : 0) + (place.website ? 1 : 0);
}

function sortCandidates(candidates: PlaceCandidate[], sortBy: string) {
  if (sortBy === "contactability") return [...candidates].sort((a, b) => contactability(b.place) - contactability(a.place));
  if (sortBy === "name") return [...candidates].sort((a, b) => a.place.name.localeCompare(b.place.name));
  return candidates;
}

async function rememberDecision({ supabase, workspaceId, provider, placeId, decision, leadId, userId }: {
  supabase: WorkspaceContext["supabase"];
  workspaceId: string;
  provider: string;
  placeId: string;
  decision: "approved" | "rejected" | "duplicate";
  leadId: string | null;
  userId: string;
}) {
  const { error } = await supabase.from("lead_finder_place_memory").upsert(
    {
      workspace_id: workspaceId,
      provider,
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
    sortBy: value(formData, "sortBy") || "relevance",
  });
  if (!parsed.success) finderRedirect("error", "Check the search brief and try again.");

  const niches = parseNiches(parsed.data.niches);
  if (!niches.length) finderRedirect("error", "Add at least one valid niche.");

  const hasWebsite = checked(formData, "hasWebsite");
  const hasPhone = checked(formData, "hasPhone");
  const hasEmail = checked(formData, "hasEmail");
  const { supabase, user, workspace } = await requireWorkspace();
  let key: string;
  try {
    key = await getGeoapifyApiKey(workspace.id);
  } catch (error) {
    finderRedirect("error", error instanceof Error ? error.message : "Connect Geoapify in Plugins first.");
  }
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
      provider: PROVIDER,
      requested_count: parsed.data.requestedCount,
      status: "running",
      created_by: user.id,
    })
    .select("id")
    .single();
  if (searchError || !search) finderRedirect("error", "Orbit could not create the discovery search.");

  let completionMessage = "Lead Finder search completed.";
  try {
    const center = await resolveLocation(key, parsed.data.location);
    if (!center) throw new Error("Geoapify could not resolve the requested place.");

    const candidateTarget = Math.min(250, Math.max(parsed.data.requestedCount, parsed.data.requestedCount * 2));
    const candidates: PlaceCandidate[] = [];
    const seenInSearch = new Set<string>();

    for (const niche of niches) {
      if (candidates.length >= candidateTarget) break;
      const remaining = candidateTarget - candidates.length;
      const features = await searchCategory(key, categoryKeys(niche), center, parsed.data.radiusKm, Math.min(150, remaining));
      for (const feature of features) {
        const place = basePlace(feature);
        if (!place || seenInSearch.has(place.id)) continue;
        seenInSearch.add(place.id);
        candidates.push({ place, niche });
        if (candidates.length >= candidateTarget) break;
      }
    }

    const placeIds = candidates.map((item) => item.place.id);
    let existingResults: { provider_place_id: string }[] = [];
    let existingLeads: { provider_place_id: string | null }[] = [];
    let rememberedPlaces: { provider_place_id: string }[] = [];

    if (placeIds.length) {
      const [resultsQuery, leadsQuery, memoryQuery] = await Promise.all([
        supabase.from("lead_finder_results").select("provider_place_id").eq("workspace_id", workspace.id).eq("provider", PROVIDER).in("provider_place_id", placeIds),
        supabase.from("leads").select("provider_place_id").eq("workspace_id", workspace.id).eq("lead_provider", PROVIDER).in("provider_place_id", placeIds),
        supabase.from("lead_finder_place_memory").select("provider_place_id").eq("workspace_id", workspace.id).eq("provider", PROVIDER).in("provider_place_id", placeIds),
      ]);
      if (resultsQuery.error || leadsQuery.error || memoryQuery.error) throw new Error("Orbit could not check duplicate Geoapify Place IDs.");
      existingResults = resultsQuery.data ?? [];
      existingLeads = leadsQuery.data ?? [];
      rememberedPlaces = memoryQuery.data ?? [];
    }

    const known = new Set([
      ...existingResults.map((item) => item.provider_place_id),
      ...existingLeads.map((item) => item.provider_place_id).filter((id): id is string => Boolean(id)),
      ...rememberedPlaces.map((item) => item.provider_place_id),
    ]);

    const freshBase = candidates.filter((item) => !known.has(item.place.id));
    const enriched = await enrichCandidates(key, freshBase);
    const filtered = enriched.filter(({ place }) => {
      if (hasWebsite && !place.website) return false;
      if (hasPhone && !place.phone) return false;
      if (hasEmail && !place.email) return false;
      return true;
    });
    const freshCandidates = sortCandidates(filtered, parsed.data.sortBy).slice(0, parsed.data.requestedCount);

    if (freshCandidates.length) {
      const rows = freshCandidates.map(({ place, niche }) => {
        const score = calculateScore(place, niche, targetProblem);
        return {
          workspace_id: workspace.id,
          search_id: search.id,
          provider: PROVIDER,
          provider_place_id: place.id,
          business_name: place.name.slice(0, 200),
          formatted_address: clip(place.formattedAddress, 500),
          primary_type: clip(place.primaryType, 120),
          business_status: "listed",
          google_maps_url: clip(place.mapUrl, 1000),
          website_url: clip(place.website, 1000),
          phone: clip(place.phone, 60),
          email: clip(place.email, 254),
          contact_person: clip(place.contactPerson, 120),
          contact_role: clip(place.contactRole, 120),
          enrichment_status: place.enrichmentStatus,
          enrichment_confidence: place.enrichmentConfidence,
          enrichment_source: clip(place.enrichmentSource, 120),
          enriched_at: new Date().toISOString(),
          rating: null,
          review_count: null,
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
    completionMessage = `${freshCandidates.length} review-ready local leads found within about ${parsed.data.radiusKm} km of ${parsed.data.location}. ${skipped} known or filtered businesses skipped.`;
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
    finderRedirect("error", "Lead Finder could not complete the Geoapify search. Check the plugin connection and try again.");
  }

  done(completionMessage);
}

export async function analyzeFinderResult(formData: FormData) {
  const id = idSchema.safeParse(value(formData, "id"));
  if (!id.success) finderRedirect("error", "Invalid discovery result.");
  const { supabase, workspace } = await requireWorkspace();
  const { data, error } = await supabase
    .from("lead_finder_results")
    .select("id,provider,provider_place_id,business_name,formatted_address,primary_type,google_maps_url,phone,email,website_url,niche,target_problem,status")
    .eq("id", id.data)
    .eq("workspace_id", workspace.id)
    .single();
  if (error || !data) finderRedirect("error", "Discovery result not found.");
  const result = data as FinderResult;
  if (["approved", "rejected", "duplicate"].includes(result.status)) finderRedirect("error", "This opportunity has already been decided.");
  if (result.provider !== PROVIDER) finderRedirect("error", "This is a legacy provider result and cannot be refreshed through Geoapify.");

  let key: string;
  try {
    key = await getGeoapifyApiKey(workspace.id);
  } catch {
    finderRedirect("error", "Connect and enable Geoapify in Plugins first.");
  }

  const details = await placeDetails(key, result.provider_place_id);
  const merged = mergeDetails({
    id: result.provider_place_id,
    name: result.business_name,
    formattedAddress: result.formatted_address,
    primaryType: result.primary_type,
    mapUrl: result.google_maps_url,
    phone: result.phone,
    email: result.email,
    website: result.website_url,
    contactPerson: null,
    contactRole: null,
    enrichmentStatus: "pending",
    enrichmentConfidence: null,
    enrichmentSource: null,
    openingHours: null,
    brand: null,
    lat: null,
    lon: null,
  }, details);
  const contact = await enrichPublicBusinessContact({ website: merged.website, phone: merged.phone, email: merged.email });
  const enrichedMerged: LeadPlace = {
    ...merged,
    phone: contact.phone ?? merged.phone,
    email: contact.email ?? merged.email,
    website: contact.website ?? merged.website,
    contactPerson: contact.contactPerson,
    contactRole: contact.contactRole,
    enrichmentStatus: contact.status,
    enrichmentConfidence: contact.confidence,
    enrichmentSource: contact.source,
  };
  const score = calculateScore(enrichedMerged, result.niche, result.target_problem);
  const { error: updateError } = await supabase
    .from("lead_finder_results")
    .update({
      business_name: enrichedMerged.name.slice(0, 200),
      formatted_address: clip(enrichedMerged.formattedAddress, 500),
      primary_type: clip(enrichedMerged.primaryType, 120),
      google_maps_url: clip(enrichedMerged.mapUrl, 1000),
      phone: clip(enrichedMerged.phone, 60),
      email: clip(enrichedMerged.email, 254),
      website_url: clip(enrichedMerged.website, 1000),
      contact_person: clip(enrichedMerged.contactPerson, 120),
      contact_role: clip(enrichedMerged.contactRole, 120),
      enrichment_status: enrichedMerged.enrichmentStatus,
      enrichment_confidence: enrichedMerged.enrichmentConfidence,
      enrichment_source: clip(enrichedMerged.enrichmentSource, 120),
      enriched_at: new Date().toISOString(),
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
  const { data: fetched, error } = await supabase.from("lead_finder_results").select("*").eq("id", id).eq("workspace_id", workspace.id).single();
  let data = fetched;
  if (error || !data) return { outcome: "failed" as const, businessName: "Lead" };
  if (data.status === "approved") return { outcome: "approved" as const, businessName: data.business_name };
  if (data.status !== "analyzed") return { outcome: "not_ready" as const, businessName: data.business_name };

  if (data.provider === PROVIDER && !data.enriched_at) {
    const contact = await enrichPublicBusinessContact({ website: data.website_url, phone: data.phone, email: data.email });
    const enrichmentPatch = {
      phone: clip(contact.phone, 60),
      email: clip(contact.email, 254),
      website_url: clip(contact.website, 1000),
      contact_person: clip(contact.contactPerson, 120),
      contact_role: clip(contact.contactRole, 120),
      enrichment_status: contact.status,
      enrichment_confidence: contact.confidence,
      enrichment_source: clip(contact.source, 120),
      enriched_at: new Date().toISOString(),
    };
    const { error: enrichmentError } = await supabase.from("lead_finder_results").update(enrichmentPatch).eq("id", data.id).eq("workspace_id", workspace.id);
    if (enrichmentError) return { outcome: "failed" as const, businessName: data.business_name };
    data = { ...data, ...enrichmentPatch };
  }

  let duplicate: { id: string } | null = null;
  if (data.provider === "google_places") {
    const result = await supabase
      .from("leads")
      .select("id")
      .eq("workspace_id", workspace.id)
      .eq("google_place_id", data.provider_place_id)
      .maybeSingle();
    duplicate = result.data;
  } else {
    const result = await supabase
      .from("leads")
      .select("id")
      .eq("workspace_id", workspace.id)
      .eq("lead_provider", data.provider)
      .eq("provider_place_id", data.provider_place_id)
      .maybeSingle();
    duplicate = result.data;
  }

  if (duplicate) {
    await Promise.all([
      supabase.from("lead_finder_results").update({ status: "duplicate", lead_id: duplicate.id, decided_at: new Date().toISOString() }).eq("id", data.id).eq("workspace_id", workspace.id),
      rememberDecision({ supabase, workspaceId: workspace.id, provider: data.provider, placeId: data.provider_place_id, decision: "duplicate", leadId: duplicate.id, userId: user.id }),
    ]);
    return { outcome: "duplicate" as const, businessName: data.business_name };
  }

  const businessName = String(data.business_name).slice(0, 160);
  const providerLabel = data.provider === "google_places" ? "Google Places" : "Geoapify";
  const notes = [
    data.score_reason,
    data.formatted_address ? `Address: ${data.formatted_address}` : null,
    data.contact_person ? `Decision maker: ${data.contact_person}${data.contact_role ? ` · ${data.contact_role}` : ""}` : "Decision maker: not publicly verified",
    `Discovered through Orbit Lead Finder. ${providerLabel} Place ID: ${data.provider_place_id}`,
  ].filter(Boolean).join("\n\n").slice(0, 4000);

  const { data: lead, error: insertError } = await supabase
    .from("leads")
    .insert({
      workspace_id: workspace.id,
      name: businessName,
      company: businessName,
      email: clip(data.email, 254),
      phone: clip(data.phone, 40),
      whatsapp: clip(data.phone, 40),
      contact_person: clip(data.contact_person, 120),
      contact_role: clip(data.contact_role, 120),
      website_url: clip(data.website_url, 1000),
      enrichment_status: data.enrichment_status ?? "unresolved",
      enrichment_confidence: data.enrichment_confidence,
      enrichment_source: clip(data.enrichment_source, 120),
      enriched_at: data.enriched_at ?? new Date().toISOString(),
      source: data.provider === "google_places" ? "google" : "local_search",
      stage: "scored",
      niche: clip(data.niche, 100),
      lead_score: data.total_score,
      estimated_value: 0,
      currency: "PKR",
      pain_point: clip(data.detected_weakness ?? data.target_problem, 4000),
      next_action: clip(data.suggested_next_action, 240),
      google_maps_url: clip(data.google_maps_url, 500),
      google_place_id: data.provider === "google_places" ? data.provider_place_id : null,
      lead_provider: data.provider,
      provider_place_id: data.provider_place_id,
      notes,
      owner_id: user.id,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (insertError || !lead) return { outcome: "failed" as const, businessName };

  try {
    await rememberDecision({ supabase, workspaceId: workspace.id, provider: data.provider, placeId: data.provider_place_id, decision: "approved", leadId: lead.id, userId: user.id });
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
    .select("id,provider,provider_place_id,status")
    .eq("id", id.data)
    .eq("workspace_id", workspace.id)
    .single();
  if (fetchError || !data) finderRedirect("error", "Discovery result not found.");
  if (data.status === "approved") finderRedirect("error", "An approved opportunity cannot be rejected here.");
  try {
    await rememberDecision({ supabase, workspaceId: workspace.id, provider: data.provider, placeId: data.provider_place_id, decision: "rejected", leadId: null, userId: user.id });
  } catch {
    finderRedirect("error", "Orbit could not preserve this rejection decision.");
  }
  const { error } = await supabase.from("lead_finder_results").update({ status: "rejected", decided_at: new Date().toISOString() }).eq("id", data.id).eq("workspace_id", workspace.id);
  if (error) finderRedirect("error", "Orbit could not reject this opportunity.");
  done(`Opportunity rejected. Orbit will remember the ${data.provider === "google_places" ? "Google" : "Geoapify"} Place ID.`);
}
