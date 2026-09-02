import "server-only";

import type { FmcsaCompanyCensusRecord } from "./company-census";
import {
  FREE_CARRIER_SOURCE_REGISTRY,
  type FreeCarrierSourceKey,
} from "./sources";

const TRANSPORTATION_DATA_ORIGIN = "https://data.transportation.gov";
const DEFAULT_TIMEOUT_MS = 8_000;
const MAX_RESPONSE_BYTES = 1_000_000;
const MAX_ROWS = 10;

type PublicDatasetFilter = Record<string, string>;

export class CarrierPublicSourceError extends Error {
  constructor(
    message: string,
    readonly code:
      | "source_not_queryable"
      | "source_timeout"
      | "source_unavailable"
      | "source_invalid_response"
      | "source_response_too_large",
  ) {
    super(message);
    this.name = "CarrierPublicSourceError";
  }
}

function queryableDatasetId(sourceKey: FreeCarrierSourceKey): string {
  const source = FREE_CARRIER_SOURCE_REGISTRY[sourceKey];
  if (!("datasetId" in source) || !source.datasetId) {
    throw new CarrierPublicSourceError(
      `${source.name} is not configured as a DOT open-data dataset.`,
      "source_not_queryable",
    );
  }
  return source.datasetId;
}

function validateFilterField(field: string) {
  if (!/^[a-z][a-z0-9_]{0,80}$/.test(field)) {
    throw new CarrierPublicSourceError(
      "Carrier public-source filter is invalid.",
      "source_not_queryable",
    );
  }
}

/**
 * Small on-demand lookup against the U.S. DOT public data portal.
 *
 * This is a bootstrap/fallback path, not the long-term national ingestion loop.
 * Daily bulk/delta ingestion should populate the Apex thin index so normal
 * dispatcher searches do not fan out to federal endpoints one carrier at a time.
 * No application token, commercial API key, or paid carrier-data dependency is
 * accepted here.
 */
export async function fetchTransportationDatasetRows<T extends Record<string, unknown>>(
  sourceKey: FreeCarrierSourceKey,
  filters: PublicDatasetFilter,
  limit = 2,
): Promise<T[]> {
  const datasetId = queryableDatasetId(sourceKey);
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), MAX_ROWS);
  const url = new URL(`/resource/${datasetId}.json`, TRANSPORTATION_DATA_ORIGIN);
  url.searchParams.set("$limit", String(safeLimit));

  for (const [field, rawValue] of Object.entries(filters)) {
    validateFilterField(field);
    const value = rawValue.trim();
    if (!value || value.length > 160) {
      throw new CarrierPublicSourceError(
        "Carrier public-source filter value is invalid.",
        "source_not_queryable",
      );
    }
    url.searchParams.set(field, value);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new CarrierPublicSourceError(
        "The DOT public-data request timed out.",
        "source_timeout",
      );
    }
    throw new CarrierPublicSourceError(
      "The DOT public-data source could not be reached.",
      "source_unavailable",
    );
  }

  if (!response.ok) {
    throw new CarrierPublicSourceError(
      `The DOT public-data source returned HTTP ${response.status}.`,
      "source_unavailable",
    );
  }

  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    throw new CarrierPublicSourceError(
      "The DOT public-data response exceeded the Carrier 360 lookup limit.",
      "source_response_too_large",
    );
  }

  const text = await response.text();
  if (text.length > MAX_RESPONSE_BYTES) {
    throw new CarrierPublicSourceError(
      "The DOT public-data response exceeded the Carrier 360 lookup limit.",
      "source_response_too_large",
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new CarrierPublicSourceError(
      "The DOT public-data source returned invalid JSON.",
      "source_invalid_response",
    );
  }

  if (!Array.isArray(payload) || payload.some((row) => !row || typeof row !== "object" || Array.isArray(row))) {
    throw new CarrierPublicSourceError(
      "The DOT public-data source returned an unexpected response shape.",
      "source_invalid_response",
    );
  }

  return payload.slice(0, safeLimit) as T[];
}

/**
 * Company Census is keyed canonically by USDOT. One USDOT should resolve to at
 * most one census entity. Multiple rows are treated as a source-integrity error
 * rather than choosing an arbitrary record.
 */
export async function fetchCompanyCensusByDot(
  dotNumber: string,
): Promise<FmcsaCompanyCensusRecord | null> {
  if (!/^\d{1,10}$/.test(dotNumber)) {
    throw new CarrierPublicSourceError("USDOT number is invalid.", "source_not_queryable");
  }

  const rows = await fetchTransportationDatasetRows<FmcsaCompanyCensusRecord>(
    "fmcsa_company_census",
    { dot_number: dotNumber },
    2,
  );

  if (rows.length > 1) {
    throw new CarrierPublicSourceError(
      "The Company Census source returned multiple rows for one USDOT number.",
      "source_invalid_response",
    );
  }

  return rows[0] ?? null;
}
