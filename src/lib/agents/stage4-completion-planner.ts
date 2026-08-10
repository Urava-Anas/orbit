import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { requestStageFourAction } from "@/lib/agents/stage4-runtime";

type PlannerResult = {
  configured: boolean;
  planned: number;
  skipped: number;
  errors: number;
  results: Array<Record<string, unknown>>;
};

type Opportunity = {
  id: string;
  lead_id: string;
  current_state: "payment_pending" | "handoff_ready";
};

type Lead = {
  name: string;
  company: string | null;
  email: string | null;
  whatsapp: string | null;
  phone: string | null;
};

function automatedChannel(lead: Lead) {
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
    .select("id,status")
    .eq("workspace_id", workspaceId)
    .eq("opportunity_id", opportunityId)
    .eq("capability_key", capabilityKey)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (result.error) throw new Error(`Load completion action ${capabilityKey}: ${result.error.message}`);
  return result.data;
}

async function loadLead(admin: SupabaseClient, workspaceId: string, leadId: string) {
  const result = await admin
    .from("leads")
    .select("name,company,email,whatsapp,phone")
    .eq("workspace_id", workspaceId)
    .eq("id", leadId)
    .single();
  if (result.error || !result.data) throw new Error("Stage 4 completion planner could not load the lead.");
  return result.data as Lead;
}

async function planPaymentRequest(
  admin: SupabaseClient,
  workspaceId: string,
  ownerId: string,
  opportunity: Opportunity,
) {
  if (await existingAction(admin, workspaceId, opportunity.id, "cash.payment_request")) {
    return { planned: false, reason: "payment_request_exists" };
  }
  const paymentInstructions = process.env.ORBIT_PAYMENT_INSTRUCTIONS?.trim();
  if (!paymentInstructions) {
    return { planned: false, reason: "payment_instructions_not_configured" };
  }
  const onboarding = await admin
    .from("orbit_onboarding_cases")
    .select("id,payment_status")
    .eq("workspace_id", workspaceId)
    .eq("opportunity_id", opportunity.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (onboarding.error) throw new Error(`Load Stage 4 onboarding case: ${onboarding.error.message}`);
  if (!onboarding.data || onboarding.data.payment_status !== "pending") {
    return { planned: false, reason: "payment_case_not_pending" };
  }
  const lead = await loadLead(admin, workspaceId, opportunity.lead_id);
  const channel = automatedChannel(lead);
  if (!channel) return { planned: false, reason: "no_automated_contact_channel" };

  const request = await requestStageFourAction(admin, workspaceId, ownerId, {
    opportunityId: opportunity.id,
    capabilityKey: "cash.payment_request",
    artifactId: onboarding.data.id,
    channel,
    paymentInstructions,
    idempotencyKey: `stage4:${opportunity.id}:payment-request:${onboarding.data.id}`,
  });
  return { planned: true, request };
}

async function planProjectActivation(
  admin: SupabaseClient,
  workspaceId: string,
  ownerId: string,
  opportunity: Opportunity,
) {
  if (await existingAction(admin, workspaceId, opportunity.id, "delivery.project_activate")) {
    return { planned: false, reason: "project_activation_exists" };
  }

  const handoff = await admin
    .from("orbit_delivery_handoffs")
    .select("id,status,capacity_status")
    .eq("workspace_id", workspaceId)
    .eq("opportunity_id", opportunity.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (handoff.error) throw new Error(`Load Stage 4 handoff: ${handoff.error.message}`);
  if (!handoff.data || handoff.data.status !== "ready" || handoff.data.capacity_status === "blocked") {
    return { planned: false, reason: "handoff_not_ready" };
  }

  const proposal = await admin
    .from("orbit_proposal_drafts")
    .select("id,title,price_min,price_max,currency")
    .eq("workspace_id", workspaceId)
    .eq("opportunity_id", opportunity.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (proposal.error) throw new Error(`Load Stage 4 accepted proposal: ${proposal.error.message}`);
  if (!proposal.data) return { planned: false, reason: "proposal_missing" };

  const priceMin = Number(proposal.data.price_min);
  const priceMax = Number(proposal.data.price_max);
  if (!Number.isFinite(priceMin) || !Number.isFinite(priceMax) || priceMin !== priceMax) {
    return { planned: false, reason: "exact_agreed_value_required" };
  }

  const lead = await loadLead(admin, workspaceId, opportunity.lead_id);
  const business = (lead.company ?? lead.name).trim();
  const request = await requestStageFourAction(admin, workspaceId, ownerId, {
    opportunityId: opportunity.id,
    capabilityKey: "delivery.project_activate",
    artifactId: handoff.data.id,
    channel: "system",
    projectName: `${business} — ${String(proposal.data.title).trim()}`.slice(0, 180),
    projectSummary: `Founder-approved Stage 4 activation from the verified paid opportunity for ${business}.`,
    agreedValue: priceMin,
    currency: proposal.data.currency,
    idempotencyKey: `stage4:${opportunity.id}:project-activate:${handoff.data.id}`,
  });
  return { planned: true, request };
}

export async function runStageFourCompletionPlanner(
  providedAdmin?: SupabaseClient,
): Promise<PlannerResult> {
  const admin = providedAdmin ?? createAdminClient();
  if (!admin) return { configured: false, planned: 0, skipped: 0, errors: 0, results: [] };

  const result: PlannerResult = { configured: true, planned: 0, skipped: 0, errors: 0, results: [] };
  const configs = await admin
    .from("orbit_autopilot_configs")
    .select("workspace_id")
    .in("state", ["running", "degraded"]);
  if (configs.error) throw new Error(`Load Stage 4 completion planner workspaces: ${configs.error.message}`);

  for (const config of configs.data ?? []) {
    const workspace = await admin
      .from("workspaces")
      .select("owner_id")
      .eq("id", config.workspace_id)
      .single();
    if (workspace.error || !workspace.data?.owner_id) {
      result.errors += 1;
      result.results.push({ workspaceId: config.workspace_id, status: "owner_missing" });
      continue;
    }

    const opportunities = await admin
      .from("orbit_sales_opportunities")
      .select("id,lead_id,current_state")
      .eq("workspace_id", config.workspace_id)
      .in("current_state", ["payment_pending", "handoff_ready"])
      .order("updated_at", { ascending: true })
      .limit(50);
    if (opportunities.error) {
      result.errors += 1;
      result.results.push({ workspaceId: config.workspace_id, status: "opportunity_load_failed" });
      continue;
    }

    for (const opportunity of (opportunities.data ?? []) as Opportunity[]) {
      try {
        const plannedResult = opportunity.current_state === "payment_pending"
          ? await planPaymentRequest(admin, config.workspace_id, workspace.data.owner_id, opportunity)
          : await planProjectActivation(admin, config.workspace_id, workspace.data.owner_id, opportunity);
        if (plannedResult.planned) result.planned += 1;
        else result.skipped += 1;
        result.results.push({
          workspaceId: config.workspace_id,
          opportunityId: opportunity.id,
          state: opportunity.current_state,
          ...plannedResult,
        });
      } catch (error) {
        result.errors += 1;
        result.results.push({
          workspaceId: config.workspace_id,
          opportunityId: opportunity.id,
          state: opportunity.current_state,
          status: "planning_error",
          error: error instanceof Error ? error.message : "Unknown completion-planner error",
        });
      }
    }
  }

  return result;
}
