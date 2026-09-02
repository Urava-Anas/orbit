import "server-only";

import { CarrierPublicSourceError } from "./transportation-data";

const SAFER_ORIGIN = "https://safer.fmcsa.dot.gov";
const SAFER_TIMEOUT_MS = 8_000;
const MAX_HTML_BYTES = 750_000;

function htmlToSearchableText(html: string) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchSaferSnapshotText(queryParam: "USDOT" | "MC_MX", queryString: string) {
  const url = new URL("/query.asp", SAFER_ORIGIN);
  url.searchParams.set("searchtype", "ANY");
  url.searchParams.set("query_type", "queryCarrierSnapshot");
  url.searchParams.set("query_param", queryParam);
  url.searchParams.set("query_string", queryString);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "Orbit Carrier Intelligence/1.0 (Apex internal carrier verification)",
      },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(SAFER_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new CarrierPublicSourceError("SAFER verification timed out.", "source_timeout");
    }
    throw new CarrierPublicSourceError("SAFER verification could not be reached.", "source_unavailable");
  }

  if (!response.ok) {
    throw new CarrierPublicSourceError(
      `SAFER verification returned HTTP ${response.status}.`,
      "source_unavailable",
    );
  }

  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_HTML_BYTES) {
    throw new CarrierPublicSourceError("SAFER response exceeded the lookup limit.", "source_response_too_large");
  }

  const html = await response.text();
  if (html.length > MAX_HTML_BYTES) {
    throw new CarrierPublicSourceError("SAFER response exceeded the lookup limit.", "source_response_too_large");
  }

  return htmlToSearchableText(html);
}

export type SaferMcResolution =
  | { status: "resolved"; mcNumber: string; dotNumber: string; sourceReference: string }
  | { status: "not_found"; mcNumber: string }
  | { status: "invalid_source"; mcNumber: string; reason: string };

/**
 * Narrow fallback: resolve an MC docket to the USDOT number displayed by the
 * official SAFER Company Snapshot. We intentionally do not treat arbitrary page
 * text as a full Carrier 360 source; richer SAFER normalization gets a separate
 * schema/fixture before use.
 */
export async function resolveSaferMcToDot(mcNumber: string): Promise<SaferMcResolution> {
  if (!/^\d{1,10}$/.test(mcNumber)) {
    return { status: "invalid_source", mcNumber, reason: "MC number is invalid." };
  }

  const text = await fetchSaferSnapshotText("MC_MX", mcNumber);
  const match = text.match(/USDOT\s+Number:\s*([0-9]{1,10})\b/i);
  if (!match) {
    // SAFER renders a search/no-result page when an identifier is unknown. We do
    // not infer nonexistence from any other text on the page.
    return { status: "not_found", mcNumber };
  }

  return {
    status: "resolved",
    mcNumber,
    dotNumber: match[1],
    sourceReference: `SAFER Company Snapshot · MC ${mcNumber}`,
  };
}
