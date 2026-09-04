import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { lookupAndPersistCarrierCore } from "@/lib/carrier-intelligence/service";
import { loadCarrier360Profile } from "@/lib/carrier-intelligence/read";
import {
  DEFAULT_CARRIER_FACTORY_CONFIG,
  type ApexLeadTier,
  type CarrierFactoryCandidate,
} from "@/lib/apex-lead-factory/contracts";
import {
  companyCensusRowsToFactoryCandidates,
  discoverCompanyCensusRows,
} from "@/lib/apex-lead-factory/discovery";
import { fetchObservedEquipmentForCarriers } from "@/lib/apex-lead-factory/equipment";
import { materialFingerprint } from "@/lib/apex-lead-factory/factory";
import { scoreCarrierOpportunity } from "@/lib/apex-lead-factory/scoring";

const MAX_QUEUE_MULTIPLIER = 5;
const HISTORY_QUERY_CHUNK = 200;
const INSERT_CHUNK = 250;

function adminOrThrow() {
  const admin = createAdminClient();
  if (!admin) throw new Error("Server-side Supabase credentials are required for the Apex lead factory.");
  return admin;
}

function normalizeUsdot(value: string): string {
  return value.replace(/\D/g, "").replace(/^0+/, "");
}

function isoDate(value = new Date()): string {
  return value.toISOString().slice(0, 10);
}

function chunk<T>(items: T[], size: number): T[][] {
  const output: T[][] = [];
  for (let index = 0; index < items.length; index += size) output.push(items.slice(index, index + size));
  return output;
}

function verifiedPublicContact(candidate: CarrierFactoryCandidate): boolean {
  const phone = candidate.profile.identity.phone ?? candidate.profile.identity.cellPhone;
  const email = candidate.profile.identity.email;
  return [phone, email].some(
    (item) => Boolean(item?.value) && (item?.verificationState === "verified" || item?.verificationState === "derived"),
  );
}

interface WorkItemRow {
  id: string;
  workspace_id: string;
  batch_id: string;
  usdot_number: string;
  discovery_score: number;
  status: string;
  candidate_payload: unknown;
  attempts: number;
  max_attempts: number;
}

interface ReadyWorkRow extends WorkItemRow {
  carrier_id: string | null;
  lead_id: string | null;
  opportunity_score: number | null;
  tier: ApexLeadTier | null;
  material_fingerprint: string | null;
  dossier: Record<string, unknown> | null;
}

export interface StartCarrierFactoryInput {
  workspaceId: string;
  batchDate?: string;
  quota?: number;
  scanTarget?: number;
  queueMultiplier?: number;
}

export interface StartCarrierFactoryResult {
  batchId: string;
  batchDate: string;
  quota: number;
  candidatesScanned: number;
  queued: number;
  lifetimeSuppressed: number;
  poolSize: number;
}

async function previouslyDeliveredUsdots(workspaceId: string, usdots: string[]): Promise<Set<string>> {
  const admin = adminOrThrow();
  const seen = new Set<string>();
  for (const group of chunk([...new Set(usdots.map(normalizeUsdot).filter(Boolean))], HISTORY_QUERY_CHUNK)) {
    const { data, error } = await admin
      .from("apex_carrier_lead_delivery_ledger")
      .select("usdot_number")
      .eq("workspace_id", workspaceId)
      .in("usdot_number", group);
    if (error) throw new Error(`Apex factory delivery-history read failed: ${error.message}`);
    for (const row of data ?? []) seen.add(normalizeUsdot(String(row.usdot_number ?? "")));
  }
  return seen;
}

/**
 * Starts/resumes the daily factory. Discovery intentionally over-collects and
 * ranks a candidate pool. Previously delivered USDOTs are suppressed unless the
 * public discovery record carries a recent material-change signal.
 */
