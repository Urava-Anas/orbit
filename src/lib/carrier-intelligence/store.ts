import "server-only";

import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  CARRIER_SOURCE_PRIORITY,
  shouldReplaceCarrierEvidence,
  type CarrierFieldEvidence,
  type CarrierSourceType,
  type CarrierVerificationState,
} from "./contracts";
import type {
  FmcsaCompanyCensusRecord,
  NormalizedCompanyCensusResult,
} from "./company-census";

const CORE_FIELD_TO_COLUMN = {
  dot_number: "dot_number",
  mc_number: "mc_number",
  legal_name: "legal_name",
  dba_name: "dba_name",
  officer_name: "officer_name",
  phone: "phone",
  cell_phone: "cell_phone",
  email: "email",
  physical_address: "physical_address",
  city: "city",
  state: "home_state",
  postal_code: "postal_code",
  drivers: "drivers",
  power_units: "power_units",
  hazmat_declared: "hazmat_declared",
} as const;

type CoreFieldKey = keyof typeof CORE_FIELD_TO_COLUMN;
type EvidenceEntry = [string, CarrierFieldEvidence<unknown>];
type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>;

type ExistingCarrier = {
  id: string;
  lead_id: string | null;
  legal_name: string;
  dba_name: string | null;
  mc_number: string | null;
  dot_number: string | null;
  officer_name: string | null;
  phone: string | null;
  cell_phone: string | null;
  email: string | null;
  physical_address: string | null;
  city: string | null;
  home_state: string | null;
  postal_code: string | null;
  drivers: number | null;
  power_units: number | null;
  hazmat_declared: boolean | null;
  source_summary: Record<string, unknown> | null;
};

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

export type PersistCompanyCensusInput = {
  workspaceId: string;
  leadId?: string | null;
  rawRecord: FmcsaCompanyCensusRecord;
  result: NormalizedCompanyCensusResult;
};

export type PersistCompanyCensusResult = {
  carrierId: string;
  created: boolean;
  sourceRecordInserted: boolean;
  normalizedFieldsUpdated: string[];
};

