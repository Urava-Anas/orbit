import { NextResponse } from "next/server";
import { getGeoapifyApiKey } from "@/lib/geoapify";
import { requireWorkspace } from "@/lib/workspace";

type GeoapifyAutocompleteResult = {
  place_id?: string;
  formatted?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  district?: string;
  county?: string;
  state?: string;
  country?: string;
  result_type?: string;
  lat?: number;
  lon?: number;
};

type AutocompleteQuota = {
  allowed: boolean;
  remaining: number;
  resetAt: string;
};

type WorkspaceContext = Awaited<ReturnType<typeof requireWorkspace>>;

function normalizeQuery(value: string | null) {
  return (value ?? "").trim().replace(/\s+/g, " ").slice(0, 120);
}

function secondaryLabel(result: GeoapifyAutocompleteResult, label: string) {
  const parts = [result.city, result.district, result.county, result.state, result.country]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));
  const unique = Array.from(new Set(parts));
  const secondary = unique.join(" · ");
  return secondary && secondary.toLowerCase() !== label.toLowerCase() ? secondary : null;
}

function quotaHeaders(quota: AutocompleteQuota) {
  return {
    "X-RateLimit-Remaining": String(quota.remaining),
    "X-RateLimit-Reset": quota.resetAt,
  };
}

async function consumeAutocompleteQuota(
  supabase: WorkspaceContext["supabase"],
  workspaceId: string,
): Promise<AutocompleteQuota | null> {
  const { data, error } = await supabase.rpc("consume_lead_autocomplete_rate_limit", {
    p_workspace_id: workspaceId,
    p_limit: 60,
    p_window_seconds: 60,
  });
  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row) return null;
  return {
    allowed: row.allowed === true,
    remaining: Math.max(0, Number(row.remaining ?? 0)),
    resetAt: String(row.reset_at ?? new Date(Date.now() + 60_000).toISOString()),
  };
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const kind = requestUrl.searchParams.get("kind");
  const query = normalizeQuery(requestUrl.searchParams.get("q"));

  if (kind !== "place") {
    return NextResponse.json({ suggestions: [] }, { status: 400 });
  }
  if (query.length < 2) {
    return NextResponse.json({ suggestions: [] }, { headers: { "Cache-Control": "private, no-store" } });
  }

  const { workspace, supabase } = await requireWorkspace();
  const quota = await consumeAutocompleteQuota(supabase, workspace.id);
  if (!quota) {
    return NextResponse.json(
      { suggestions: [], error: "Place suggestion quota service unavailable." },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  if (!quota.allowed) {
    return NextResponse.json(
      { suggestions: [], error: "Too many place searches. Try again shortly." },
      { status: 429, headers: { "Cache-Control": "private, no-store", ...quotaHeaders(quota) } },
    );
  }

  let apiKey: string;
  try {
    apiKey = await getGeoapifyApiKey(workspace.id);
  } catch {
    return NextResponse.json(
      { suggestions: [], error: "Geoapify plugin connection required." },
      { status: 409, headers: { "Cache-Control": "private, no-store", ...quotaHeaders(quota) } },
    );
  }

  const geoUrl = new URL("https://api.geoapify.com/v1/geocode/autocomplete");
  geoUrl.searchParams.set("text", query);
  geoUrl.searchParams.set("type", "locality");
  geoUrl.searchParams.set("format", "json");
  geoUrl.searchParams.set("limit", "8");
  geoUrl.searchParams.set("lang", "en");
  geoUrl.searchParams.set("apiKey", apiKey);

  try {
    const response = await fetch(geoUrl, {
      method: "GET",
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      return NextResponse.json(
        { suggestions: [], error: "Place search provider unavailable." },
        { status: 502, headers: { "Cache-Control": "private, no-store", ...quotaHeaders(quota) } },
      );
    }

    const payload = (await response.json()) as { results?: GeoapifyAutocompleteResult[] };
    const seen = new Set<string>();
    const suggestions = (payload.results ?? [])
      .map((result) => {
        const label = result.formatted?.trim() || result.address_line1?.trim() || result.city?.trim() || "";
        if (!label) return null;
        const key = label.toLowerCase();
        if (seen.has(key)) return null;
        seen.add(key);
        const coordinateId = typeof result.lat === "number" && typeof result.lon === "number"
          ? `${result.lat},${result.lon}`
          : label;
        return {
          id: result.place_id ?? coordinateId,
          label,
          secondary: secondaryLabel(result, label),
        };
      })
      .filter((item): item is { id: string; label: string; secondary: string | null } => Boolean(item))
      .slice(0, 8);

    return NextResponse.json(
      { suggestions },
      { headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", ...quotaHeaders(quota) } },
    );
  } catch {
    return NextResponse.json(
      { suggestions: [], error: "Place suggestions timed out." },
      { status: 504, headers: { "Cache-Control": "private, no-store", ...quotaHeaders(quota) } },
    );
  }
}
