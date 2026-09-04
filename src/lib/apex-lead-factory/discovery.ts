import "server-only";

import type { Carrier360Profile, CarrierFieldEvidence } from "@/lib/carrier-intelligence/contracts";
import {
  normalizeCompanyCensusRecord,
  type FmcsaCompanyCensusRecord,
} from "@/lib/carrier-intelligence/company-census";
import type { CarrierFactoryCandidate, MaterialChangeKind } from "@/lib/apex-lead-factory/contracts";

const COMPANY_CENSUS_DATASET_ID = "az4n-8mr2";
const TRANSPORTATION_DATA_ORIGIN = "https://data.transportation.gov";
const MAX_SCAN_TARGET = 50_000;
const MAX_PAGE_SIZE = 5_000;
const DEFAULT_PAGE_SIZE = 2_500;
const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_PAGE_BYTES = 12_000_000;

const COMPANY_CENSUS_SELECT = [
  "dot_number",
  "status_code",
  "carrier_operation",
  "phone",
  "cell_phone",
  "company_officer_1",
  "company_officer_2",
  "truck_units",
  "power_units",
  "hm_ind",
  "total_drivers",
  "classdef",
  "legal_name",
  "dba_name",
  "phy_street",
  "phy_city",
  "phy_state",
  "phy_zip",
  "email_address",
  "docket1prefix",
  "docket1",
  "mcs150_date",
  "add_date",
].join(",");

export interface CompanyCensusDiscoveryOptions {
  scanTarget?: number;
  pageSize?: number;
  startOffset?: number;
}

export interface CompanyCensusDiscoveryResult {
  rows: FmcsaCompanyCensusRecord[];
  scanned: number;
  nextOffset: number;
  exhausted: boolean;
}

function boundedInteger(value: number | undefined, fallback: number, max: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.trunc(value ?? fallback), 1), max);
}

async function fetchCompanyCensusPage(limit: number, offset: number): Promise<FmcsaCompanyCensusRecord[]> {
  const url = new URL(`/resource/${COMPANY_CENSUS_DATASET_ID}.json`, TRANSPORTATION_DATA_ORIGIN);
  url.searchParams.set("$select", COMPANY_CENSUS_SELECT);
  url.searchParams.set("$where", "status_code='A'");
  url.searchParams.set("$order", "mcs150_date DESC, dot_number ASC");
  url.searchParams.set("$limit", String(limit));
  url.searchParams.set("$offset", String(offset));

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
    const message = error instanceof Error ? error.message : "unknown error";
    throw new Error(`FMCSA Company Census discovery failed: ${message}`);
  }

  if (!response.ok) {
    throw new Error(`FMCSA Company Census discovery returned HTTP ${response.status}.`);
  }

  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_PAGE_BYTES) {
    throw new Error("FMCSA Company Census discovery page exceeded the safe response size.");
  }

  const text = await response.text();
  if (text.length > MAX_PAGE_BYTES) {
    throw new Error("FMCSA Company Census discovery page exceeded the safe response size.");
  }

  const payload: unknown = JSON.parse(text);
  if (!Array.isArray(payload)) {
    throw new Error("FMCSA Company Census discovery returned an invalid response shape.");
  }

  return payload.filter(
    (row): row is FmcsaCompanyCensusRecord => Boolean(row && typeof row === "object" && !Array.isArray(row)),
  );
}

/**
 * High-volume discovery path. Unlike the existing per-carrier lookup helper this
 * intentionally pages through the free Company Census dataset to build a broad
 * candidate pool before expensive/deeper enrichment is attempted.
 */
