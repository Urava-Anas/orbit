import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type {
  Carrier360Profile,
  CarrierFieldEvidence,
  CarrierRegulatoryIdentifier,
  CarrierSourceType,
  CarrierVerificationState,
} from "./contracts";

function adminOrThrow() {
  const admin = createAdminClient();
  if (!admin) {
    throw new Error("Server-side Supabase credentials are required for Carrier 360 reads.");
  }
  return admin;
}

type CurrentEvidenceRow = {
  field_key: string;
  field_value: unknown;
  source_type: CarrierSourceType;
  source_name: string;
  source_reference: string | null;
  source_date: string | null;
  retrieved_at: string;
  confidence: number;
  verification_state: CarrierVerificationState;
};

type CarrierRow = {
  id: string;
  workspace_id: string;
  lead_id: string | null;
  legal_name: string;
  dba_name: string | null;
  mc_number: string | null;
  dot_number: string | null;
  officer_name: string | null;
  officer_title: string | null;
  phone: string | null;
  cell_phone: string | null;
  email: string | null;
  website_url: string | null;
  social_profiles: Record<string, string> | null;
  physical_address: string | null;
  city: string | null;
  home_state: string | null;
  postal_code: string | null;
  drivers: number | null;
  power_units: number | null;
  trailers: number | null;
  hazmat_declared: boolean | null;
  hmsp_status: "unknown" | "active" | "inactive" | "not_required";
  authority_status: string | null;
  authority_granted_at: string | null;
  insurance_status: string | null;
  apex_risk_score: number | null;
  vetting_decision: "unassessed" | "approved" | "review" | "hold" | "reject";
  data_freshness_at: string | null;
  last_verified_at: string | null;
  updated_at: string;
};

type IdentifierRow = {
  identifier_type: "usdot" | "mc" | "ff" | "mx";
  identifier_value: string;
  is_primary: boolean;
  status: "observed" | "active" | "inactive" | "historical" | "unknown";
  source_name: string;
  source_reference: string | null;
  first_seen_at: string | null;
  last_seen_at: string | null;
};

type SafetyRow = {
  safety_rating: string | null;
  allowed_to_operate: boolean | null;
  total_inspections: number | null;
  vehicle_inspections: number | null;
  driver_inspections: number | null;
  hazmat_inspections: number | null;
  vehicle_oos_count: number | null;
  driver_oos_count: number | null;
  hazmat_oos_count: number | null;
  vehicle_oos_percent: number | null;
  driver_oos_percent: number | null;
  hazmat_oos_percent: number | null;
  total_violations: number | null;
  total_crashes: number | null;
  fatal_crashes: number | null;
  injury_crashes: number | null;
  towaway_crashes: number | null;
  source_name: string;
  source_reference: string | null;
  source_date: string | null;
  retrieved_at: string;
};

type RiskRow = {
  score: number;
  decision: "approved" | "review" | "hold" | "reject";
  reasons: unknown;
  scoring_version: string;
  assessed_at: string;
};

function asEvidence(row: CurrentEvidenceRow): CarrierFieldEvidence<unknown> {
  return {
    value: row.field_value ?? null,
    sourceType: row.source_type,
    sourceName: row.source_name,
    sourceReference: row.source_reference,
    sourceDate: row.source_date,
    retrievedAt: row.retrieved_at,
    confidence: row.confidence,
    verificationState: row.verification_state,
  };
}

function legacyEvidence<T>(
  value: T | null | undefined,
  fieldName: string,
  carrier: CarrierRow,
): CarrierFieldEvidence<T> | undefined {
  if (value === null || value === undefined) return undefined;
  return {
    value,
    sourceType: "apex_first_party",
    sourceName: "Apex carrier record — provenance not yet migrated",
    sourceReference: fieldName,
    sourceDate: carrier.data_freshness_at,
    retrievedAt: carrier.last_verified_at ?? carrier.updated_at,
    confidence: 50,
    verificationState: "unverified",
  };
}

