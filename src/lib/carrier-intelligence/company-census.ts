import type { CarrierFieldEvidence } from "./contracts";

export interface FmcsaCompanyCensusRecord {
  dot_number?: unknown;
  status_code?: unknown;
  carrier_operation?: unknown;
  phone?: unknown;
  cell_phone?: unknown;
  company_officer_1?: unknown;
  company_officer_2?: unknown;
  truck_units?: unknown;
  power_units?: unknown;
  hm_ind?: unknown;
  total_drivers?: unknown;
  classdef?: unknown;
  legal_name?: unknown;
  dba_name?: unknown;
  phy_street?: unknown;
  phy_city?: unknown;
  phy_state?: unknown;
  phy_zip?: unknown;
  email_address?: unknown;
  docket1prefix?: unknown;
  docket1?: unknown;
  mcs150_date?: unknown;
  add_date?: unknown;
  [key: string]: unknown;
}

export interface NormalizedCompanyCensusCarrier {
  dotNumber: string | null;
  mcNumber: string | null;
  legalName: string | null;
  dbaName: string | null;
  officerName: string | null;
  secondaryOfficerName: string | null;
  phone: string | null;
  cellPhone: string | null;
  email: string | null;
  physicalAddress: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  drivers: number | null;
  powerUnits: number | null;
  /** Straight-truck count as filed in Company Census; not total power units. */
  truckUnits: number | null;
  carrierOperation: string | null;
  classification: string | null;
  operatingStatus: "active" | "inactive" | "pending" | "unknown";
  hazmatDeclared: boolean | null;
  carrierFilingDate: string | null;
  federalRegistrationAddedDate: string | null;
}

export interface NormalizedCompanyCensusResult {
  sourceKey: "fmcsa_company_census";
  normalized: NormalizedCompanyCensusCarrier;
  evidence: Record<string, CarrierFieldEvidence<unknown>>;
}

const EMPTY_SENTINELS = new Set(["", "N/A", "NA", "NULL", "UNKNOWN"]);

function cleanText(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).trim();
  if (EMPTY_SENTINELS.has(text.toUpperCase())) return null;
  return text;
}

function cleanEmail(value: unknown): string | null {
  const email = cleanText(value)?.toLowerCase() ?? null;
  if (!email || !email.includes("@") || email.length > 254) return null;
  return email;
}

function cleanPhone(value: unknown): string | null {
  const phone = cleanText(value);
  if (!phone) return null;

  // Preserve the human-readable filing value while rejecting obviously empty
  // placeholders. Phone validation belongs to later contact verification.
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 7 ? phone : null;
}

