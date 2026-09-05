import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { NormalizedMotusAuthorityFact } from "./motus-authority";
import type { NormalizedMotusInsuranceFact } from "./motus-insurance";
import { carrierSourcePayloadHash } from "./store";

function adminOrThrow() {
  const admin = createAdminClient();
  if (!admin) {
    throw new Error("Server-side Supabase credentials are required for Motus regulatory writes.");
  }
  return admin;
}

async function insertSourceSnapshot(input: {
  workspaceId: string;
  carrierId: string;
  sourceKey: string;
  externalRecordId: string;
  payload: unknown;
  sourceUpdatedAt: string | null;
  retrievedAt: string;
}) {
  const admin = adminOrThrow();
  const { error } = await admin.from("apex_carrier_source_records").insert({
    workspace_id: input.workspaceId,
    carrier_id: input.carrierId,
    source_key: input.sourceKey,
    external_record_id: input.externalRecordId,
    payload_hash: carrierSourcePayloadHash(input.payload),
    source_updated_at: input.sourceUpdatedAt,
    payload: input.payload,
    retrieved_at: input.retrievedAt,
  });

  if (!error) return true;
  if (error.code === "23505") return false;
  throw new Error(`Motus source snapshot write failed: ${error.message}`);
}

function authoritySortKey(fact: NormalizedMotusAuthorityFact) {
  return [
    fact.docketNumber ?? "",
    fact.authorityType ?? "",
    fact.status ?? "",
    fact.statusChangedAt ?? "",
  ].join("|");
}

function insuranceSortKey(fact: NormalizedMotusInsuranceFact) {
  return [
    fact.docketNumber ?? "",
    fact.filingType ?? "",
    fact.policyNumber ?? "",
    fact.effectiveAt ?? "",
    fact.transactionAt ?? "",
  ].join("|");
}

/**
 * Persist current Motus authority rows and bounded AuthHist lifecycle rows.
 * Source snapshots gate normalized inserts, so retrying an identical payload is
 * idempotent. History timestamps are stored as lifecycle effective dates; they
 * are deliberately not promoted to original grant dates.
 */
