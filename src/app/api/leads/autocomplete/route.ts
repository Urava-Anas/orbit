import { NextResponse } from "next/server";
import { getGeoapifyApiKey } from "@/lib/geoapify";
import { consumeRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
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

  const { workspace, user } = await requireWorkspace();
  const quota = await consumeRateLimit({
    scope: "lead.autocomplete",
    subject: `${workspace.id}:${user.id}`,
    limit: 60,
    windowSeconds: 60,
  });
  if (!quota.allowed) {
    return NextResponse.json(
      { suggestions: [], error: "Too many place searches. Try again shortly." },
      { status: 429, headers: { "Cache-Control": "private, no-store", ...rateLimitHeaders(quota) } },
    );
  }

  let apiKey: string;
  try {
    apiKey = await getGeoapifyApiKey(workspace.id);
  } catch {
    return NextResponse.json(
      { suggestions: [], error: "Geoapify plugin connection required." },
      { status: 409, headers: { "Cache-Control": "private, no-store", ...rateLimitHeaders(quota) } },
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
        { status: 502, headers: { "Cache-Control": "private, no-store", ...rateLimitHeaders(quota) } },
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
      { headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", ...rateLimitHeaders(quota) } },
    );
  } catch {
    return NextResponse.json(
      { suggestions: [], error: "Place suggestions timed out." },
      { status: 504, headers: { "Cache-Control": "private, no-store", ...rateLimitHeaders(quota) } },
    );
  }
}
