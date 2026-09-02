import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { registerCarrierIdentifier } from "./identifier-store";
import type { MotusMcResolution } from "./motus";
import { carrierSourcePayloadHash } from "./store";

export type PersistMotusMcResolutionInput = {
  workspaceId: string;
  carrierId: string;
  resolution: Extract<MotusMcResolution, { status: "resolved" }>;
  retrievedAt?: string;
};

function adminOrThrow() {
  const admin = createAdminClient();
  if (!admin) {
    throw new Error("Server-side Supabase credentials are required for Motus evidence writes.");
  }
  return admin;
}

/**
 * Persist the identity evidence used to resolve an MC docket to a USDOT entity.
 * Authority status/type normalization remains a separate step because those
 * fields require their own dated lifecycle semantics and validation fixtures.
 */
export async function persistMotusMcResolution(input: PersistMotusMcResolutionInput) {
  const admin = adminOrThrow();
  const retrievedAt = input.retrievedAt ?? new Date().toISOString();
  const payloadHash = carrierSourcePayloadHash(input.resolution.rows);

  const sourceRecord = await admin.from("apex_carrier_source_records").insert({
    workspace_id: input.workspaceId,
    carrier_id: input.carrierId,
    source_key: "fmcsa_motus_carrier_history",
    external_record_id: `MC:${input.resolution.mcNumber}`,
    payload_hash: payloadHash,
    source_updated_at: null,
    payload: input.resolution.rows,
    retrieved_at: retrievedAt,
  });

  if (sourceRecord.error && sourceRecord.error.code !== "23505") {
    throw new Error(`Motus source-record write failed: ${sourceRecord.error.message}`);
  }

  await registerCarrierIdentifier({
    workspaceId: input.workspaceId,
    carrierId: input.carrierId,
    type: "usdot",
    value: input.resolution.dotNumber,
    isPrimary: true,
    status: "observed",
    sourceName: "FMCSA Motus Carrier",
    sourceReference: `MC ${input.resolution.mcNumber} → USDOT ${input.resolution.dotNumber}`,
    observedAt: retrievedAt,
  });

  await registerCarrierIdentifier({
    workspaceId: input.workspaceId,
    carrierId: input.carrierId,
    type: "mc",
    value: input.resolution.mcNumber,
    isPrimary: false,
    status: "observed",
    sourceName: "FMCSA Motus Carrier",
    sourceReference: `MC ${input.resolution.mcNumber} → USDOT ${input.resolution.dotNumber}`,
    observedAt: retrievedAt,
  });

  return { sourceRecordInserted: !sourceRecord.error };
}