function typedEvidence<T>(
  evidence: Map<string, CarrierFieldEvidence<unknown>>,
  key: string,
  fallback?: CarrierFieldEvidence<T>,
): CarrierFieldEvidence<T> | undefined {
  const item = evidence.get(key);
  return item ? (item as CarrierFieldEvidence<T>) : fallback;
}

function safetyEvidence<T>(
  value: T | null,
  field: string,
  row: SafetyRow | null,
): CarrierFieldEvidence<T> | undefined {
  if (!row || value === null) return undefined;
  return {
    value,
    sourceType: "official_government",
    sourceName: row.source_name,
    sourceReference: row.source_reference ? `${row.source_reference} · ${field}` : field,
    sourceDate: row.source_date,
    retrievedAt: row.retrieved_at,
    confidence: 100,
    verificationState: "verified",
  };
}

function safeReasons(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string").slice(0, 50);
}

/**
 * Read the normalized Carrier 360 projection without re-contacting external
 * sources. Freshening is a separate explicit workflow; rendering a profile must
 * remain fast, deterministic and independent of public-source availability.
 */
export async function loadCarrier360Profile(
  workspaceId: string,
  carrierId: string,
): Promise<Carrier360Profile | null> {
  const admin = adminOrThrow();

  const carrierResult = await admin
    .from("apex_carriers")
    .select(
      "id,workspace_id,lead_id,legal_name,dba_name,mc_number,dot_number,officer_name,officer_title,phone,cell_phone,email,website_url,social_profiles,physical_address,city,home_state,postal_code,drivers,power_units,trailers,hazmat_declared,hmsp_status,authority_status,authority_granted_at,insurance_status,apex_risk_score,vetting_decision,data_freshness_at,last_verified_at,updated_at",
    )
    .eq("workspace_id", workspaceId)
    .eq("id", carrierId)
    .maybeSingle();

  if (carrierResult.error) {
    throw new Error(`Carrier 360 core read failed: ${carrierResult.error.message}`);
  }
  if (!carrierResult.data) return null;
  const carrier = carrierResult.data as CarrierRow;

  const [currentResult, identifiersResult, safetyResult, riskResult] = await Promise.all([
    admin
      .from("apex_carrier_field_current")
      .select(
        "field_key,field_value,source_type,source_name,source_reference,source_date,retrieved_at,confidence,verification_state",
      )
      .eq("workspace_id", workspaceId)
      .eq("carrier_id", carrierId),
    admin
      .from("apex_carrier_identifiers")
      .select(
        "identifier_type,identifier_value,is_primary,status,source_name,source_reference,first_seen_at,last_seen_at",
      )
      .eq("workspace_id", workspaceId)
      .eq("carrier_id", carrierId)
      .order("identifier_type", { ascending: true })
      .order("is_primary", { ascending: false })
      .order("identifier_value", { ascending: true }),
    admin
      .from("apex_carrier_safety_snapshots")
      .select(
        "safety_rating,allowed_to_operate,total_inspections,vehicle_inspections,driver_inspections,hazmat_inspections,vehicle_oos_count,driver_oos_count,hazmat_oos_count,vehicle_oos_percent,driver_oos_percent,hazmat_oos_percent,total_violations,total_crashes,fatal_crashes,injury_crashes,towaway_crashes,source_name,source_reference,source_date,retrieved_at",
      )
      .eq("workspace_id", workspaceId)
      .eq("carrier_id", carrierId)
      .order("source_date", { ascending: false, nullsFirst: false })
      .order("retrieved_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("apex_carrier_risk_assessments")
      .select("score,decision,reasons,scoring_version,assessed_at")
      .eq("workspace_id", workspaceId)
      .eq("carrier_id", carrierId)
      .order("assessed_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (currentResult.error) throw new Error(`Carrier current-evidence read failed: ${currentResult.error.message}`);
  if (identifiersResult.error) throw new Error(`Carrier identifier read failed: ${identifiersResult.error.message}`);
  if (safetyResult.error) throw new Error(`Carrier safety read failed: ${safetyResult.error.message}`);
  if (riskResult.error) throw new Error(`Carrier risk read failed: ${riskResult.error.message}`);

  const evidence = new Map<string, CarrierFieldEvidence<unknown>>();
  for (const row of (currentResult.data ?? []) as CurrentEvidenceRow[]) {
    evidence.set(row.field_key, asEvidence(row));
  }

  const identifiers = (identifiersResult.data ?? []) as IdentifierRow[];
  const regulatoryIdentifiers: CarrierRegulatoryIdentifier[] = identifiers.map((row) => ({
    type: row.identifier_type,
    value: row.identifier_value,
    isPrimary: row.is_primary,
    status: row.status,
    sourceName: row.source_name,
    sourceReference: row.source_reference,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
  }));
  const identifiersEvidence: CarrierFieldEvidence<CarrierRegulatoryIdentifier[]> | undefined =
    regulatoryIdentifiers.length
      ? {
          value: regulatoryIdentifiers,
          sourceType: "apex_first_party",
          sourceName: "Apex regulatory identifier registry",
          sourceReference: "apex_carrier_identifiers",
          sourceDate: null,
          retrievedAt:
            regulatoryIdentifiers
              .map((item) => item.lastSeenAt)
              .filter((value): value is string => Boolean(value))
              .sort()
              .at(-1) ?? carrier.last_verified_at ?? carrier.updated_at,
          confidence: 100,
          verificationState: "derived",
        }
      : undefined;

  const safety = (safetyResult.data as SafetyRow | null) ?? null;
  const latestRisk = (riskResult.data as RiskRow | null) ?? null;

  return {
    carrierId: carrier.id,
    workspaceId: carrier.workspace_id,
    leadId: carrier.lead_id,
    identity: {
      legalName:
        typedEvidence<string>(
          evidence,
          "legal_name",
          legacyEvidence(carrier.legal_name, "legal_name", carrier),
        ) ?? {
          value: carrier.legal_name,
          sourceType: "apex_first_party",
          sourceName: "Apex carrier record — provenance unavailable",
          sourceReference: "legal_name",
          sourceDate: null,
          retrievedAt: carrier.updated_at,
          confidence: 0,
          verificationState: "unknown",
        },
      dbaName: typedEvidence<string>(
        evidence,
        "dba_name",
        legacyEvidence(carrier.dba_name, "dba_name", carrier),
      ),
      mcNumber: typedEvidence<string>(
        evidence,
        "mc_number",
        legacyEvidence(carrier.mc_number, "mc_number", carrier),
      ),
      dotNumber: typedEvidence<string>(
        evidence,
        "dot_number",
        legacyEvidence(carrier.dot_number, "dot_number", carrier),
      ),
      regulatoryIdentifiers: identifiersEvidence,
      officerName: typedEvidence<string>(
        evidence,
        "officer_name",
        legacyEvidence(carrier.officer_name, "officer_name", carrier),
      ),
      officerTitle: legacyEvidence(carrier.officer_title, "officer_title", carrier),
      phone: typedEvidence<string>(evidence, "phone", legacyEvidence(carrier.phone, "phone", carrier)),
      cellPhone: typedEvidence<string>(
        evidence,
        "cell_phone",
        legacyEvidence(carrier.cell_phone, "cell_phone", carrier),
      ),
      email: typedEvidence<string>(evidence, "email", legacyEvidence(carrier.email, "email", carrier)),
      website: legacyEvidence(carrier.website_url, "website_url", carrier),
      socialProfiles:
        carrier.social_profiles && Object.keys(carrier.social_profiles).length
          ? legacyEvidence(carrier.social_profiles, "social_profiles", carrier)
          : undefined,
      physicalAddress: typedEvidence<string>(
        evidence,
        "physical_address",
        legacyEvidence(carrier.physical_address, "physical_address", carrier),
      ),
      city: typedEvidence<string>(evidence, "city", legacyEvidence(carrier.city, "city", carrier)),
      state: typedEvidence<string>(
        evidence,
        "state",
        legacyEvidence(carrier.home_state, "home_state", carrier),
      ),
      postalCode: typedEvidence<string>(
        evidence,
        "postal_code",
        legacyEvidence(carrier.postal_code, "postal_code", carrier),
      ),
    },
    fleet: {
      drivers: typedEvidence<number>(
        evidence,
        "drivers",
        legacyEvidence(carrier.drivers, "drivers", carrier),
      ),
      powerUnits: typedEvidence<number>(
        evidence,
        "power_units",
        legacyEvidence(carrier.power_units, "power_units", carrier),
      ),
      trailers: legacyEvidence(carrier.trailers, "trailers", carrier),
    },
    authority: {
      status: legacyEvidence(carrier.authority_status, "authority_status", carrier),
      grantedAt: legacyEvidence(carrier.authority_granted_at, "authority_granted_at", carrier),
    },
    insurance: {
      regulatoryStatus: legacyEvidence(carrier.insurance_status, "insurance_status", carrier),
    },
    safety: {
      safetyRating: safetyEvidence(safety?.safety_rating ?? null, "safety_rating", safety),
      allowedToOperate: safetyEvidence(safety?.allowed_to_operate ?? null, "allowed_to_operate", safety),
      totalInspections: safetyEvidence(safety?.total_inspections ?? null, "total_inspections", safety),
      vehicleInspections: safetyEvidence(safety?.vehicle_inspections ?? null, "vehicle_inspections", safety),
      driverInspections: safetyEvidence(safety?.driver_inspections ?? null, "driver_inspections", safety),
      hazmatInspections: safetyEvidence(safety?.hazmat_inspections ?? null, "hazmat_inspections", safety),
      vehicleOosCount: safetyEvidence(safety?.vehicle_oos_count ?? null, "vehicle_oos_count", safety),
      driverOosCount: safetyEvidence(safety?.driver_oos_count ?? null, "driver_oos_count", safety),
      hazmatOosCount: safetyEvidence(safety?.hazmat_oos_count ?? null, "hazmat_oos_count", safety),
      vehicleOosPercent: safetyEvidence(safety?.vehicle_oos_percent ?? null, "vehicle_oos_percent", safety),
      driverOosPercent: safetyEvidence(safety?.driver_oos_percent ?? null, "driver_oos_percent", safety),
      hazmatOosPercent: safetyEvidence(safety?.hazmat_oos_percent ?? null, "hazmat_oos_percent", safety),
      totalViolations: safetyEvidence(safety?.total_violations ?? null, "total_violations", safety),
      totalCrashes: safetyEvidence(safety?.total_crashes ?? null, "total_crashes", safety),
      fatalCrashes: safetyEvidence(safety?.fatal_crashes ?? null, "fatal_crashes", safety),
      injuryCrashes: safetyEvidence(safety?.injury_crashes ?? null, "injury_crashes", safety),
      towawayCrashes: safetyEvidence(safety?.towaway_crashes ?? null, "towaway_crashes", safety),
    },
    hazmat: {
      declaredHazmat: typedEvidence<boolean>(
        evidence,
        "hazmat_declared",
        legacyEvidence(carrier.hazmat_declared, "hazmat_declared", carrier),
      ),
      hmspStatus:
        carrier.hmsp_status !== "unknown"
          ? legacyEvidence(carrier.hmsp_status, "hmsp_status", carrier)
          : undefined,
    },
    credentials: {},
    risk: latestRisk
      ? {
          apexRiskScore: latestRisk.score,
          decision: latestRisk.decision,
          reasons: safeReasons(latestRisk.reasons),
          scoringVersion: latestRisk.scoring_version,
          assessedAt: latestRisk.assessed_at,
        }
      : {
          apexRiskScore: carrier.apex_risk_score,
          decision: carrier.vetting_decision,
          reasons: [],
          scoringVersion: null,
          assessedAt: null,
        },
    lastMaterialVerificationAt: carrier.last_verified_at ?? carrier.data_freshness_at,
  };
}