export async function discoverCompanyCensusRows(
  options: CompanyCensusDiscoveryOptions = {},
): Promise<CompanyCensusDiscoveryResult> {
  const scanTarget = boundedInteger(options.scanTarget, 20_000, MAX_SCAN_TARGET);
  const pageSize = boundedInteger(options.pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  let offset = Math.max(0, Math.trunc(options.startOffset ?? 0));
  const rows: FmcsaCompanyCensusRecord[] = [];
  let exhausted = false;

  while (rows.length < scanTarget) {
    const remaining = scanTarget - rows.length;
    const page = await fetchCompanyCensusPage(Math.min(pageSize, remaining), offset);
    rows.push(...page);
    offset += page.length;

    if (page.length < Math.min(pageSize, remaining)) {
      exhausted = true;
      break;
    }
  }

  return { rows, scanned: rows.length, nextOffset: offset, exhausted };
}

function castEvidence<T>(evidence: CarrierFieldEvidence<unknown> | undefined): CarrierFieldEvidence<T> | undefined {
  return evidence as CarrierFieldEvidence<T> | undefined;
}

function listEvidence(
  values: Array<string | null>,
  template: CarrierFieldEvidence<unknown> | undefined,
): CarrierFieldEvidence<string[]> | undefined {
  if (!template) return undefined;
  const clean = values.filter((value): value is string => Boolean(value));
  return {
    value: clean,
    confidence: clean.length ? template.confidence : 0,
    verificationState: clean.length ? template.verificationState : "unknown",
    sourceType: template.sourceType,
    sourceName: template.sourceName,
    sourceReference: template.sourceReference,
    retrievedAt: template.retrievedAt,
    sourceDate: template.sourceDate,
    previousValue: null,
  };
}

function recentMaterialChanges(
  mcs150UpdatedAt: string | null,
  federalAddedAt: string | null,
  now = new Date(),
): MaterialChangeKind[] {
  const kinds = new Set<MaterialChangeKind>();
  for (const [kind, value] of [
    ["mcs150", mcs150UpdatedAt],
    ["reactivation", federalAddedAt],
  ] as const) {
    if (!value) continue;
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed)) continue;
    if (now.getTime() - parsed <= 30 * 86_400_000) kinds.add(kind);
  }
  return [...kinds];
}

/**
 * Convert a discovery row into the bounded Carrier 360 candidate used by the
 * factory. Company Census entity status is kept separate from authority status.
 */
export function companyCensusRowToFactoryCandidate(
  workspaceId: string,
  row: FmcsaCompanyCensusRecord,
  retrievedAt = new Date().toISOString(),
): CarrierFactoryCandidate | null {
  const census = normalizeCompanyCensusRecord(row, retrievedAt);
  const normalized = census.normalized;
  const evidence = census.evidence;
  if (!normalized.dotNumber || normalized.operatingStatus !== "active") return null;

  const operatingClassification = listEvidence(
    [normalized.carrierOperation, normalized.classification],
    evidence.carrier_operation,
  );

  const profile: Carrier360Profile = {
    carrierId: `candidate:${normalized.dotNumber}`,
    workspaceId,
    identity: {
      legalName: castEvidence<string>(evidence.legal_name)!,
      dbaName: castEvidence<string>(evidence.dba_name),
      mcNumber: castEvidence<string>(evidence.mc_number),
      dotNumber: castEvidence<string>(evidence.dot_number),
      officerName: castEvidence<string>(evidence.officer_name),
      phone: castEvidence<string>(evidence.phone),
      cellPhone: castEvidence<string>(evidence.cell_phone),
      email: castEvidence<string>(evidence.email),
      physicalAddress: castEvidence<string>(evidence.physical_address),
      city: castEvidence<string>(evidence.city),
      state: castEvidence<string>(evidence.state),
      postalCode: castEvidence<string>(evidence.postal_code),
    },
    fleet: {
      drivers: castEvidence<number>(evidence.drivers),
      powerUnits: castEvidence<number>(evidence.power_units),
      operatingClassification,
    },
    authority: {},
    insurance: {},
    safety: {},
    hazmat: {
      declaredHazmat: castEvidence<boolean>(evidence.hazmat_declared),
    },
    credentials: {},
    risk: {
      apexRiskScore: null,
      decision: "unassessed",
      reasons: [],
      scoringVersion: null,
      assessedAt: null,
    },
    lastMaterialVerificationAt: normalized.carrierFilingDate,
  };

  return {
    usdotNumber: normalized.dotNumber,
    profile,
    discoveredAt: retrievedAt,
    sourceUpdatedAt: normalized.carrierFilingDate ?? normalized.federalRegistrationAddedDate,
    mcs150UpdatedAt: normalized.carrierFilingDate,
    discoveryOperatingStatus: normalized.operatingStatus,
    declaredFleet: {
      // Existing Company Census normalizer explicitly defines TRUCK_UNITS as
      // straight trucks. Never infer tractor count from POWER_UNITS.
      straightTrucks: normalized.truckUnits,
    },
    observedEquipment: [],
    publicBusinessContactVerified: false,
    materialChangeKinds: recentMaterialChanges(
      normalized.carrierFilingDate,
      normalized.federalRegistrationAddedDate,
      new Date(retrievedAt),
    ),
  };
}

export function companyCensusRowsToFactoryCandidates(
  workspaceId: string,
  rows: FmcsaCompanyCensusRecord[],
  retrievedAt = new Date().toISOString(),
): CarrierFactoryCandidate[] {
  return rows
    .map((row) => companyCensusRowToFactoryCandidate(workspaceId, row, retrievedAt))
    .filter((candidate): candidate is CarrierFactoryCandidate => candidate !== null);
}
