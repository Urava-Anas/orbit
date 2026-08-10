import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  executeStageFourAction,
  requestStageFourAction,
} from "@/lib/agents/stage4-runtime";

type WorkerResult = {
  configured: boolean;
  planned: number;
  planningErrors: number;
  claimed: number;
  succeeded: number;
  failed: number;
  blocked: number;
  results: Array<Record<string, unknown>>;
};

type OpportunityRow = {
  id: string;
  lead_id: string;
  current_state: string;
};

type LeadContact = {
  name: string;
  company: string | null;
  email: string | null;
  whatsapp: string | null;
  phone: string | null;
};

type FollowupTouch = {
  touch?: number;
  delayHours?: number;
};

async function loadLeadContact(
  admin: SupabaseClient,
  workspaceId: string,
  leadId: string,
): Promise<LeadContact | null> {
  const lead = await admin
    .from("leads")
    .select("name,company,email,whatsapp,phone")
    .eq("workspace_id", workspaceId)
    .eq("id", leadId)
    .maybeSingle();
  if (lead.error) throw new Error(`Load Stage 4 planner lead: ${lead.error.message}`);
  return (lead.data as LeadContact | null) ?? null;
}

function chooseAutomatedChannel(lead: LeadContact) {
  if (lead.email?.trim()) return "email" as const;
  if (lead.whatsapp?.trim() || lead.phone?.trim()) return "whatsapp" as const;
  return null;
}

async function existingAction(
  admin: SupabaseClient,
  workspaceId: string,
  opportunityId: string,
  capabilityKey: string,
) {
  const result = await admin
    .from("orbit_external_action_requests")
    .select("id,status,completed_at,artifact_refs")
    .eq("workspace_id", workspaceId)
    .eq("opportunity_id", opportunityId)
    .eq("capability_key", capabilityKey)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (result.error) throw new Error(`Load Stage 4 planner action: ${result.error.message}`);
  return result.data;
}

async function planWaitingReply(
  admin: SupabaseClient,
  workspaceId: string,
  ownerId: string,
  opportunity: OpportunityRow,
) {
  const priorOutreach = await existingAction(
    admin,
    workspaceId,
    opportunity.id,
    "growth.outreach_send",
  );

  if (!priorOutreach) {
    const draft = await admin
      .from("orbit_outreach_drafts")
      .select("id,channel")
      .eq("workspace_id", workspaceId)
      .eq("lead_id", opportunity.lead_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (draft.error) throw new Error(`Load Stage 4 planner outreach draft: ${draft.error.message}`);
    if (!draft.data || !["email", "whatsapp"].includes(draft.data.channel)) return null;

    return requestStageFourAction(admin, workspaceId, ownerId, {
      opportunityId: opportunity.id,
      capabilityKey: "growth.outreach_send",
      artifactId: draft.data.id,
      channel: draft.data.channel,
      idempotencyKey: `stage4:${opportunity.id}:outreach:${draft.data.id}`,
    });
  }

  if (priorOutreach.status !== "succeeded") return null;

  const inbound = await admin
    .from("lead_activities")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("lead_id", opportunity.lead_id)
    .eq("direction", "inbound");
  if (inbound.error) throw new Error(`Check Stage 4 planner inbound stop: ${inbound.error.message}`);
  if ((inbound.count ?? 0) > 0) return null;

  const pendingFollowup = await admin
    .from("orbit_external_action_requests")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("opportunity_id", opportunity.id)
    .eq("capability_key", "growth.followup_send")
    .neq("status", "succeeded")
    .limit(1)
    .maybeSingle();
  if (pendingFollowup.error) throw new Error(`Load Stage 4 planner pending follow-up: ${pendingFollowup.error.message}`);
  if (pendingFollowup.data) return null;

  const followupPlan = await admin
    .from("orbit_followup_plans")
    .select("id,channel,sequence,status")
    .eq("workspace_id", workspaceId)
    .eq("opportunity_id", opportunity.id)
    .eq("status", "ready")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (followupPlan.error) throw new Error(`Load Stage 4 planner follow-up plan: ${followupPlan.error.message}`);
  if (!followupPlan.data || !["email", "whatsapp"].includes(followupPlan.data.channel)) return null;

  const successfulFollowups = await admin
    .from("orbit_external_action_requests")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("opportunity_id", opportunity.id)
    .eq("capability_key", "growth.followup_send")
    .eq("status", "succeeded");
  if (successfulFollowups.error) throw new Error(`Count Stage 4 planner follow-ups: ${successfulFollowups.error.message}`);

  const touchIndex = successfulFollowups.count ?? 0;
  const sequence = Array.isArray(followupPlan.data.sequence)
    ? (followupPlan.data.sequence as FollowupTouch[])
    : [];
  const touch = sequence[touchIndex];
  if (!touch) return null;

  const lastOutbound = await admin
    .from("orbit_external_action_requests")
    .select("completed_at")
    .eq("workspace_id", workspaceId)
    .eq("opportunity_id", opportunity.id)
    .in("capability_key", ["growth.outreach_send", "growth.followup_send"])
    .eq("status", "succeeded")
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastOutbound.error) throw new Error(`Load Stage 4 planner last outbound: ${lastOutbound.error.message}`);
  if (!lastOutbound.data?.completed_at) return null;

  const delayHours = Math.max(1, Number(touch.delayHours ?? 24));
  const scheduledAt = new Date(
    Date.parse(lastOutbound.data.completed_at) + delayHours * 60 * 60 * 1000,
  ).toISOString();

  return requestStageFourAction(admin, workspaceId, ownerId, {
    opportunityId: opportunity.id,
    capabilityKey: "growth.followup_send",
    artifactId: followupPlan.data.id,
    channel: followupPlan.data.channel,
    touchIndex,
    scheduledAt,
    idempotencyKey: `stage4:${opportunity.id}:followup:${followupPlan.data.id}:${touchIndex}`,
  });
}