export async function persistMotusAuthorityFacts(input: {
  workspaceId: string;
  carrierId: string;
  dotNumber: string;
  current: NormalizedMotusAuthorityFact[];
  history: NormalizedMotusAuthorityFact[];
  retrievedAt?: string;
}) {
  const admin = adminOrThrow();
  const retrievedAt = input.retrievedAt ?? new Date().toISOString();
  const current = [...input.current].sort((a, b) => authoritySortKey(a).localeCompare(authoritySortKey(b)));
  const history = [...input.history].sort((a, b) => authoritySortKey(a).localeCompare(authoritySortKey(b)));

  const currentInserted = await insertSourceSnapshot({
    workspaceId: input.workspaceId,
    carrierId: input.carrierId,
    sourceKey: "fmcsa_motus_carrier_history",
    externalRecordId: `USDOT:${input.dotNumber}:authority-current`,
    payload: current.map((fact) => fact.rawRecord),
    sourceUpdatedAt: null,
    retrievedAt,
  });

  const latestHistorySourceDate = history
    .map((fact) => fact.statusChangedAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null;

  const historyInserted = await insertSourceSnapshot({
    workspaceId: input.workspaceId,
    carrierId: input.carrierId,
    sourceKey: "fmcsa_motus_authority_history",
    externalRecordId: `USDOT:${input.dotNumber}:authority-history-bounded`,
    payload: history.map((fact) => fact.rawRecord),
    sourceUpdatedAt: latestHistorySourceDate,
    retrievedAt,
  });

  let factsInserted = 0;

  if (currentInserted && current.length) {
    const { error } = await admin.from("apex_carrier_authorities").insert(
      current.map((fact) => ({
        workspace_id: input.workspaceId,
        carrier_id: input.carrierId,
        docket_number: fact.docketNumber,
        authority_type: fact.authorityType ?? "unknown",
        status: fact.status ?? "unknown",
        granted_at: null,
        effective_at: null,
        revoked_at: null,
        source_name: "FMCSA Motus Carrier",
        source_reference: `USDOT ${input.dotNumber}${fact.docketNumber ? ` · ${fact.docketNumber}` : ""}`,
        source_date: null,
        retrieved_at: retrievedAt,
        raw_payload: fact.rawRecord,
      })),
    );
    if (error) throw new Error(`Motus current authority write failed: ${error.message}`);
    factsInserted += current.length;
  }

  if (historyInserted && history.length) {
    const { error } = await admin.from("apex_carrier_authorities").insert(
      history.map((fact) => ({
        workspace_id: input.workspaceId,
        carrier_id: input.carrierId,
        docket_number: fact.docketNumber,
        authority_type: fact.authorityType ?? "unknown",
        status: fact.status ?? "unknown",
        granted_at: null,
        effective_at: fact.statusChangedAt ? fact.statusChangedAt.slice(0, 10) : null,
        revoked_at: null,
        source_name: "FMCSA Motus AuthHist",
        source_reference: `USDOT ${input.dotNumber}${fact.docketNumber ? ` · ${fact.docketNumber}` : ""}`,
        source_date: fact.statusChangedAt,
        retrieved_at: retrievedAt,
        raw_payload: fact.rawRecord,
      })),
    );
    if (error) throw new Error(`Motus authority-history write failed: ${error.message}`);
    factsInserted += history.length;
  }

  return { currentSourceInserted: currentInserted, historySourceInserted: historyInserted, factsInserted };
}

/**
 * Persist the modern Motus active/pending insurance publication as regulatory
 * filing evidence. Required limits remain null because the federal published
 * coverage amount is not itself the broker/commercial requirement. Commercial
 * COI state stays outside this table and belongs to Credential Vault evidence.
 */
export async function persistMotusInsuranceFacts(input: {
  workspaceId: string;
  carrierId: string;
  dotNumber: string;
  filings: NormalizedMotusInsuranceFact[];
  retrievedAt?: string;
}) {
  const admin = adminOrThrow();
  const retrievedAt = input.retrievedAt ?? new Date().toISOString();
  const filings = [...input.filings].sort((a, b) => insuranceSortKey(a).localeCompare(insuranceSortKey(b)));
  const latestTransactionAt = filings
    .map((fact) => fact.transactionAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null;

  const sourceInserted = await insertSourceSnapshot({
    workspaceId: input.workspaceId,
    carrierId: input.carrierId,
    sourceKey: "fmcsa_motus_insurance_history",
    externalRecordId: `USDOT:${input.dotNumber}:insurance-active-pending`,
    payload: filings.map((fact) => fact.rawRecord),
    sourceUpdatedAt: latestTransactionAt,
    retrievedAt,
  });

  if (!sourceInserted || !filings.length) {
    return { sourceRecordInserted: sourceInserted, factsInserted: 0 };
  }

  const { error } = await admin.from("apex_carrier_insurance_filings").insert(
    filings.map((fact) => ({
      workspace_id: input.workspaceId,
      carrier_id: input.carrierId,
      filing_type: fact.filingType,
      insurer_name: fact.insurerName,
      policy_number: fact.policyNumber,
      required_amount: null,
      coverage_amount: fact.coverageAmount,
      status: fact.status,
      effective_at: fact.effectiveAt,
      cancellation_at: null,
      source_name: "FMCSA Motus Insur",
      source_reference: `USDOT ${input.dotNumber}${fact.docketNumber ? ` · ${fact.docketNumber}` : ""}`,
      source_date: fact.transactionAt,
      retrieved_at: retrievedAt,
      raw_payload: fact.rawRecord,
    })),
  );

  if (error) throw new Error(`Motus insurance filing write failed: ${error.message}`);
  return { sourceRecordInserted: true, factsInserted: filings.length };
}
