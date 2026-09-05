import "server-only";

import { CarrierPublicSourceError, fetchTransportationDatasetRows } from "./transportation-data";

export interface FmcsaMotusAuthorityRecord {
  docket_number?: unknown;
  usdot_number?: unknown;
  op_auth_type?: unknown;
  op_auth_status?: unknown;
  op_auth_stat_change_date?: unknown;
  [key: string]: unknown;
}

export interface NormalizedMotusAuthorityFact {
  docketNumber: string | null;
  dotNumber: string;
  authorityType: string | null;
  status: string | null;
  statusChangedAt: string | null;
  rawRecord: FmcsaMotusAuthorityRecord;
}

function text(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const cleaned = String(value).trim();
  return cleaned || null;
}

function digits(value: unknown): string | null {
  const cleaned = text(value);
  if (!cleaned) return null;
  const onlyDigits = cleaned.replace(/\D/g, "");
  return /^\d{1,10}$/.test(onlyDigits) ? onlyDigits : null;
}

function docket(value: unknown): string | null {
  const cleaned = text(value)?.toUpperCase().replace(/\s+/g, "") ?? null;
  if (!cleaned) return null;
  const match = cleaned.match(/^(MC|MX|FF)-?(\d{1,10})$/);
  return match ? `${match[1]}${match[2]}` : null;
}

function sourceTimestamp(value: unknown): string | null {
  const cleaned = text(value);
  if (!cleaned) return null;
  const parsed = new Date(cleaned);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

/**
 * Normalize one modern Motus authority row without translating FMCSA status or
 * authority labels into Apex policy decisions. Source labels are preserved as
 * filed. A status-change timestamp is lifecycle evidence only; it is NOT treated
 * as the original grant date unless a future source field explicitly proves that.
 */
export function normalizeMotusAuthorityRecord(
  row: FmcsaMotusAuthorityRecord,
  expectedDotNumber: string,
): NormalizedMotusAuthorityFact {
  if (!/^\d{1,10}$/.test(expectedDotNumber)) {
    throw new CarrierPublicSourceError("USDOT number is invalid.", "source_not_queryable");
  }

  const dotNumber = digits(row.usdot_number);
  if (!dotNumber || dotNumber !== expectedDotNumber) {
    throw new CarrierPublicSourceError(
      `Motus authority identity mismatch for USDOT ${expectedDotNumber}.`,
      "source_invalid_response",
    );
  }

  return {
    docketNumber: docket(row.docket_number),
    dotNumber,
    authorityType: text(row.op_auth_type),
    status: text(row.op_auth_status),
    statusChangedAt: sourceTimestamp(row.op_auth_stat_change_date),
    rawRecord: row,
  };
}

/**
 * Bounded current authority rows from Motus Carrier. This is an on-demand
 * bootstrap path; national/daily completeness belongs to the bulk/delta worker.
 */
export async function fetchMotusCurrentAuthoritiesByDot(
  dotNumber: string,
): Promise<NormalizedMotusAuthorityFact[]> {
  if (!/^\d{1,10}$/.test(dotNumber)) {
    throw new CarrierPublicSourceError("USDOT number is invalid.", "source_not_queryable");
  }

  const rows = await fetchTransportationDatasetRows<FmcsaMotusAuthorityRecord>(
    "fmcsa_motus_carrier_history",
    { usdot_number: dotNumber },
    10,
  );

  return rows.map((row) => normalizeMotusAuthorityRecord(row, dotNumber));
}

/**
 * Bounded lifecycle rows from Motus AuthHist. These rows may show status-change
 * events, but the on-demand path must not claim it has the complete history when
 * the source has more than the bounded lookup limit.
 */
export async function fetchMotusAuthorityHistoryByDot(
  dotNumber: string,
): Promise<NormalizedMotusAuthorityFact[]> {
  if (!/^\d{1,10}$/.test(dotNumber)) {
    throw new CarrierPublicSourceError("USDOT number is invalid.", "source_not_queryable");
  }

  const rows = await fetchTransportationDatasetRows<FmcsaMotusAuthorityRecord>(
    "fmcsa_motus_authority_history",
    { usdot_number: dotNumber },
    10,
  );

  return rows.map((row) => normalizeMotusAuthorityRecord(row, dotNumber));
}
