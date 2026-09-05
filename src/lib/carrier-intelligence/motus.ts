import "server-only";

import { fetchTransportationDatasetRows } from "./transportation-data";

export interface FmcsaMotusCarrierRecord {
  docket_number?: unknown;
  usdot_number?: unknown;
  dot_number?: unknown;
  op_auth_type?: unknown;
  op_auth_status?: unknown;
  legal_name?: unknown;
  dba_name?: unknown;
  [key: string]: unknown;
}

export type MotusMcResolution =
  | {
      status: "resolved";
      mcNumber: string;
      dotNumber: string;
      rows: FmcsaMotusCarrierRecord[];
    }
  | {
      status: "not_found";
      mcNumber: string;
      rows: [];
    }
  | {
      status: "invalid_source";
      mcNumber: string;
      reason: string;
      rows: FmcsaMotusCarrierRecord[];
    };

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

function rowDotNumber(row: FmcsaMotusCarrierRecord) {
  // Modern Motus documentation uses USDOT_NUMBER. Supporting DOT_NUMBER as a
  // compatibility alias keeps the parser tolerant of portal field-name changes
  // without accepting any non-numeric identity.
  return digits(row.usdot_number) ?? digits(row.dot_number);
}

/**
 * Resolve one MC docket to its USDOT entity through modern Motus Carrier data.
 *
 * Multiple rows are expected because authority rows can repeat docket/USDOT
 * combinations. The resolver succeeds only when all usable rows agree on one
 * USDOT identity. Any cross-USDOT collision is a hard stop for manual review.
 */
export async function resolveMotusMcToDot(mcNumber: string): Promise<MotusMcResolution> {
  if (!/^\d{1,10}$/.test(mcNumber)) {
    return {
      status: "invalid_source",
      mcNumber,
      reason: "MC number is invalid.",
      rows: [],
    };
  }

  const rows = await fetchTransportationDatasetRows<FmcsaMotusCarrierRecord>(
    "fmcsa_motus_carrier_history",
    { docket_number: `MC${mcNumber}` },
    10,
  );

  if (!rows.length) {
    return { status: "not_found", mcNumber, rows: [] };
  }

  const dotNumbers = Array.from(
    new Set(rows.map(rowDotNumber).filter((value): value is string => Boolean(value))),
  );

  if (dotNumbers.length !== 1) {
    return {
      status: "invalid_source",
      mcNumber,
      reason:
        dotNumbers.length === 0
          ? "Motus returned the MC docket without a usable USDOT identity."
          : "Motus returned the same MC docket against multiple USDOT identities; manual review required.",
      rows,
    };
  }

  return {
    status: "resolved",
    mcNumber,
    dotNumber: dotNumbers[0],
    rows,
  };
}