async function planProposal(
  admin: SupabaseClient,
  workspaceId: string,
  ownerId: string,
  opportunity: OpportunityRow,
) {
  const prior = await existingAction(admin, workspaceId, opportunity.id, "growth.proposal_send");
  if (prior) return null;
  const [proposal, lead] = await Promise.all([
    admin
      .from("orbit_proposal_drafts")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("opportunity_id", opportunity.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    loadLeadContact(admin, workspaceId, opportunity.lead_id),
  ]);
  if (proposal.error) throw new Error(`Load Stage 4 planner proposal: ${proposal.error.message}`);
  if (!proposal.data || !lead) return null;
  const channel = chooseAutomatedChannel(lead);
  if (!channel) return null;

  return requestStageFourAction(admin, workspaceId, ownerId, {
    opportunityId: opportunity.id,
    capabilityKey: "growth.proposal_send",
    artifactId: proposal.data.id,
    channel,
    idempotencyKey: `stage4:${opportunity.id}:proposal:${proposal.data.id}`,
  });
}

async function planProofAndReferral(
  admin: SupabaseClient,
  workspaceId: string,
  ownerId: string,
  opportunity: OpportunityRow,
) {
  const plan = await admin
    .from("orbit_proof_referral_plans")
    .select("id,status,proof_permission_scope")
    .eq("workspace_id", workspaceId)
    .eq("opportunity_id", opportunity.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (plan.error) throw new Error(`Load Stage 4 planner proof/referral plan: ${plan.error.message}`);
  if (!plan.data || plan.data.status !== "ready") return [];

  const results: unknown[] = [];
  if (["anonymous", "public"].includes(plan.data.proof_permission_scope)) {
    const proofAction = await existingAction(admin, workspaceId, opportunity.id, "proof.publish");
    if (!proofAction) {
      const lead = await loadLeadContact(admin, workspaceId, opportunity.lead_id);
      if (lead) {
        try {
          results.push(
            await requestStageFourAction(admin, workspaceId, ownerId, {
              opportunityId: opportunity.id,
              capabilityKey: "proof.publish",
              artifactId: plan.data.id,
              channel: "system",
              proofTitle: `${lead.company ?? lead.name} — project result`,
              idempotencyKey: `stage4:${opportunity.id}:proof:${plan.data.id}`,
            }),
          );
        } catch {
          // Founder-only proof publishing remains absent if project/permission prerequisites are incomplete.
        }
      }
    }
  }

  const referralAction = await existingAction(admin, workspaceId, opportunity.id, "growth.referral_send");
  if (!referralAction) {
    const lead = await loadLeadContact(admin, workspaceId, opportunity.lead_id);
    if (lead) {
      const channel = chooseAutomatedChannel(lead);
      if (channel) {
        results.push(
          await requestStageFourAction(admin, workspaceId, ownerId, {
            opportunityId: opportunity.id,
            capabilityKey: "growth.referral_send",
            artifactId: plan.data.id,
            channel,
            idempotencyKey: `stage4:${opportunity.id}:referral:${plan.data.id}`,
          }),
        );
      }
    }
  }
  return results;
}

async function planStageFourActions(admin: SupabaseClient) {
  const configs = await admin
    .from("orbit_autopilot_configs")
    .select("workspace_id,state")
    .in("state", ["running", "degraded"]);
  if (configs.error) throw new Error(`Load Stage 4 planner workspaces: ${configs.error.message}`);

  let planned = 0;
  let planningErrors = 0;
  const planningResults: Array<Record<string, unknown>> = [];

  for (const config of configs.data ?? []) {
    const workspace = await admin
      .from("workspaces")
      .select("owner_id")
      .eq("id", config.workspace_id)
      .single();
    if (workspace.error || !workspace.data?.owner_id) {
      planningErrors += 1;
      continue;
    }

    const opportunities = await admin
      .from("orbit_sales_opportunities")
      .select("id,lead_id,current_state")
      .eq("workspace_id", config.workspace_id)
      .in("current_state", ["waiting_reply", "proposal_drafted", "referral_ready"])
      .order("updated_at", { ascending: true })
      .limit(50);
    if (opportunities.error) {
      planningErrors += 1;
      continue;
    }

    for (const opportunity of (opportunities.data ?? []) as OpportunityRow[]) {
      try {
        let plannedResult: unknown = null;
        if (opportunity.current_state === "waiting_reply") {
          plannedResult = await planWaitingReply(
            admin,
            config.workspace_id,
            workspace.data.owner_id,
            opportunity,
          );
        } else if (opportunity.current_state === "proposal_drafted") {
          plannedResult = await planProposal(
            admin,
            config.workspace_id,
            workspace.data.owner_id,
            opportunity,
          );
        } else if (opportunity.current_state === "referral_ready") {
          plannedResult = await planProofAndReferral(
            admin,
            config.workspace_id,
            workspace.data.owner_id,
            opportunity,
          );
        }

        const created = Array.isArray(plannedResult)
          ? plannedResult.filter(Boolean).length
          : plannedResult
            ? 1
            : 0;
        planned += created;
        if (created > 0) {
          planningResults.push({
            workspaceId: config.workspace_id,
            opportunityId: opportunity.id,
            state: opportunity.current_state,
            planned: created,
          });
        }
      } catch (error) {
        planningErrors += 1;
        planningResults.push({
          workspaceId: config.workspace_id,
          opportunityId: opportunity.id,
          state: opportunity.current_state,
          status: "planning_error",
          error: error instanceof Error ? error.message : "Unknown Stage 4 planning error",
        });
      }
    }
  }

  return { planned, planningErrors, planningResults };
}

export async function runStageFourAutopilotWorker(limit = 8): Promise<WorkerResult> {
  const admin = createAdminClient();
  if (!admin) {
    return {
      configured: false,
      planned: 0,
      planningErrors: 0,
      claimed: 0,
      succeeded: 0,
      failed: 0,
      blocked: 0,
      results: [],
    };
  }

  const planning = await planStageFourActions(admin);
  const boundedLimit = Math.max(1, Math.min(20, limit));
  const result: WorkerResult = {
    configured: true,
    planned: planning.planned,
    planningErrors: planning.planningErrors,
    claimed: 0,
    succeeded: 0,
    failed: 0,
    blocked: 0,
    results: [...planning.planningResults],
  };

  for (let index = 0; index < boundedLimit; index += 1) {
    const claim = await admin.rpc("claim_stage4_external_action");
    if (claim.error) {
      throw new Error(`Claim Stage 4 action: ${claim.error.message}`);
    }
    const actionRequestId = claim.data as string | null;
    if (!actionRequestId) break;
    result.claimed += 1;

    const action = await admin
      .from("orbit_external_action_requests")
      .select("id,workspace_id")
      .eq("id", actionRequestId)
      .single();
    if (action.error || !action.data) {
      result.failed += 1;
      result.results.push({ actionRequestId, status: "failed_to_load" });
      continue;
    }

    const workspace = await admin
      .from("workspaces")
      .select("owner_id")
      .eq("id", action.data.workspace_id)
      .single();
    if (workspace.error || !workspace.data?.owner_id) {
      result.failed += 1;
      result.results.push({
        actionRequestId,
        workspaceId: action.data.workspace_id,
        status: "workspace_owner_missing",
      });
      continue;
    }

    try {
      const execution = await executeStageFourAction(
        admin,
        action.data.workspace_id,
        workspace.data.owner_id,
        { actionRequestId },
      );
      const status = String(execution.status);
      if (status === "succeeded") result.succeeded += 1;
      else if (status === "blocked") result.blocked += 1;
      else result.failed += 1;
      result.results.push({
        actionRequestId,
        workspaceId: action.data.workspace_id,
        ...execution,
      });
    } catch (error) {
      result.failed += 1;
      result.results.push({
        actionRequestId,
        workspaceId: action.data.workspace_id,
        status: "worker_exception",
        error: error instanceof Error ? error.message : "Unknown Stage 4 worker error",
      });
    }
  }

  return result;
}
