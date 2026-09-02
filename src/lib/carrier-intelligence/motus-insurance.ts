import "server-only";

import { CarrierPublicSourceError, fetchTransportationDatasetRows } from "./transportation-data";

export interface FmcsaMotusInsuranceRecord {
  docket_number?: unknown;
  usdot_number?: unknown;
  ins_form_code?: unknown;
  ins_type_code?: unknown;
  ins_class_code?: unknown;
  max_cov_amount?: unknown;
  underl_lim_amount?: unknown;
  policy_no?: unknown;
  effective_date?: unknown;
  insurance_company_name?: unknown;
  trans_date?: unknown;
  [key: string]: unknown;
}

export interface NormalizedMotusInsuranceFact {
  docketNumber: string | null;
  dotNumber: string;
  filingType: string | null;
  insuranceType: string | null;
  insuranceClass: string | null;
  insurerName: string | null;
  policyNumber: string | null;
  coverageAmount: number | null;
  underlyingLimitAmount: number | null;
  effectiveAt: string | null;
  transactionAt: string | null;
  status: "published_active_or_pending";
  rawRecord: FmcsaMotusInsuranceRecord;
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

function amount(value: unknown): number | null {
  const cleaned = text(value);
  if (!cleaned) return null;
  const parsed = Number(cleaned.replace(/[$,\s]/g, ""));
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

function sourceDate(value: unknown): string | null {
  const cleaned = text(value);
  if (!cleaned) return null;
  const parsed = new Date(cleaned);
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function sourceTimestamp(value: unknown): string | null {
  const cleaned = text(value);
  if (!cleaned) return null;
  const parsed = new Date(cleaned);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

/**
 * Normalize one row from the modern Motus Insur active/pending publication.
 *
 * Presence in this dataset is intentionally represented as
 * `published_active_or_pending`; Orbit must not silently upgrade the row to
 * "active" when the published row itself does not prove that narrower state.
 * MAX_COV_AMOUNT is stored as filed coverage, not as the carrier's regulatory
 * minimum requirement, and this source is never treated as a commercial COI.
 */
export function normalizeMotusInsuranceRecord(
  row: FmcsaMotusInsuranceRecord,
  expectedDotNumber: string,
): NormalizedMotusInsuranceFact {
  if (!/^\d{1,10}$/.test(expectedDotNumber)) {
    throw new CarrierPublicSourceError("USDOT number is invalid.", "source_not_queryable");
  }

  const dotNumber = digits(row.usdot_number);
  if (!dotNumber || dotNumber !== expectedDotNumber) {
    throw new CarrierPublicSourceError(
      `Motus insurance identity mismatch for USDOT ${expectedDotNumber}.`,
      "source_invalid_response",
    );
  }

  return {
    docketNumber: docket(row.docket_number),
    dotNumber,
    filingType: text(row.ins_form_code),
    insuranceType: text(row.ins_type_code),
    insuranceClass: text(row.ins_class_code),
    insurerName: text(row.insurance_company_name),
    policyNumber: text(row.policy_no),
    coverageAmount: amount(row.max_cov_amount),
    underlyingLimitAmount: amount(row.underl_lim_amount),
    effectiveAt: sourceDate(row.effective_date),
    transactionAt: sourceTimestamp(row.trans_date),
    status: "published_active_or_pending",
    rawRecord: row,
  };
}

/**
 * Bounded on-demand view of active/pending Motus insurance filings. The daily
 * bulk/delta worker remains the completeness path. Empty results stay empty and
 * are not converted into a claim that the carrier has no insurance.
 */
export async function fetchMotusInsuranceByDot(
  dotNumber: string,
): Promise<NormalizedMotusInsuranceFact[]> {
  if (!/^\d{1,10}$/.test(dotNumber)) {
    throw new CarrierPublicSourceError("USDOT number is invalid.", "source_not_queryable");
  }

  const rows = await fetchTransportationDatasetRows<FmcsaMotusInsuranceRecord>(
    "fmcsa_motus_insurance_history",
    { usdot_number: dotNumber },
    10,
  );

  return rows.map((row) => normalizeMotusInsuranceRecord(row, dotNumber));
}