function parseNonNegativeInteger(value: unknown): number | null {
  const text = cleanText(value);
  if (!text) return null;
  const parsed = Number.parseInt(text, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

function normalizeDotNumber(value: unknown): string | null {
  const text = cleanText(value);
  if (!text) return null;
  const digits = text.replace(/\D/g, "");
  return digits || null;
}

function normalizeMcNumber(prefixValue: unknown, docketValue: unknown): string | null {
  const prefix = cleanText(prefixValue)?.toUpperCase() ?? null;
  const docket = cleanText(docketValue);
  if (!prefix || !docket || prefix !== "MC") return null;

  const digits = docket.replace(/\D/g, "");
  return digits || null;
}

function normalizeStatus(value: unknown): NormalizedCompanyCensusCarrier["operatingStatus"] {
  switch (cleanText(value)?.toUpperCase()) {
    case "A":
      return "active";
    case "I":
      return "inactive";
    case "P":
      return "pending";
    default:
      return "unknown";
  }
}

function normalizeHazmat(value: unknown): boolean | null {
  switch (cleanText(value)?.toUpperCase()) {
    case "Y":
      return true;
    case "N":
      return false;
    default:
      return null;
  }
}

function normalizeSourceDate(value: unknown): string | null {
  const raw = cleanText(value);
  if (!raw) return null;

  const parsed = new Date(raw);
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed.toISOString();
}

function makeFiledEvidence<T>(
  value: T | null,
  fieldName: string,
  retrievedAt: string,
  sourceDate: string | null,
  dotNumber: string | null,
): CarrierFieldEvidence<T> {
  return {
    value,
    sourceType: "official_government",
    sourceName: "FMCSA Company Census File",
    sourceReference: dotNumber ? `USDOT ${dotNumber} · ${fieldName}` : fieldName,
    sourceDate,
    retrievedAt,
    confidence: value === null ? 0 : 95,
    // The source is an authoritative federal dataset, while most registration
    // values inside it originate from the regulated entity's filing.
    verificationState: value === null ? "unknown" : "carrier_filed",
  };
}

/**
 * Normalize one official FMCSA Company Census row into the Carrier 360 core.
 *
 * This function is intentionally conservative:
 * - missing values remain null;
 * - an FF/MX/other docket is never relabeled as an MC number;
 * - filed power units/drivers/truck units are not presented as live availability;
 * - TRUCK_UNITS is kept distinct from POWER_UNITS and is not treated as trailers;
 * - cargo/equipment detail is not inferred until its exact federal field mapping
 *   is explicitly implemented and tested.
 */
export function normalizeCompanyCensusRecord(
  record: FmcsaCompanyCensusRecord,
  retrievedAt = new Date().toISOString(),
): NormalizedCompanyCensusResult {
  const dotNumber = normalizeDotNumber(record.dot_number);
  const mcNumber = normalizeMcNumber(record.docket1prefix, record.docket1);
  const carrierFilingDate = normalizeSourceDate(record.mcs150_date);

  const normalized: NormalizedCompanyCensusCarrier = {
    dotNumber,
    mcNumber,
    legalName: cleanText(record.legal_name),
    dbaName: cleanText(record.dba_name),
    officerName: cleanText(record.company_officer_1),
    secondaryOfficerName: cleanText(record.company_officer_2),
    phone: cleanPhone(record.phone),
    cellPhone: cleanPhone(record.cell_phone),
    email: cleanEmail(record.email_address),
    physicalAddress: cleanText(record.phy_street),
    city: cleanText(record.phy_city),
    state: cleanText(record.phy_state)?.toUpperCase() ?? null,
    postalCode: cleanText(record.phy_zip),
    drivers: parseNonNegativeInteger(record.total_drivers),
    powerUnits: parseNonNegativeInteger(record.power_units),
    truckUnits: parseNonNegativeInteger(record.truck_units),
    carrierOperation: cleanText(record.carrier_operation),
    classification: cleanText(record.classdef),
    operatingStatus: normalizeStatus(record.status_code),
    hazmatDeclared: normalizeHazmat(record.hm_ind),
    carrierFilingDate,
    federalRegistrationAddedDate: normalizeSourceDate(record.add_date),
  };

  const evidence: Record<string, CarrierFieldEvidence<unknown>> = {
    dot_number: makeFiledEvidence(normalized.dotNumber, "dot_number", retrievedAt, carrierFilingDate, dotNumber),
    mc_number: makeFiledEvidence(normalized.mcNumber, "docket1", retrievedAt, carrierFilingDate, dotNumber),
    legal_name: makeFiledEvidence(normalized.legalName, "legal_name", retrievedAt, carrierFilingDate, dotNumber),
    dba_name: makeFiledEvidence(normalized.dbaName, "dba_name", retrievedAt, carrierFilingDate, dotNumber),
    officer_name: makeFiledEvidence(normalized.officerName, "company_officer_1", retrievedAt, carrierFilingDate, dotNumber),
    secondary_officer_name: makeFiledEvidence(normalized.secondaryOfficerName, "company_officer_2", retrievedAt, carrierFilingDate, dotNumber),
    phone: makeFiledEvidence(normalized.phone, "phone", retrievedAt, carrierFilingDate, dotNumber),
    cell_phone: makeFiledEvidence(normalized.cellPhone, "cell_phone", retrievedAt, carrierFilingDate, dotNumber),
    email: makeFiledEvidence(normalized.email, "email_address", retrievedAt, carrierFilingDate, dotNumber),
    physical_address: makeFiledEvidence(normalized.physicalAddress, "phy_street", retrievedAt, carrierFilingDate, dotNumber),
    city: makeFiledEvidence(normalized.city, "phy_city", retrievedAt, carrierFilingDate, dotNumber),
    state: makeFiledEvidence(normalized.state, "phy_state", retrievedAt, carrierFilingDate, dotNumber),
    postal_code: makeFiledEvidence(normalized.postalCode, "phy_zip", retrievedAt, carrierFilingDate, dotNumber),
    drivers: makeFiledEvidence(normalized.drivers, "total_drivers", retrievedAt, carrierFilingDate, dotNumber),
    power_units: makeFiledEvidence(normalized.powerUnits, "power_units", retrievedAt, carrierFilingDate, dotNumber),
    truck_units: makeFiledEvidence(normalized.truckUnits, "truck_units", retrievedAt, carrierFilingDate, dotNumber),
    operating_status: makeFiledEvidence(
      normalized.operatingStatus === "unknown" ? null : normalized.operatingStatus,
      "status_code",
      retrievedAt,
      carrierFilingDate,
      dotNumber,
    ),
    carrier_operation: makeFiledEvidence(normalized.carrierOperation, "carrier_operation", retrievedAt, carrierFilingDate, dotNumber),
    classification: makeFiledEvidence(normalized.classification, "classdef", retrievedAt, carrierFilingDate, dotNumber),
    hazmat_declared: makeFiledEvidence(normalized.hazmatDeclared, "hm_ind", retrievedAt, carrierFilingDate, dotNumber),
  };

  return {
    sourceKey: "fmcsa_company_census",
    normalized,
    evidence,
  };
}