function adminOrThrow() {
  const admin = createAdminClient();
  if (!admin) {
    throw new Error("Server-side Supabase credentials are required for Carrier Intelligence writes.");
  }
  return admin;
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
    .join(",")}}`;
}

export function carrierSourcePayloadHash(payload: unknown): string {
  return createHash("sha256").update(canonical(payload)).digest("hex");
}

async function carrierByField(
  admin: AdminClient,
  workspaceId: string,
  field: "dot_number" | "mc_number",
  value: string | null,
): Promise<ExistingCarrier | null> {
  if (!value) return null;
  const { data, error } = await admin
    .from("apex_carriers")
    .select(
      "id,lead_id,legal_name,dba_name,mc_number,dot_number,officer_name,phone,cell_phone,email,physical_address,city,home_state,postal_code,drivers,power_units,hazmat_declared,source_summary",
    )
    .eq("workspace_id", workspaceId)
    .eq(field, value)
    .maybeSingle();

  if (error) throw new Error(`Carrier identity lookup failed: ${error.message}`);
  return (data as ExistingCarrier | null) ?? null;
}

async function resolveExistingCarrier(
  admin: AdminClient,
  workspaceId: string,
  dotNumber: string | null,
  mcNumber: string | null,
) {
  const byDot = await carrierByField(admin, workspaceId, "dot_number", dotNumber);
  const byMc = await carrierByField(admin, workspaceId, "mc_number", mcNumber);

  if (byDot && byMc && byDot.id !== byMc.id) {
    throw new Error(
      "Carrier identity collision: USDOT and MC resolve to different Apex carrier records. Manual review required.",
    );
  }

  return byDot ?? byMc;
}

async function currentFieldEvidence(
  admin: AdminClient,
  workspaceId: string,
  carrierId: string,
): Promise<Map<string, CarrierFieldEvidence<unknown>>> {
  const { data, error } = await admin
    .from("apex_carrier_field_current")
    .select(
      "field_key,field_value,source_type,source_name,source_reference,source_date,retrieved_at,confidence,verification_state",
    )
    .eq("workspace_id", workspaceId)
    .eq("carrier_id", carrierId);

  if (error) throw new Error(`Current Carrier 360 evidence lookup failed: ${error.message}`);

  const current = new Map<string, CarrierFieldEvidence<unknown>>();
  for (const row of (data ?? []) as CurrentEvidenceRow[]) {
    current.set(row.field_key, {
      value: row.field_value ?? null,
      sourceType: row.source_type,
      sourceName: row.source_name,
      sourceReference: row.source_reference,
      sourceDate: row.source_date,
      retrievedAt: row.retrieved_at,
      confidence: row.confidence,
      verificationState: row.verification_state,
    });
  }
  return current;
}

async function insertSourceRecord(
  admin: AdminClient,
  input: PersistCompanyCensusInput,
  carrierId: string,
) {
  const dotNumber = input.result.normalized.dotNumber;
  const externalRecordId = dotNumber
    ? `USDOT:${dotNumber}`
    : input.result.normalized.mcNumber
      ? `MC:${input.result.normalized.mcNumber}`
      : "";
  const payloadHash = carrierSourcePayloadHash(input.rawRecord);
  const { error } = await admin.from("apex_carrier_source_records").insert({
    workspace_id: input.workspaceId,
    carrier_id: carrierId,
    source_key: input.result.sourceKey,
    external_record_id: externalRecordId,
    payload_hash: payloadHash,
    source_updated_at: input.result.normalized.carrierFilingDate,
    payload: input.rawRecord,
    retrieved_at:
      Object.values(input.result.evidence).find((item) => item.retrievedAt)?.retrievedAt ??
      new Date().toISOString(),
  });

  if (!error) return true;
  if (error.code === "23505") return false;
  throw new Error(`Carrier source-record write failed: ${error.message}`);
}

function acceptedEvidence(
  currentEvidence: Map<string, CarrierFieldEvidence<unknown>>,
  evidence: Record<string, CarrierFieldEvidence<unknown>>,
): EvidenceEntry[] {
  return Object.entries(evidence).filter(([fieldKey, candidate]) => {
    if (candidate.value === null) return false;
    return shouldReplaceCarrierEvidence(currentEvidence.get(fieldKey), candidate);
  });
}

function mappedCoreUpdates(accepted: EvidenceEntry[]) {
  const updates: Record<string, unknown> = {};

  for (const [fieldKey, candidate] of accepted) {
    const column = CORE_FIELD_TO_COLUMN[fieldKey as CoreFieldKey];
    if (!column) continue;
    updates[column] = candidate.value;
    if (fieldKey === "power_units") updates.fleet_size = candidate.value;
  }

  return updates;
}

async function appendProvenanceLedger(
  admin: AdminClient,
  workspaceId: string,
  carrierId: string,
  evidence: Record<string, CarrierFieldEvidence<unknown>>,
  previousEvidence: Map<string, CarrierFieldEvidence<unknown>>,
) {
  const rows = Object.entries(evidence)
    .filter(([, item]) => item.value !== null)
    .map(([fieldKey, item]) => ({
      workspace_id: workspaceId,
      carrier_id: carrierId,
      field_key: fieldKey,
      field_value: item.value,
      previous_value: previousEvidence.get(fieldKey)?.value ?? null,
      source_type: item.sourceType,
      source_priority: CARRIER_SOURCE_PRIORITY[item.sourceType],
      source_name: item.sourceName,
      source_reference: item.sourceReference ?? null,
      source_date: item.sourceDate ?? null,
      retrieved_at: item.retrievedAt,
      confidence: Math.min(100, Math.max(0, Math.trunc(item.confidence))),
      verification_state: item.verificationState,
    }));

  if (!rows.length) return;
  const { error } = await admin.from("apex_carrier_field_provenance").insert(rows);
  if (error) throw new Error(`Carrier provenance write failed: ${error.message}`);
}

async function upsertCurrentEvidence(
  admin: AdminClient,
  workspaceId: string,
  carrierId: string,
  accepted: EvidenceEntry[],
) {
  if (!accepted.length) return;

  const rows = accepted.map(([fieldKey, item]) => ({
    workspace_id: workspaceId,
    carrier_id: carrierId,
    field_key: fieldKey,
    field_value: item.value,
    source_type: item.sourceType,
    source_priority: CARRIER_SOURCE_PRIORITY[item.sourceType],
    source_name: item.sourceName,
    source_reference: item.sourceReference ?? null,
    source_date: item.sourceDate ?? null,
    retrieved_at: item.retrievedAt,
    confidence: Math.min(100, Math.max(0, Math.trunc(item.confidence))),
    verification_state: item.verificationState,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await admin
    .from("apex_carrier_field_current")
    .upsert(rows, { onConflict: "workspace_id,carrier_id,field_key" });
  if (error) throw new Error(`Current Carrier 360 evidence update failed: ${error.message}`);
}

/**
 * Persist one normalized Company Census observation into the canonical Apex
 * carrier entity. Callers must derive workspaceId from authenticated Orbit
 * workspace context; this function never accepts a workspace from browser data.
 *
 * The write path is idempotent at the raw-source layer and refuses an identity
 * collision instead of merging two carrier entities heuristically.
 */
export async function persistCompanyCensusCarrier(
  input: PersistCompanyCensusInput,
): Promise<PersistCompanyCensusResult> {
  const admin = adminOrThrow();
  const { normalized, evidence } = input.result;
  if (!normalized.dotNumber && !normalized.mcNumber) {
    throw new Error("Company Census record has no usable USDOT or MC identifier.");
  }

  let carrier = await resolveExistingCarrier(
    admin,
    input.workspaceId,
    normalized.dotNumber,
    normalized.mcNumber,
  );
  let created = false;

  if (!carrier) {
    if (!normalized.legalName) {
      throw new Error("Company Census record has no legal carrier name; creation is blocked.");
    }

    const { data, error } = await admin
      .from("apex_carriers")
      .insert({
        workspace_id: input.workspaceId,
        lead_id: input.leadId ?? null,
        legal_name: normalized.legalName,
        dba_name: normalized.dbaName,
        mc_number: normalized.mcNumber,
        dot_number: normalized.dotNumber,
        officer_name: normalized.officerName,
        email: normalized.email,
        phone: normalized.phone,
        cell_phone: normalized.cellPhone,
        physical_address: normalized.physicalAddress,
        city: normalized.city,
        home_state: normalized.state,
        postal_code: normalized.postalCode,
        drivers: normalized.drivers,
        power_units: normalized.powerUnits,
        fleet_size: normalized.powerUnits,
        hazmat_declared: normalized.hazmatDeclared,
        data_freshness_at: normalized.carrierFilingDate ?? new Date().toISOString(),
        source_summary: {
          fmcsa_company_census: {
            source_date: normalized.carrierFilingDate,
            retrieved_at:
              Object.values(evidence).find((item) => item.retrievedAt)?.retrievedAt ?? null,
          },
        },
      })
      .select(
        "id,lead_id,legal_name,dba_name,mc_number,dot_number,officer_name,phone,cell_phone,email,physical_address,city,home_state,postal_code,drivers,power_units,hazmat_declared,source_summary",
      )
      .single();

    if (error || !data) {
      // A concurrent request may have created the same DOT/MC after our lookup.
      if (error?.code === "23505") {
        carrier = await resolveExistingCarrier(
          admin,
          input.workspaceId,
          normalized.dotNumber,
          normalized.mcNumber,
        );
      }
      if (!carrier) throw new Error(`Carrier creation failed: ${error?.message ?? "unknown error"}`);
    } else {
      carrier = data as ExistingCarrier;
      created = true;
    }
  }

  const currentEvidence = await currentFieldEvidence(admin, input.workspaceId, carrier.id);
  const sourceRecordInserted = await insertSourceRecord(admin, input, carrier.id);

  // Exact same source payload has already been processed. Avoid duplicating the
  // historical provenance ledger and touching normalized timestamps again.
  if (!sourceRecordInserted) {
    return {
      carrierId: carrier.id,
      created,
      sourceRecordInserted: false,
      normalizedFieldsUpdated: [],
    };
  }

  const accepted = acceptedEvidence(currentEvidence, evidence);
  const updates = mappedCoreUpdates(accepted);
  const retrievedAt =
    Object.values(evidence).find((item) => item.retrievedAt)?.retrievedAt ??
    new Date().toISOString();
  const nextSourceSummary = {
    ...(carrier.source_summary ?? {}),
    fmcsa_company_census: {
      source_date: normalized.carrierFilingDate,
      retrieved_at: retrievedAt,
    },
  };

  if (input.leadId && !carrier.lead_id) updates.lead_id = input.leadId;
  updates.source_summary = nextSourceSummary;
  updates.data_freshness_at = normalized.carrierFilingDate ?? retrievedAt;
  updates.last_verified_at = retrievedAt;

  if (Object.keys(updates).length) {
    const { error } = await admin
      .from("apex_carriers")
      .update(updates)
      .eq("workspace_id", input.workspaceId)
      .eq("id", carrier.id);
    if (error) throw new Error(`Carrier core update failed: ${error.message}`);
  }

  await appendProvenanceLedger(admin, input.workspaceId, carrier.id, evidence, currentEvidence);
  await upsertCurrentEvidence(admin, input.workspaceId, carrier.id, accepted);

  return {
    carrierId: carrier.id,
    created,
    sourceRecordInserted: true,
    normalizedFieldsUpdated: accepted.map(([fieldKey]) => fieldKey),
  };
}