export async function startCarrierFactory(input: StartCarrierFactoryInput): Promise<StartCarrierFactoryResult> {
  const admin = adminOrThrow();
  const quota = Math.min(10_000, Math.max(1, Math.trunc(input.quota ?? DEFAULT_CARRIER_FACTORY_CONFIG.dailyQuota)));
  const queueMultiplier = Math.min(
    MAX_QUEUE_MULTIPLIER,
    Math.max(2, Math.trunc(input.queueMultiplier ?? 3)),
  );
  const batchDate = input.batchDate ?? isoDate();

  const { data: existingBatch, error: existingError } = await admin
    .from("apex_carrier_factory_batches")
    .select("id,status,quota")
    .eq("workspace_id", input.workspaceId)
    .eq("batch_date", batchDate)
    .maybeSingle();
  if (existingError) throw new Error(`Apex factory batch read failed: ${existingError.message}`);
  if (existingBatch?.status === "completed") {
    return {
      batchId: String(existingBatch.id),
      batchDate,
      quota: Number(existingBatch.quota ?? quota),
      candidatesScanned: 0,
      queued: 0,
      lifetimeSuppressed: 0,
      poolSize: 0,
    };
  }

  let batchId = existingBatch?.id ? String(existingBatch.id) : "";
  if (!batchId) {
    const { data, error } = await admin
      .from("apex_carrier_factory_batches")
      .insert({
        workspace_id: input.workspaceId,
        batch_date: batchDate,
        quota,
        status: "building",
        config: {
          scanTarget: input.scanTarget ?? 20_000,
          queueMultiplier,
          scoringVersion: DEFAULT_CARRIER_FACTORY_CONFIG.scoringVersion,
        },
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(`Apex factory batch creation failed: ${error?.message ?? "missing batch"}`);
    batchId = String(data.id);
  }

  const discovery = await discoverCompanyCensusRows({ scanTarget: input.scanTarget ?? 20_000 });
  const candidates = companyCensusRowsToFactoryCandidates(input.workspaceId, discovery.rows);
  const ranked = candidates
    .map((candidate) => ({
      candidate,
      score: scoreCarrierOpportunity(candidate).score,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.min(candidates.length, quota * queueMultiplier));

  const seenUsdots = await previouslyDeliveredUsdots(
    input.workspaceId,
    ranked.map(({ candidate }) => candidate.usdotNumber),
  );

  let lifetimeSuppressed = 0;
  const workRows = ranked.flatMap(({ candidate, score }, index) => {
    const usdot = normalizeUsdot(candidate.usdotNumber);
    const previouslyDelivered = seenUsdots.has(usdot);
    const hasMaterialChange = Boolean(candidate.materialChangeKinds?.length);
    if (previouslyDelivered && !hasMaterialChange) {
      lifetimeSuppressed += 1;
      return [];
    }
    return [
      {
        workspace_id: input.workspaceId,
        batch_id: batchId,
        usdot_number: usdot,
        discovery_score: score,
        priority: ranked.length - index,
        status: "queued",
        candidate_payload: candidate,
      },
    ];
  });

  for (const group of chunk(workRows, INSERT_CHUNK)) {
    if (!group.length) continue;
    const { error } = await admin
      .from("apex_carrier_factory_work_items")
      .upsert(group, {
        onConflict: "workspace_id,batch_id,usdot_number",
        ignoreDuplicates: true,
      });
    if (error) throw new Error(`Apex factory work seeding failed: ${error.message}`);
  }

  const { error: updateError } = await admin
    .from("apex_carrier_factory_batches")
    .update({
      quota,
      candidates_scanned: discovery.scanned,
      eligible_candidates: workRows.length,
      deduped_candidates: lifetimeSuppressed,
      updated_at: new Date().toISOString(),
    })
    .eq("workspace_id", input.workspaceId)
    .eq("id", batchId);
  if (updateError) throw new Error(`Apex factory batch update failed: ${updateError.message}`);

  return {
    batchId,
    batchDate,
    quota,
    candidatesScanned: discovery.scanned,
    queued: workRows.length,
    lifetimeSuppressed,
    poolSize: ranked.length,
  };
}

function retryAt(attempts: number): string {
  const minutes = Math.min(30, Math.max(1, attempts * attempts));
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

async function markWorkFailure(row: WorkItemRow, message: string) {
  const admin = adminOrThrow();
  const terminal = row.attempts >= row.max_attempts;
  const { error } = await admin
    .from("apex_carrier_factory_work_items")
    .update({
      status: terminal ? "failed" : "queued",
      available_at: terminal ? new Date().toISOString() : retryAt(row.attempts),
      locked_at: null,
      locked_by: null,
      last_error: message.slice(0, 2_000),
      updated_at: new Date().toISOString(),
    })
    .eq("workspace_id", row.workspace_id)
    .eq("id", row.id);
  if (error) throw new Error(`Apex factory failure-state write failed: ${error.message}`);
}

async function markWorkRejected(row: WorkItemRow, message: string) {
  const admin = adminOrThrow();
  const { error } = await admin
    .from("apex_carrier_factory_work_items")
    .update({
      status: "rejected",
      locked_at: null,
      locked_by: null,
      last_error: message.slice(0, 2_000),
      updated_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    })
    .eq("workspace_id", row.workspace_id)
    .eq("id", row.id);
  if (error) throw new Error(`Apex factory rejection write failed: ${error.message}`);
}

export interface ProcessCarrierFactoryResult {
  claimed: number;
  ready: number;
  rejected: number;
  retried: number;
  failed: number;
}

/**
 * Processes one bounded worker chunk. Calling this repeatedly is safe; queue
 * leases and retry state prevent one failing carrier from losing the daily run.
 */
export async function processCarrierFactoryWork(
  workspaceId: string,
  batchId: string,
  workerId: string,
  limit = 25,
): Promise<ProcessCarrierFactoryResult> {
  const admin = adminOrThrow();
  const boundedLimit = Math.min(50, Math.max(1, Math.trunc(limit)));
  await admin.rpc("release_stale_apex_carrier_factory_work", {
    p_workspace_id: workspaceId,
  });

  const { data: claimedData, error: claimError } = await admin.rpc("claim_apex_carrier_factory_work", {
    p_workspace_id: workspaceId,
    p_batch_id: batchId,
    p_worker_id: workerId,
    p_limit: boundedLimit,
  });
  if (claimError) throw new Error(`Apex factory work claim failed: ${claimError.message}`);
  const claimed = (claimedData ?? []) as WorkItemRow[];
  if (!claimed.length) return { claimed: 0, ready: 0, rejected: 0, retried: 0, failed: 0 };

  let equipmentByDot = new Map<string, Awaited<ReturnType<typeof fetchObservedEquipmentForCarriers>>[number]>();
  try {
    const equipment = await fetchObservedEquipmentForCarriers(claimed.map((row) => row.usdot_number));
    equipmentByDot = new Map(equipment.map((item) => [normalizeUsdot(item.usdotNumber), item]));
  } catch (error) {
    // Equipment is high-value enrichment, but a temporary inspection-source
    // outage must not block identity/authority enrichment for the entire chunk.
    console.error("Apex factory equipment enrichment unavailable", {
      batchId,
      error: error instanceof Error ? error.message : "unknown error",
    });
  }

  const result: ProcessCarrierFactoryResult = {
    claimed: claimed.length,
    ready: 0,
    rejected: 0,
    retried: 0,
    failed: 0,
  };

  for (const row of claimed) {
    try {
      const discoveryCandidate = row.candidate_payload as CarrierFactoryCandidate;
      const lookup = await lookupAndPersistCarrierCore({
        workspaceId,
        query: row.usdot_number,
        preferredKind: "dot",
      });

      if (lookup.status !== "ok") {
        if (lookup.status === "source_unavailable") {
          await markWorkFailure(row, lookup.message);
          if (row.attempts >= row.max_attempts) result.failed += 1;
          else result.retried += 1;
        } else {
          await markWorkRejected(row, lookup.message);
          result.rejected += 1;
        }
        continue;
      }

      const profile = await loadCarrier360Profile(workspaceId, lookup.carrierId);
      if (!profile) {
        await markWorkFailure(row, "Carrier persisted but Carrier 360 profile could not be reconstructed.");
        if (row.attempts >= row.max_attempts) result.failed += 1;
        else result.retried += 1;
        continue;
      }

      const equipment = equipmentByDot.get(normalizeUsdot(row.usdot_number));
      const enriched: CarrierFactoryCandidate = {
        ...discoveryCandidate,
        profile,
        observedEquipment: equipment?.observations ?? discoveryCandidate.observedEquipment ?? [],
        publicBusinessContactVerified: verifiedPublicContact({ ...discoveryCandidate, profile }),
        materialChangeKinds: [
          ...(discoveryCandidate.materialChangeKinds ?? []),
          ...(equipment?.observations.length ? (["equipment"] as const) : []),
        ],
      };
      const opportunity = scoreCarrierOpportunity(enriched);
      if (opportunity.score < DEFAULT_CARRIER_FACTORY_CONFIG.minimumScore) {
        await markWorkRejected(row, `Deep opportunity score ${opportunity.score} is below the delivery floor.`);
        result.rejected += 1;
        continue;
      }

      const fingerprint = materialFingerprint(enriched);
      const { data: duplicate, error: duplicateError } = await admin
        .from("apex_carrier_lead_delivery_ledger")
        .select("id,delivered_at")
        .eq("workspace_id", workspaceId)
        .eq("usdot_number", normalizeUsdot(row.usdot_number))
        .eq("material_fingerprint", fingerprint)
        .limit(1)
        .maybeSingle();
      if (duplicateError) throw new Error(`Apex delivery dedupe read failed: ${duplicateError.message}`);
      if (duplicate) {
        await markWorkRejected(row, `Same material carrier version was already delivered at ${duplicate.delivered_at}.`);
        result.rejected += 1;
        continue;
      }

      const { data: carrierRow, error: carrierError } = await admin
        .from("apex_carriers")
        .select("lead_id")
        .eq("workspace_id", workspaceId)
        .eq("id", lookup.carrierId)
        .maybeSingle();
      if (carrierError) throw new Error(`Apex carrier lead-link read failed: ${carrierError.message}`);

      const dossier = {
        candidate: enriched,
        opportunity,
        equipmentEvidence: {
          inspectionCountUsed: equipment?.inspectionCountUsed ?? 0,
          vinDecodeCount: equipment?.vinDecodeCount ?? 0,
          note: "Observed equipment is inspection evidence, not a complete declared fleet inventory.",
        },
      };

      const { error: readyError } = await admin
        .from("apex_carrier_factory_work_items")
        .update({
          status: "ready",
          carrier_id: lookup.carrierId,
          lead_id: carrierRow?.lead_id ?? null,
          opportunity_score: opportunity.score,
          tier: opportunity.tier,
          material_fingerprint: fingerprint,
          dossier,
          locked_at: null,
          locked_by: null,
          last_error: null,
          updated_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
        })
        .eq("workspace_id", workspaceId)
        .eq("id", row.id);
      if (readyError) throw new Error(`Apex factory ready-state write failed: ${readyError.message}`);
      result.ready += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown carrier enrichment failure.";
      await markWorkFailure(row, message);
      if (row.attempts >= row.max_attempts) result.failed += 1;
      else result.retried += 1;
    }
  }

  return result;
}

export interface FinalizeCarrierFactoryResult {
  status: "completed" | "waiting_for_more_ready";
  quota: number;
  ready: number;
  delivered: number;
  tierCounts: Record<ApexLeadTier, number>;
}

/**
 * Closes a daily batch only after the requested quota is ready. This preserves
 * the user's "1,000 delivered" contract rather than silently calling a partial
 * day successful.
 */
export async function finalizeCarrierFactoryBatch(
  workspaceId: string,
  batchId: string,
): Promise<FinalizeCarrierFactoryResult> {
  const admin = adminOrThrow();
  const { data: batch, error: batchError } = await admin
    .from("apex_carrier_factory_batches")
    .select("quota,status")
    .eq("workspace_id", workspaceId)
    .eq("id", batchId)
    .single();
  if (batchError || !batch) throw new Error(`Apex factory batch read failed: ${batchError?.message ?? "missing batch"}`);

  const quota = Number(batch.quota ?? DEFAULT_CARRIER_FACTORY_CONFIG.dailyQuota);
  const { data: readyData, error: readyError } = await admin
    .from("apex_carrier_factory_work_items")
    .select(
      "id,workspace_id,batch_id,usdot_number,discovery_score,status,candidate_payload,attempts,max_attempts,carrier_id,lead_id,opportunity_score,tier,material_fingerprint,dossier",
    )
    .eq("workspace_id", workspaceId)
    .eq("batch_id", batchId)
    .eq("status", "ready")
    .order("opportunity_score", { ascending: false })
    .order("discovery_score", { ascending: false })
    .limit(quota);
  if (readyError) throw new Error(`Apex factory ready-queue read failed: ${readyError.message}`);
  const ready = (readyData ?? []) as ReadyWorkRow[];
  const tierCounts: Record<ApexLeadTier, number> = { A: 0, B: 0, C: 0 };

  if (ready.length < quota) {
    for (const row of ready) if (row.tier) tierCounts[row.tier] += 1;
    return {
      status: "waiting_for_more_ready",
      quota,
      ready: ready.length,
      delivered: 0,
      tierCounts,
    };
  }

  const deliveredUsdots = await previouslyDeliveredUsdots(
    workspaceId,
    ready.map((row) => row.usdot_number),
  );
  const deliveredAt = new Date().toISOString();
  const ledgerRows = ready.map((row) => {
    if (!row.opportunity_score || !row.tier || !row.material_fingerprint || !row.dossier) {
      throw new Error(`Ready work item ${row.id} is missing required delivery fields.`);
    }
    tierCounts[row.tier] += 1;
    const candidate = row.dossier.candidate as CarrierFactoryCandidate | undefined;
    return {
      workspace_id: workspaceId,
      batch_id: batchId,
      carrier_id: row.carrier_id,
      lead_id: row.lead_id,
      usdot_number: normalizeUsdot(row.usdot_number),
      material_fingerprint: row.material_fingerprint,
      material_change_kinds: candidate?.materialChangeKinds ?? [],
      opportunity_score: row.opportunity_score,
      tier: row.tier,
      new_to_apex: !deliveredUsdots.has(normalizeUsdot(row.usdot_number)),
      previously_delivered_at: null,
      source_freshness_at: candidate?.sourceUpdatedAt ?? candidate?.mcs150UpdatedAt ?? null,
      dossier: row.dossier,
      delivered_at: deliveredAt,
    };
  });

  const { error: ledgerError } = await admin
    .from("apex_carrier_lead_delivery_ledger")
    .upsert(ledgerRows, {
      onConflict: "workspace_id,usdot_number,material_fingerprint",
      ignoreDuplicates: true,
    });
  if (ledgerError) throw new Error(`Apex factory delivery-ledger write failed: ${ledgerError.message}`);

  const ids = ready.map((row) => row.id);
  for (const group of chunk(ids, INSERT_CHUNK)) {
    const { error } = await admin
      .from("apex_carrier_factory_work_items")
      .update({ status: "delivered", updated_at: deliveredAt })
      .eq("workspace_id", workspaceId)
      .in("id", group);
    if (error) throw new Error(`Apex factory delivery-state update failed: ${error.message}`);
  }

  const { error: completeError } = await admin
    .from("apex_carrier_factory_batches")
    .update({
      status: "completed",
      delivered_count: quota,
      tier_a_count: tierCounts.A,
      tier_b_count: tierCounts.B,
      tier_c_count: tierCounts.C,
      completed_at: deliveredAt,
      updated_at: deliveredAt,
    })
    .eq("workspace_id", workspaceId)
    .eq("id", batchId);
  if (completeError) throw new Error(`Apex factory completion write failed: ${completeError.message}`);

  return {
    status: "completed",
    quota,
    ready: ready.length,
    delivered: quota,
    tierCounts,
  };
}
