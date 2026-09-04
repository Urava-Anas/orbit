import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { ApexLeadTier } from "@/lib/apex-lead-factory/contracts";

function adminOrThrow() {
  const admin = createAdminClient();
  if (!admin) throw new Error("Server-side Supabase credentials are required for Apex factory reads.");
  return admin;
}

export interface FactoryBatchSummary {
  id: string;
  batchDate: string;
  quota: number;
  candidatesScanned: number;
  eligibleCandidates: number;
  dedupedCandidates: number;
  deliveredCount: number;
  tierCounts: Record<ApexLeadTier, number>;
  status: string;
  startedAt: string;
  completedAt: string | null;
}

export async function getLatestCarrierFactoryBatch(workspaceId: string): Promise<FactoryBatchSummary | null> {
  const admin = adminOrThrow();
  const { data, error } = await admin
    .from("apex_carrier_factory_batches")
    .select(
      "id,batch_date,quota,candidates_scanned,eligible_candidates,deduped_candidates,delivered_count,tier_a_count,tier_b_count,tier_c_count,status,started_at,completed_at",
    )
    .eq("workspace_id", workspaceId)
    .order("batch_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Apex factory latest-batch read failed: ${error.message}`);
  if (!data) return null;
  return {
    id: String(data.id),
    batchDate: String(data.batch_date),
    quota: Number(data.quota ?? 0),
    candidatesScanned: Number(data.candidates_scanned ?? 0),
    eligibleCandidates: Number(data.eligible_candidates ?? 0),
    dedupedCandidates: Number(data.deduped_candidates ?? 0),
    deliveredCount: Number(data.delivered_count ?? 0),
    tierCounts: {
      A: Number(data.tier_a_count ?? 0),
      B: Number(data.tier_b_count ?? 0),
      C: Number(data.tier_c_count ?? 0),
    },
    status: String(data.status),
    startedAt: String(data.started_at),
    completedAt: data.completed_at ? String(data.completed_at) : null,
  };
}

export interface ListCarrierFactoryLeadsInput {
  workspaceId: string;
  batchId: string;
  page?: number;
  pageSize?: number;
  tier?: ApexLeadTier;
}

export async function listCarrierFactoryLeads(input: ListCarrierFactoryLeadsInput) {
  const admin = adminOrThrow();
  const page = Math.max(1, Math.trunc(input.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Math.trunc(input.pageSize ?? 25)));
  const start = (page - 1) * pageSize;
  const end = start + pageSize - 1;

  let query = admin
    .from("apex_carrier_lead_delivery_ledger")
    .select(
      "id,batch_id,carrier_id,lead_id,usdot_number,material_change_kinds,opportunity_score,tier,new_to_apex,previously_delivered_at,source_freshness_at,dossier,delivered_at",
      { count: "exact" },
    )
    .eq("workspace_id", input.workspaceId)
    .eq("batch_id", input.batchId);

  if (input.tier) query = query.eq("tier", input.tier);

  const { data, error, count } = await query
    .order("opportunity_score", { ascending: false })
    .order("delivered_at", { ascending: true })
    .range(start, end);
  if (error) throw new Error(`Apex factory dossier read failed: ${error.message}`);

  return {
    page,
    pageSize,
    total: count ?? 0,
    hasMore: start + (data?.length ?? 0) < (count ?? 0),
    leads: data ?? [],
  };
}
