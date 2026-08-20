import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { stageFourAgentCatalog } from "@/lib/agents/stage4-catalog";
import {
  createAgentRun,
  enqueueAgentTask,
  registerAgentDefinition,
  writeAgentEvent,
} from "@/lib/agents/store";
import {
  stageFourActionRequestSchema,
  stageFourApprovalDecisionSchema,
  stageFourCapabilityOwner,
  stageFourConfigureSchema,
  stageFourControlSchema,
  stageFourExecuteSchema,
  stageFourGatewayCapabilities,
  stageFourPolicyEligibleCapabilities,
  stageFourPolicyGrantSchema,
  type StageFourActionRequestInput,
  type StageFourExternalCapability,
} from "@/lib/agents/stage4-contracts";
import {
  dispatchStageFourGateway,
  isStageFourGatewayConfigured,
} from "@/lib/agents/stage4-gateway";

type ConfigRow = {
  id: string;
  state: "off" | "checking" | "running" | "pausing" | "degraded" | "blocked";
  mode: "simulation" | "approval" | "policy";
  external_actions_enabled: boolean;
  kill_switch_engaged: boolean;
  timezone: string;
  working_hours_start: string;
  working_hours_end: string;
  working_days: number[];
  max_daily_outbound: number;
  min_seconds_between_outbound: number;
  max_open_opportunities: number;
  max_active_projects: number;
  max_consecutive_failures: number;
  consecutive_failures: number;
  last_external_action_at: string | null;
  blocked_reason: string | null;
};

type PolicyRow = {
  id: string;
  capability_key: StageFourExternalCapability;
  enabled: boolean;
  approval_mode: "manual" | "policy";
  constraints: {
    allowedChannels?: string[];
    maxMessageChars?: number;
    maxPriceAmount?: number;
    allowedCurrencies?: string[];
    maxDailyActions?: number;
    requireVerifiedContact?: boolean;
  };
  valid_from: string;
  valid_until: string | null;
};

type OpportunityRow = {
  id: string;
  lead_id: string;
  current_state: string;
  status: string;
  context: Record<string, unknown>;
};

type LeadRow = {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  stage: string;
  estimated_value: number | string | null;
  currency: string;
};

type ActionRequestRow = {
  id: string;
  request_id: string;
  opportunity_id: string;
  run_id: string;
  task_id: string;
  agent_id: string;
  capability_key: StageFourExternalCapability;
  channel: string;
  destination: string | null;
  artifact_refs: Record<string, unknown>;
  payload: Record<string, unknown>;
  payload_hash: string;
  status: string;
  approval_source: "none" | "manual" | "policy";
  approval_id: string | null;
  policy_grant_id: string | null;
  idempotency_key: string;
  attempts: number;
  max_attempts: number;
  scheduled_at: string;
};

type BuildActionResult = {
  opportunity: OpportunityRow;
  lead: LeadRow;
  destination: string | null;
  artifactRefs: Record<string, unknown>;
  payload: Record<string, unknown>;
  messageChars: number;
  priceAmount: number | null;
  currency: string | null;
};

type PreflightCheck = {
  key: string;
  status: "pass" | "degraded" | "blocked";
  detail: string;
};

const externalCapabilities: StageFourExternalCapability[] = [
  "growth.outreach_send",
  "growth.followup_send",
  "growth.proposal_send",
  "cash.payment_request",
  "cash.payment_collect",
  "delivery.project_activate",
  "proof.publish",
  "growth.referral_send",
];

const outboundCapabilities = new Set<StageFourExternalCapability>([
  "growth.outreach_send",
  "growth.followup_send",
  "growth.proposal_send",
  "cash.payment_request",
  "growth.referral_send",
]);

function throwDatabaseError(operation: string, error: { message: string } | null) {
  if (error) throw new Error(`${operation}: ${error.message}`);
}

async function assertFounderAuthority(
  client: SupabaseClient,
  workspaceId: string,
  actorId: string,
) {
  const { data, error } = await client
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", actorId)
    .single();
  throwDatabaseError("Resolve Stage 4 founder authority", error);
  if (!data || !["owner", "admin", "founder"].includes(data.role)) {
    throw new Error("Founder or workspace-admin authority is required for Stage 4.");
  }
}

async function bootstrapStageFourAgents(
  client: SupabaseClient,
  workspaceId: string,
  actorId: string,
) {
  for (const definition of stageFourAgentCatalog) {
    await registerAgentDefinition(client, workspaceId, actorId, definition);
  }
}

async function ensureConfig(
  client: SupabaseClient,
  workspaceId: string,
  actorId: string,
): Promise<ConfigRow> {
  const existing = await client
    .from("orbit_autopilot_configs")
    .select("id,state,mode,external_actions_enabled,kill_switch_engaged,timezone,working_hours_start,working_hours_end,working_days,max_daily_outbound,min_seconds_between_outbound,max_open_opportunities,max_active_projects,max_consecutive_failures,consecutive_failures,last_external_action_at,blocked_reason")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  throwDatabaseError("Load Stage 4 Autopilot config", existing.error);
  if (existing.data) return existing.data as ConfigRow;

  const created = await client
    .from("orbit_autopilot_configs")
    .insert({
      workspace_id: workspaceId,
      state: "off",
      mode: "approval",
      external_actions_enabled: false,
      kill_switch_engaged: true,
      timezone: "Asia/Karachi",
      working_hours_start: "09:00",
      working_hours_end: "20:00",
      working_days: [1, 2, 3, 4, 5, 6],
      max_daily_outbound: 20,
      min_seconds_between_outbound: 120,
      max_open_opportunities: 100,
      max_active_projects: 10,
      max_consecutive_failures: 3,
      consecutive_failures: 0,
      created_by: actorId,
      updated_by: actorId,
    })
    .select("id,state,mode,external_actions_enabled,kill_switch_engaged,timezone,working_hours_start,working_hours_end,working_days,max_daily_outbound,min_seconds_between_outbound,max_open_opportunities,max_active_projects,max_consecutive_failures,consecutive_failures,last_external_action_at,blocked_reason")
    .single();
  throwDatabaseError("Create Stage 4 Autopilot config", created.error);
  if (!created.data) throw new Error("Stage 4 Autopilot config was not returned.");
  return created.data as ConfigRow;
}

async function bootstrapManualPolicies(
  client: SupabaseClient,
  workspaceId: string,
  actorId: string,
) {
  for (const capabilityKey of externalCapabilities) {
    const existing = await client
      .from("orbit_autopilot_policy_grants")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("capability_key", capabilityKey)
      .maybeSingle();
    throwDatabaseError(`Load Stage 4 policy ${capabilityKey}`, existing.error);
    if (existing.data) continue;

    const inserted = await client.from("orbit_autopilot_policy_grants").insert({
      workspace_id: workspaceId,
      capability_key: capabilityKey,
      enabled: true,
      approval_mode: "manual",
      constraints: {},
      approved_by: actorId,
      created_by: actorId,
    });
    throwDatabaseError(`Create Stage 4 manual policy ${capabilityKey}`, inserted.error);
  }
}

export async function configureStageFourAutopilot(
  client: SupabaseClient,
  workspaceId: string,
  actorId: string,
  rawInput: unknown,
) {
  const input = stageFourConfigureSchema.parse(rawInput);
  await assertFounderAuthority(client, workspaceId, actorId);
  await bootstrapStageFourAgents(client, workspaceId, actorId);
  const current = await ensureConfig(client, workspaceId, actorId);
  await bootstrapManualPolicies(client, workspaceId, actorId);

  const updated = await client
    .from("orbit_autopilot_configs")
    .update({
      mode: input.mode,
      external_actions_enabled: input.externalActionsEnabled,
      kill_switch_engaged: input.killSwitchEngaged,
      timezone: input.timezone,
      working_hours_start: input.workingHoursStart,
      working_hours_end: input.workingHoursEnd,
      working_days: input.workingDays,
      max_daily_outbound: input.maxDailyOutbound,
      min_seconds_between_outbound: input.minSecondsBetweenOutbound,
      max_open_opportunities: input.maxOpenOpportunities,
      max_active_projects: input.maxActiveProjects,
      max_consecutive_failures: input.maxConsecutiveFailures,
      updated_by: actorId,
      state: current.state === "running" || current.state === "degraded" ? "off" : current.state,
      blocked_reason: null,
    })
    .eq("workspace_id", workspaceId)
    .eq("id", current.id)
    .select("id,state,mode,external_actions_enabled,kill_switch_engaged,timezone,working_hours_start,working_hours_end,working_days,max_daily_outbound,min_seconds_between_outbound,max_open_opportunities,max_active_projects,max_consecutive_failures,consecutive_failures,last_external_action_at,blocked_reason")
    .single();
  throwDatabaseError("Configure Stage 4 Autopilot", updated.error);
  if (!updated.data) throw new Error("Stage 4 configuration was not returned.");

  return { config: updated.data as ConfigRow, externalActionExecuted: false };
}

export async function setStageFourPolicyGrant(
  client: SupabaseClient,
  workspaceId: string,
  actorId: string,
  rawInput: unknown,
) {
  const input = stageFourPolicyGrantSchema.parse(rawInput);
  await assertFounderAuthority(client, workspaceId, actorId);
  await ensureConfig(client, workspaceId, actorId);
  await bootstrapManualPolicies(client, workspaceId, actorId);

  if (input.approvalMode === "policy" && !stageFourPolicyEligibleCapabilities.has(input.capabilityKey)) {
    throw new Error(`${input.capabilityKey} is founder-only and cannot receive a persistent Stage 4 policy grant.`);
  }

  const { data, error } = await client
    .from("orbit_autopilot_policy_grants")
    .upsert(
      {
        workspace_id: workspaceId,
        capability_key: input.capabilityKey,
        enabled: input.enabled,
        approval_mode: input.approvalMode,
        constraints: input.constraints,
        approved_by: actorId,
        approved_at: new Date().toISOString(),
        valid_from: new Date().toISOString(),
        valid_until: input.validUntil ?? null,
        created_by: actorId,
      },
      { onConflict: "workspace_id,capability_key" },
    )
    .select("id,capability_key,enabled,approval_mode,constraints,valid_from,valid_until")
    .single();
  throwDatabaseError("Save Stage 4 policy grant", error);
  if (!data) throw new Error("Stage 4 policy grant was not returned.");
  return { policy: data as PolicyRow, externalActionExecuted: false };
}

async function countRows(
  query: PromiseLike<{ count: number | null; error: { message: string } | null }>,
  operation: string,
) {
  const result = await query;
  throwDatabaseError(operation, result.error);
  return result.count ?? 0;
}

async function runPreflightInternal(
  client: SupabaseClient,
  workspaceId: string,
  actorId: string,
  config: ConfigRow,
) {
  const activeAgentCount = await countRows(
    client
      .from("orbit_agents")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("status", "active")
      .in("agent_key", stageFourAgentCatalog.map((agent) => agent.key)),
    "Count Stage 4 active agents",
  );

  const openOpportunityCount = await countRows(
    client
      .from("orbit_sales_opportunities")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("status", "active"),
    "Count Stage 4 open opportunities",
  );

  const activeProjectCount = await countRows(
    client
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .in("status", ["planned", "in_progress", "review", "blocked"]),
    "Count Stage 4 active projects",
  );

  const pendingActionCount = await countRows(
    client
      .from("orbit_external_action_requests")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .in("status", ["waiting_approval", "approved", "queued", "executing", "failed"]),
    "Count Stage 4 pending actions",
  );

  const criticalIncidentCount = await countRows(
    client
      .from("orbit_autopilot_incidents")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("status", "open")
      .eq("severity", "critical"),
    "Count Stage 4 critical incidents",
  );

  const gatewayConfigured = isStageFourGatewayConfigured();
  const checks: PreflightCheck[] = [];
  checks.push({
    key: "agents",
    status: activeAgentCount === 11 ? "pass" : "blocked",
    detail: `${activeAgentCount}/11 Stage 4 sales agents are active.`,
  });
  checks.push({
    key: "open_opportunities",
    status: openOpportunityCount <= config.max_open_opportunities ? "pass" : "degraded",
    detail: `${openOpportunityCount}/${config.max_open_opportunities} open opportunities.`,
  });
  checks.push({
    key: "delivery_capacity",
    status: activeProjectCount < config.max_active_projects ? "pass" : "degraded",
    detail: `${activeProjectCount}/${config.max_active_projects} delivery slots are occupied.`,
  });
  checks.push({
    key: "critical_incidents",
    status: criticalIncidentCount === 0 ? "pass" : "blocked",
    detail: `${criticalIncidentCount} unresolved critical Autopilot incidents.`,
  });
  checks.push({
    key: "failure_circuit_breaker",
    status: config.consecutive_failures < config.max_consecutive_failures ? "pass" : "blocked",
    detail: `${config.consecutive_failures}/${config.max_consecutive_failures} consecutive external failures.`,
  });

  if (config.mode === "simulation") {
    checks.push({
      key: "simulation",
      status: "pass",
      detail: "Simulation mode never dispatches an external action.",
    });
  } else {
    checks.push({
      key: "kill_switch",
      status: config.kill_switch_engaged ? "blocked" : "pass",
      detail: config.kill_switch_engaged ? "Kill switch is engaged." : "Kill switch is disengaged.",
    });
    checks.push({
      key: "external_actions",
      status: config.external_actions_enabled ? "pass" : "blocked",
      detail: config.external_actions_enabled ? "External actions are enabled." : "External actions are disabled.",
    });
    checks.push({
      key: "gateway",
      status: gatewayConfigured ? "pass" : "blocked",
      detail: gatewayConfigured ? "Signed external action gateway is configured." : "Signed external action gateway is not configured.",
    });
  }

  const result = checks.some((check) => check.status === "blocked")
    ? "blocked"
    : checks.some((check) => check.status === "degraded")
      ? "degraded"
      : "pass";

  const inserted = await client
    .from("orbit_autopilot_preflight_runs")
    .insert({
      workspace_id: workspaceId,
      config_id: config.id,
      result,
      checks,
      active_agent_count: activeAgentCount,
      open_opportunity_count: openOpportunityCount,
      active_project_count: activeProjectCount,
      pending_action_count: pendingActionCount,
      critical_incident_count: criticalIncidentCount,
      gateway_configured: gatewayConfigured,
      created_by: actorId,
    })
    .select("id")
    .single();
  throwDatabaseError("Persist Stage 4 preflight", inserted.error);

  const configUpdate = await client
    .from("orbit_autopilot_configs")
    .update({
      last_preflight_at: new Date().toISOString(),
      last_preflight_result: result,
      updated_by: actorId,
    })
    .eq("workspace_id", workspaceId)
    .eq("id", config.id);
  throwDatabaseError("Record Stage 4 preflight result", configUpdate.error);

  return {
    preflightId: inserted.data?.id as string,
    result,
    checks,
    counts: {
      activeAgentCount,
      openOpportunityCount,
      activeProjectCount,
      pendingActionCount,
      criticalIncidentCount,
    },
    gatewayConfigured,
  };
}

export async function runStageFourPreflight(
  client: SupabaseClient,
  workspaceId: string,
  actorId: string,
) {
  await assertFounderAuthority(client, workspaceId, actorId);
  await bootstrapStageFourAgents(client, workspaceId, actorId);
  const config = await ensureConfig(client, workspaceId, actorId);
  await bootstrapManualPolicies(client, workspaceId, actorId);
  return runPreflightInternal(client, workspaceId, actorId, config);
}

export async function controlStageFourAutopilot(
  client: SupabaseClient,
  workspaceId: string,
  actorId: string,
  rawInput: unknown,
) {
  const input = stageFourControlSchema.parse(rawInput);
  await assertFounderAuthority(client, workspaceId, actorId);
  await bootstrapStageFourAgents(client, workspaceId, actorId);
  let config = await ensureConfig(client, workspaceId, actorId);
  await bootstrapManualPolicies(client, workspaceId, actorId);

  if (input.action === "engage_kill_switch") {
    const update = await client
      .from("orbit_autopilot_configs")
      .update({
        kill_switch_engaged: true,
        state: "blocked",
        blocked_reason: input.reason || "Founder engaged the Stage 4 kill switch.",
        updated_by: actorId,
      })
      .eq("workspace_id", workspaceId)
      .eq("id", config.id);
    throwDatabaseError("Engage Stage 4 kill switch", update.error);
    return { state: "blocked" as const, killSwitchEngaged: true, externalActionExecuted: false };
  }

  if (input.action === "disengage_kill_switch") {
    const update = await client
      .from("orbit_autopilot_configs")
      .update({
        kill_switch_engaged: false,
        state: "off",
        blocked_reason: null,
        consecutive_failures: 0,
        updated_by: actorId,
      })
      .eq("workspace_id", workspaceId)
      .eq("id", config.id);
    throwDatabaseError("Disengage Stage 4 kill switch", update.error);
    return { state: "off" as const, killSwitchEngaged: false, externalActionExecuted: false };
  }

  if (input.action === "pause" || input.action === "stop") {
    const pausing = await client
      .from("orbit_autopilot_configs")
      .update({ state: "pausing", updated_by: actorId })
      .eq("workspace_id", workspaceId)
      .eq("id", config.id);
    throwDatabaseError("Pause Stage 4 Autopilot", pausing.error);
    const stopped = await client
      .from("orbit_autopilot_configs")
      .update({ state: "off", blocked_reason: null, updated_by: actorId })
      .eq("workspace_id", workspaceId)
      .eq("id", config.id);
    throwDatabaseError("Stop Stage 4 Autopilot", stopped.error);
    return { state: "off" as const, externalActionExecuted: false };
  }

  const checking = await client
    .from("orbit_autopilot_configs")
    .update({ state: "checking", blocked_reason: null, updated_by: actorId })
    .eq("workspace_id", workspaceId)
    .eq("id", config.id);
  throwDatabaseError("Start Stage 4 preflight", checking.error);
  config = { ...config, state: "checking" };
  const preflight = await runPreflightInternal(client, workspaceId, actorId, config);
  const nextState = preflight.result === "pass" ? "running" : preflight.result;
  const update = await client
    .from("orbit_autopilot_configs")
    .update({
      state: nextState,
      blocked_reason: preflight.result === "blocked" ? "Stage 4 preflight blocked Autopilot." : null,
      updated_by: actorId,
    })
    .eq("workspace_id", workspaceId)
    .eq("id", config.id);
  throwDatabaseError("Apply Stage 4 preflight state", update.error);
  return { state: nextState, preflight, externalActionExecuted: false };
}

async function loadOpportunityAndLead(
  client: SupabaseClient,
  workspaceId: string,
  opportunityId: string,
): Promise<{ opportunity: OpportunityRow; lead: LeadRow }> {
  const opportunityResult = await client
    .from("orbit_sales_opportunities")
    .select("id,lead_id,current_state,status,context")
    .eq("workspace_id", workspaceId)
    .eq("id", opportunityId)
    .single();
  throwDatabaseError("Load Stage 4 opportunity", opportunityResult.error);
  if (!opportunityResult.data) throw new Error("Stage 4 opportunity was not found.");
  const opportunity = opportunityResult.data as OpportunityRow;

  const leadResult = await client
    .from("leads")
    .select("id,name,company,email,phone,whatsapp,stage,estimated_value,currency")
    .eq("workspace_id", workspaceId)
    .eq("id", opportunity.lead_id)
    .single();
  throwDatabaseError("Load Stage 4 lead", leadResult.error);
  if (!leadResult.data) throw new Error("Stage 4 lead was not found.");
  return { opportunity, lead: leadResult.data as LeadRow };
}

function resolveDestination(lead: LeadRow, channel: string) {
  if (channel === "email") return lead.email?.trim() || null;
  if (channel === "whatsapp") return lead.whatsapp?.trim() || lead.phone?.trim() || null;
  if (channel === "phone") return lead.phone?.trim() || null;
  return null;
}

function safeFollowupMessage(lead: LeadRow, touchIndex: number) {
  const name = lead.name?.trim() || "there";
  const messages = [
    `Hi ${name}, just following up on my earlier message. If the short breakdown would be useful, I’m happy to send it over.`,
    `Hi ${name}, one more follow-up in case my earlier note got buried. If improving how prospects understand and act on the offer is relevant, I can share a concise breakdown.`,
    `Hi ${name}, I’ll close the loop here so I don’t keep nudging you. If this becomes useful later, reply anytime and I’ll pick it up from there.`,
  ];
  return messages[Math.min(touchIndex, messages.length - 1)];
}

function proposalMessage(
  lead: LeadRow,
  proposal: {
    title: string;
    scope: unknown;
    price_min: number | string;
    price_max: number | string;
    currency: string;
  },
) {
  const business = lead.company?.trim() || lead.name;
  const scopeText = JSON.stringify(proposal.scope);
  return [
    `Hi ${lead.name},`,
    `Here is the scoped proposal for ${business}: ${proposal.title}.`,
    `Scope: ${scopeText}`,
    `Approved price range: ${proposal.currency} ${proposal.price_min}–${proposal.price_max}.`,
    "If this direction works for you, reply and we can confirm the exact scope and next step before any delivery commitment is created.",
  ].join("\n\n");
}

async function buildAction(
  client: SupabaseClient,
  workspaceId: string,
  input: StageFourActionRequestInput,
): Promise<BuildActionResult> {
  const { opportunity, lead } = await loadOpportunityAndLead(client, workspaceId, input.opportunityId);
  const destination = resolveDestination(lead, input.channel);
  if (["email", "whatsapp", "phone"].includes(input.channel) && !destination) {
    throw new Error(`Stage 4 cannot use ${input.channel}; the lead has no verified destination for that channel.`);
  }

  if (input.capabilityKey === "growth.outreach_send") {
    if (!["outreach_drafted", "waiting_reply"].includes(opportunity.current_state)) {
      throw new Error(`Initial outreach is not allowed from state ${opportunity.current_state}.`);
    }
    const draft = await client
      .from("orbit_outreach_drafts")
      .select("id,lead_id,channel,subject,body,status")
      .eq("workspace_id", workspaceId)
      .eq("id", input.artifactId)
      .eq("lead_id", lead.id)
      .single();
    throwDatabaseError("Load Stage 4 outreach draft", draft.error);
    if (!draft.data) throw new Error("Outreach draft was not found for this lead.");
    if (draft.data.channel !== input.channel) {
      throw new Error(`Outreach channel ${input.channel} does not match the approved draft channel ${draft.data.channel}.`);
    }
    return {
      opportunity,
      lead,
      destination,
      artifactRefs: { outreachDraftId: draft.data.id },
      payload: {
        type: "message",
        subject: draft.data.subject,
        body: draft.data.body,
        leadId: lead.id,
      },
      messageChars: String(draft.data.body).length,
      priceAmount: null,
      currency: null,
    };
  }

  if (input.capabilityKey === "growth.followup_send") {
    if (opportunity.current_state !== "waiting_reply") {
      throw new Error(`Follow-up is not allowed from state ${opportunity.current_state}.`);
    }
    const inbound = await client
      .from("lead_activities")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("lead_id", lead.id)
      .eq("direction", "inbound")
      .limit(1)
      .maybeSingle();
    throwDatabaseError("Check Stage 4 inbound stop condition", inbound.error);
    if (inbound.data) {
      throw new Error("Follow-up is blocked because Orbit already has an inbound activity for this lead.");
    }
    const plan = await client
      .from("orbit_followup_plans")
      .select("id,lead_id,channel,sequence,status")
      .eq("workspace_id", workspaceId)
      .eq("id", input.artifactId)
      .eq("lead_id", lead.id)
      .single();
    throwDatabaseError("Load Stage 4 follow-up plan", plan.error);
    if (!plan.data) throw new Error("Follow-up plan was not found for this lead.");
    if (plan.data.channel !== input.channel) {
      throw new Error(`Follow-up channel ${input.channel} does not match plan channel ${plan.data.channel}.`);
    }
    const sequence = Array.isArray(plan.data.sequence) ? plan.data.sequence : [];
    if (input.touchIndex >= sequence.length) {
      throw new Error("Requested follow-up touch does not exist in the approved sequence.");
    }
    const body = safeFollowupMessage(lead, input.touchIndex);
    return {
      opportunity,
      lead,
      destination,
      artifactRefs: { followupPlanId: plan.data.id, touchIndex: input.touchIndex },
      payload: { type: "message", body, leadId: lead.id, followupTouch: input.touchIndex + 1 },
      messageChars: body.length,
      priceAmount: null,
      currency: null,
    };
  }

  if (input.capabilityKey === "growth.proposal_send") {
    if (opportunity.current_state !== "proposal_drafted") {
      throw new Error(`Proposal sending is not allowed from state ${opportunity.current_state}.`);
    }
    const proposal = await client
      .from("orbit_proposal_drafts")
      .select("id,lead_id,title,scope,price_min,price_max,currency,assumptions,status")
      .eq("workspace_id", workspaceId)
      .eq("id", input.artifactId)
      .eq("lead_id", lead.id)
      .maybeSingle();
    throwDatabaseError("Load Stage 4 proposal", proposal.error);
    if (proposal.data) {
      const body = proposalMessage(lead, proposal.data);
      return {
        opportunity,
        lead,
        destination,
        artifactRefs: { proposalId: proposal.data.id },
        payload: {
          type: "proposal",
          subject: proposal.data.title,
          body,
          scope: proposal.data.scope,
          assumptions: proposal.data.assumptions,
          priceMin: Number(proposal.data.price_min),
          priceMax: Number(proposal.data.price_max),
          currency: proposal.data.currency,
        },
        messageChars: body.length,
        priceAmount: Number(proposal.data.price_max),
        currency: proposal.data.currency,
      };
    }

    const sendPack = await client
      .from("orbit_recommended_send_packs")
      .select("id,lead_id,channel,subject,message_body,proposal_title,proposal_scope,pricing_snapshot,content_snapshot,status")
      .eq("workspace_id", workspaceId)
      .eq("id", input.artifactId)
      .eq("lead_id", lead.id)
      .maybeSingle();
    throwDatabaseError("Load Phase One recommended send pack", sendPack.error);
    if (!sendPack.data) throw new Error("Proposal or recommended send pack was not found for this lead.");
    if (sendPack.data.status !== "ready") {
      throw new Error(`Recommended send pack is ${sendPack.data.status}, not ready.`);
    }
    if (sendPack.data.channel !== input.channel) {
      throw new Error(`Send-pack channel ${sendPack.data.channel} does not match requested channel ${input.channel}.`);
    }
    const pricing = sendPack.data.pricing_snapshot as Record<string, unknown>;
    const content = sendPack.data.content_snapshot as Record<string, unknown>;
    const min = Number(pricing.minPrice ?? pricing.basePrice ?? 0);
    const max = Number(pricing.maxPrice ?? pricing.basePrice ?? min);
    const currency = String(pricing.currency ?? "PKR");
    const body = String(sendPack.data.message_body);
    return {
      opportunity,
      lead,
      destination,
      artifactRefs: {
        sendPackId: sendPack.data.id,
        contentAssetId: typeof content.contentAssetId === "string" ? content.contentAssetId : null,
      },
      payload: {
        type: "recommended_send_pack",
        subject: sendPack.data.subject ?? sendPack.data.proposal_title,
        body,
        scope: sendPack.data.proposal_scope,
        pricing,
        content,
        assetUrl: typeof content.assetUrl === "string" ? content.assetUrl : null,
      },
      messageChars: body.length,
      priceAmount: max,
      currency,
    };
  }

  if (input.capabilityKey === "cash.payment_request") {
    if (opportunity.current_state !== "payment_pending") {
      throw new Error(`Payment request is not allowed from state ${opportunity.current_state}.`);
    }
    const onboarding = await client
      .from("orbit_onboarding_cases")
      .select("id,lead_id,proposal_id,payment_status,onboarding_status")
      .eq("workspace_id", workspaceId)
      .eq("id", input.artifactId)
      .eq("lead_id", lead.id)
      .single();
    throwDatabaseError("Load Stage 4 onboarding case", onboarding.error);
    if (!onboarding.data) throw new Error("Onboarding case was not found for this lead.");
    if (onboarding.data.payment_status !== "pending") {
      throw new Error(`Payment request is not needed because payment status is ${onboarding.data.payment_status}.`);
    }
    const body = `Hi ${lead.name}, here are the approved payment instructions for the agreed next step:\n\n${input.paymentInstructions}\n\nPlease reply after payment so Orbit can verify the payment reference before delivery is activated.`;
    return {
      opportunity,
      lead,
      destination,
      artifactRefs: { onboardingId: onboarding.data.id, proposalId: onboarding.data.proposal_id },
      payload: { type: "payment_request", body, paymentInstructions: input.paymentInstructions },
      messageChars: body.length,
      priceAmount: null,
      currency: null,
    };
  }

  if (input.capabilityKey === "cash.payment_collect") {
    throw new Error("Stage 4 does not implement charging or money movement. Connect a dedicated payment provider in a later payment stage.");
  }

  if (input.capabilityKey === "delivery.project_activate") {
    if (opportunity.current_state !== "handoff_ready") {
      throw new Error(`Project activation is not allowed from state ${opportunity.current_state}.`);
    }
    const handoff = await client
      .from("orbit_delivery_handoffs")
      .select("id,lead_id,onboarding_id,project_id,capacity_status,status,brief")
      .eq("workspace_id", workspaceId)
      .eq("id", input.artifactId)
      .eq("lead_id", lead.id)
      .single();
    throwDatabaseError("Load Stage 4 delivery handoff", handoff.error);
    if (!handoff.data) throw new Error("Delivery handoff was not found for this lead.");
    if (handoff.data.capacity_status === "blocked" || handoff.data.status === "rejected") {
      throw new Error("Project activation is blocked by delivery capacity.");
    }
    const onboarding = await client
      .from("orbit_onboarding_cases")
      .select("id,proposal_id,payment_status,onboarding_status,client_id")
      .eq("workspace_id", workspaceId)
      .eq("id", handoff.data.onboarding_id)
      .single();
    throwDatabaseError("Load Stage 4 paid onboarding", onboarding.error);
    if (!onboarding.data || onboarding.data.payment_status !== "confirmed_external") {
      throw new Error("Project activation requires a verified external payment confirmation.");
    }
    const proposal = await client
      .from("orbit_proposal_drafts")
      .select("id,price_min,price_max,currency")
      .eq("workspace_id", workspaceId)
      .eq("id", onboarding.data.proposal_id)
      .single();
    throwDatabaseError("Load Stage 4 accepted proposal", proposal.error);
    if (!proposal.data) throw new Error("Project activation requires the source proposal.");
    const min = Number(proposal.data.price_min);
    const max = Number(proposal.data.price_max);
    if (input.currency !== proposal.data.currency) {
      throw new Error(`Agreed currency ${input.currency} does not match proposal currency ${proposal.data.currency}.`);
    }
    if (input.agreedValue < min || input.agreedValue > max) {
      throw new Error(`Agreed value must remain inside the approved proposal range ${min}–${max} ${proposal.data.currency}.`);
    }
    return {
      opportunity,
      lead,
      destination: null,
      artifactRefs: {
        handoffId: handoff.data.id,
        onboardingId: onboarding.data.id,
        proposalId: proposal.data.id,
        existingProjectId: handoff.data.project_id,
      },
      payload: {
        type: "project_activation",
        projectName: input.projectName,
        projectSummary: input.projectSummary ?? null,
        agreedValue: input.agreedValue,
        currency: input.currency,
        dueDate: input.dueDate ?? null,
        handoffBrief: handoff.data.brief,
      },
      messageChars: 0,
      priceAmount: input.agreedValue,
      currency: input.currency,
    };
  }

  if (input.capabilityKey === "proof.publish") {
    if (!["proof_ready", "referral_ready"].includes(opportunity.current_state)) {
      throw new Error(`Proof publishing is not allowed from state ${opportunity.current_state}.`);
    }
    const plan = await client
      .from("orbit_proof_referral_plans")
      .select("id,lead_id,handoff_id,project_id,proof_id,result_summary,proof_permission_scope,status")
      .eq("workspace_id", workspaceId)
      .eq("id", input.artifactId)
      .eq("lead_id", lead.id)
      .single();
    throwDatabaseError("Load Stage 4 proof plan", plan.error);
    if (!plan.data) throw new Error("Proof/referral plan was not found for this lead.");
    if (!['anonymous', 'public'].includes(plan.data.proof_permission_scope) || plan.data.status !== "ready") {
      throw new Error("Proof publishing requires explicit anonymous or public permission and a ready proof plan.");
    }
    return {
      opportunity,
      lead,
      destination: null,
      artifactRefs: { proofReferralPlanId: plan.data.id, existingProofId: plan.data.proof_id, projectId: plan.data.project_id },
      payload: {
        type: "proof_publish",
        title: input.proofTitle,
        resultSummary: plan.data.result_summary,
        permissionScope: plan.data.proof_permission_scope,
        evidenceUrl: input.evidenceUrl ?? null,
        projectId: plan.data.project_id,
      },
      messageChars: 0,
      priceAmount: null,
      currency: null,
    };
  }

  if (!["proof_ready", "referral_ready"].includes(opportunity.current_state)) {
    throw new Error(`Referral request is not allowed from state ${opportunity.current_state}.`);
  }
  const plan = await client
    .from("orbit_proof_referral_plans")
    .select("id,lead_id,result_summary,proof_permission_scope,status")
    .eq("workspace_id", workspaceId)
    .eq("id", input.artifactId)
    .eq("lead_id", lead.id)
    .single();
  throwDatabaseError("Load Stage 4 referral plan", plan.error);
  if (!plan.data || plan.data.status !== "ready") {
    throw new Error("Referral request requires a ready proof/referral plan after delivery completion.");
  }
  const body = `Hi ${lead.name}, now that the project is complete, if someone in your network could benefit from similar work, an introduction would be appreciated. No pressure at all—only if someone relevant comes to mind.`;
  return {
    opportunity,
    lead,
    destination,
    artifactRefs: { proofReferralPlanId: plan.data.id },
    payload: { type: "referral_request", body },
    messageChars: body.length,
    priceAmount: null,
    currency: null,
  };
}

function canonicalPayloadHash(input: {
  capabilityKey: string;
  channel: string;
  destination: string | null;
  artifactRefs: Record<string, unknown>;
  payload: Record<string, unknown>;
}) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

async function loadPolicy(
  client: SupabaseClient,
  workspaceId: string,
  capabilityKey: StageFourExternalCapability,
): Promise<PolicyRow | null> {
  const result = await client
    .from("orbit_autopilot_policy_grants")
    .select("id,capability_key,enabled,approval_mode,constraints,valid_from,valid_until")
    .eq("workspace_id", workspaceId)
    .eq("capability_key", capabilityKey)
    .maybeSingle();
  throwDatabaseError("Load Stage 4 action policy", result.error);
  return (result.data as PolicyRow | null) ?? null;
}

async function countRecentActions(
  client: SupabaseClient,
  workspaceId: string,
  capabilityKey?: string,
) {
  let query = client
    .from("orbit_external_action_requests")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("status", "succeeded")
    .gte("completed_at", new Date(Date.now() - 86_400_000).toISOString());
  if (capabilityKey) query = query.eq("capability_key", capabilityKey);
  const result = await query;
  throwDatabaseError("Count recent Stage 4 actions", result.error);
  return result.count ?? 0;
}

async function policyAllows(
  client: SupabaseClient,
  workspaceId: string,
  config: ConfigRow,
  policy: PolicyRow | null,
  input: StageFourActionRequestInput,
  built: BuildActionResult,
) {
  if (config.mode !== "policy") return false;
  if (!stageFourPolicyEligibleCapabilities.has(input.capabilityKey)) return false;
  if (!policy || !policy.enabled || policy.approval_mode !== "policy") return false;
  const now = Date.now();
  if (Date.parse(policy.valid_from) > now) return false;
  if (policy.valid_until && Date.parse(policy.valid_until) <= now) return false;

  const constraints = policy.constraints ?? {};
  if (constraints.allowedChannels && !constraints.allowedChannels.includes(input.channel)) return false;
  if (constraints.maxMessageChars !== undefined && built.messageChars > constraints.maxMessageChars) return false;
  if (constraints.maxPriceAmount !== undefined && built.priceAmount !== null && built.priceAmount > constraints.maxPriceAmount) return false;
  if (constraints.allowedCurrencies && built.currency && !constraints.allowedCurrencies.includes(built.currency)) return false;
  if (constraints.requireVerifiedContact && outboundCapabilities.has(input.capabilityKey) && !built.destination) return false;
  if (constraints.maxDailyActions !== undefined) {
    const count = await countRecentActions(client, workspaceId, input.capabilityKey);
    if (count >= constraints.maxDailyActions) return false;
  }
  return true;
}

async function resolveAgentAndPermission(
  client: SupabaseClient,
  workspaceId: string,
  capabilityKey: StageFourExternalCapability,
) {
  const agentKey = stageFourCapabilityOwner[capabilityKey];
  const agentResult = await client
    .from("orbit_agents")
    .select("id,status")
    .eq("workspace_id", workspaceId)
    .eq("agent_key", agentKey)
    .single();
  throwDatabaseError(`Resolve Stage 4 ${agentKey} agent`, agentResult.error);
  if (!agentResult.data || agentResult.data.status !== "active") {
    throw new Error(`Stage 4 agent ${agentKey} is not active.`);
  }
  const permissionResult = await client
    .from("orbit_agent_permissions")
    .select("effect,authority_level,conditions")
    .eq("workspace_id", workspaceId)
    .eq("agent_id", agentResult.data.id)
    .eq("capability_key", capabilityKey)
    .single();
  throwDatabaseError(`Resolve Stage 4 permission ${capabilityKey}`, permissionResult.error);
  if (!permissionResult.data || permissionResult.data.effect !== "allow") {
    throw new Error(`Stage 4 agent ${agentKey} is not allowed capability ${capabilityKey}.`);
  }
  if (permissionResult.data.authority_level !== "red") {
    throw new Error(`Stage 4 irreversible capability ${capabilityKey} must remain Red.`);
  }
  return { agentKey, agentId: agentResult.data.id as string };
}

export async function requestStageFourAction(
  client: SupabaseClient,
  workspaceId: string,
  actorId: string,
  rawInput: unknown,
) {
  const input = stageFourActionRequestSchema.parse(rawInput);
  await assertFounderAuthority(client, workspaceId, actorId);
  await bootstrapStageFourAgents(client, workspaceId, actorId);
  const config = await ensureConfig(client, workspaceId, actorId);
  await bootstrapManualPolicies(client, workspaceId, actorId);

  const existing = await client
    .from("orbit_external_action_requests")
    .select("id,status,request_id,approval_source,approval_id,policy_grant_id")
    .eq("workspace_id", workspaceId)
    .eq("idempotency_key", input.idempotencyKey)
    .maybeSingle();
  throwDatabaseError("Resolve existing Stage 4 action request", existing.error);
  if (existing.data) return { ...existing.data, reused: true, externalActionExecuted: false };

  if (!["running", "degraded"].includes(config.state)) {
    throw new Error(`Stage 4 Autopilot must be running or degraded before an action can be requested; current state is ${config.state}.`);
  }

  const built = await buildAction(client, workspaceId, input);
  const { agentKey, agentId } = await resolveAgentAndPermission(client, workspaceId, input.capabilityKey);
  const policy = await loadPolicy(client, workspaceId, input.capabilityKey);
  const autoPolicy = await policyAllows(client, workspaceId, config, policy, input, built);
  const simulation = config.mode === "simulation";
  const status = simulation || autoPolicy ? "queued" : "waiting_approval";
  const approvalSource = simulation ? "none" : autoPolicy ? "policy" : "manual";

  const run = await createAgentRun(client, workspaceId, actorId, {
    agentKey,
    triggerType: "agent",
    input: {
      opportunityId: input.opportunityId,
      capabilityKey: input.capabilityKey,
      stage: 4,
    },
    idempotencyKey: `stage4:${input.idempotencyKey}:run`,
  });
  const task = await enqueueAgentTask(client, workspaceId, {
    runId: run.id,
    assignedAgentKey: agentKey,
    capabilityKey: input.capabilityKey,
    taskType: "stage4_external_action",
    title: `Stage 4 ${input.capabilityKey} for ${built.lead.company ?? built.lead.name}`,
    riskLevel: "red",
    priority: 95,
    input: {
      opportunityId: input.opportunityId,
      artifactId: input.artifactId,
      channel: input.channel,
    },
    idempotencyKey: `stage4:${input.idempotencyKey}:task`,
  });

  const payloadHash = canonicalPayloadHash({
    capabilityKey: input.capabilityKey,
    channel: input.channel,
    destination: built.destination,
    artifactRefs: built.artifactRefs,
    payload: built.payload,
  });

  const inserted = await client
    .from("orbit_external_action_requests")
    .insert({
      workspace_id: workspaceId,
      opportunity_id: input.opportunityId,
      run_id: run.id,
      task_id: task.id,
      agent_id: agentId,
      capability_key: input.capabilityKey,
      authority_level: "red",
      channel: input.channel,
      destination: built.destination,
      artifact_refs: built.artifactRefs,
      payload: built.payload,
      payload_hash: payloadHash,
      status,
      approval_source: approvalSource,
      policy_grant_id: autoPolicy ? policy?.id ?? null : null,
      idempotency_key: input.idempotencyKey,
      scheduled_at: input.scheduledAt ?? new Date().toISOString(),
      created_by: actorId,
    })
    .select("id,request_id,status")
    .single();
  throwDatabaseError("Create Stage 4 external action request", inserted.error);
  if (!inserted.data) throw new Error("Stage 4 action request was not returned.");

  let approvalId: string | null = null;
  if (!simulation && !autoPolicy) {
    const approval = await client
      .from("orbit_agent_approvals")
      .insert({
        workspace_id: workspaceId,
        run_id: run.id,
        task_id: task.id,
        requested_by_agent_id: agentId,
        authority_level: "red",
        proposed_action: input.capabilityKey,
        proposed_payload: {
          actionRequestId: inserted.data.id,
          opportunityId: input.opportunityId,
          channel: input.channel,
          destination: built.destination,
          artifactRefs: built.artifactRefs,
          payloadHash,
        },
        approval_route: "founder",
        status: "pending",
        expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      })
      .select("id")
      .single();
    throwDatabaseError("Create Stage 4 founder approval", approval.error);
    approvalId = approval.data?.id as string;
    const requestUpdate = await client
      .from("orbit_external_action_requests")
      .update({ approval_id: approvalId })
      .eq("workspace_id", workspaceId)
      .eq("id", inserted.data.id);
    throwDatabaseError("Link Stage 4 action approval", requestUpdate.error);
    const runUpdate = await client
      .from("orbit_agent_runs")
      .update({ status: "waiting_approval" })
      .eq("workspace_id", workspaceId)
      .eq("id", run.id);
    throwDatabaseError("Wait Stage 4 run approval", runUpdate.error);
  } else {
    const taskUpdate = await client
      .from("orbit_agent_tasks")
      .update({ status: "queued" })
      .eq("workspace_id", workspaceId)
      .eq("id", task.id);
    throwDatabaseError("Queue Stage 4 preauthorized action", taskUpdate.error);
  }

  await writeAgentEvent(client, {
    workspaceId,
    runId: run.id,
    taskId: task.id,
    agentId,
    eventType: "stage4_action_requested",
    message: simulation
      ? "Stage 4 simulation action queued without external execution."
      : autoPolicy
        ? "Stage 4 action matched an active founder policy grant and was queued."
        : "Stage 4 irreversible action is waiting for founder approval.",
    data: {
      actionRequestId: inserted.data.id,
      capabilityKey: input.capabilityKey,
      approvalSource,
      payloadHash,
    },
  });

  return {
    actionRequestId: inserted.data.id as string,
    requestId: inserted.data.request_id as string,
    status,
    approvalSource,
    approvalId,
    policyGrantId: autoPolicy ? policy?.id ?? null : null,
    externalActionExecuted: false,
  };
}

export async function decideStageFourAction(
  client: SupabaseClient,
  workspaceId: string,
  actorId: string,
  rawInput: unknown,
) {
  const input = stageFourApprovalDecisionSchema.parse(rawInput);
  await assertFounderAuthority(client, workspaceId, actorId);

  const action = await client
    .from("orbit_external_action_requests")
    .select("id,run_id,task_id,approval_id,status,approval_source")
    .eq("workspace_id", workspaceId)
    .eq("id", input.actionRequestId)
    .single();
  throwDatabaseError("Load Stage 4 approval action", action.error);
  if (!action.data) throw new Error("Stage 4 action request was not found.");
  if (action.data.approval_source !== "manual" || !action.data.approval_id) {
    throw new Error("This Stage 4 action does not have a pending manual founder approval.");
  }
  if (action.data.status !== "waiting_approval") {
    throw new Error(`Stage 4 action is ${action.data.status}, not waiting for approval.`);
  }

  const approval = await client
    .from("orbit_agent_approvals")
    .select("id,status,expires_at")
    .eq("workspace_id", workspaceId)
    .eq("id", action.data.approval_id)
    .single();
  throwDatabaseError("Load Stage 4 approval", approval.error);
  if (!approval.data || approval.data.status !== "pending") {
    throw new Error("Stage 4 founder approval is no longer pending.");
  }
  if (approval.data.expires_at && Date.parse(approval.data.expires_at) <= Date.now()) {
    await client
      .from("orbit_agent_approvals")
      .update({ status: "expired", decided_at: new Date().toISOString() })
      .eq("workspace_id", workspaceId)
      .eq("id", approval.data.id);
    throw new Error("Stage 4 founder approval has expired.");
  }

  const approved = input.decision === "approved";
  const approvalUpdate = await client
    .from("orbit_agent_approvals")
    .update({
      status: approved ? "approved" : "rejected",
      decision_reason: input.reason ?? null,
      decided_by: actorId,
      decided_at: new Date().toISOString(),
    })
    .eq("workspace_id", workspaceId)
    .eq("id", approval.data.id);
  throwDatabaseError("Decide Stage 4 founder approval", approvalUpdate.error);

  const actionUpdate = await client
    .from("orbit_external_action_requests")
    .update({ status: approved ? "queued" : "cancelled" })
    .eq("workspace_id", workspaceId)
    .eq("id", action.data.id);
  throwDatabaseError("Apply Stage 4 approval to action", actionUpdate.error);

  const taskUpdate = await client
    .from("orbit_agent_tasks")
    .update({ status: approved ? "queued" : "cancelled", completed_at: approved ? null : new Date().toISOString() })
    .eq("workspace_id", workspaceId)
    .eq("id", action.data.task_id);
  throwDatabaseError("Apply Stage 4 approval to task", taskUpdate.error);

  const runUpdate = await client
    .from("orbit_agent_runs")
    .update({ status: approved ? "queued" : "cancelled", completed_at: approved ? null : new Date().toISOString() })
    .eq("workspace_id", workspaceId)
    .eq("id", action.data.run_id);
  throwDatabaseError("Apply Stage 4 approval to run", runUpdate.error);

  return {
    actionRequestId: action.data.id as string,
    decision: input.decision,
    status: approved ? "queued" : "cancelled",
    externalActionExecuted: false,
  };
}

function parseTime(value: string) {
  const [hour, minute] = value.slice(0, 5).split(":").map(Number);
  return hour * 60 + minute;
}

function localClock(timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    weekday: weekdayMap[value.weekday] ?? -1,
    minutes: Number(value.hour) * 60 + Number(value.minute),
  };
}

function withinWorkingWindow(config: ConfigRow) {
  let clock: { weekday: number; minutes: number };
  try {
    clock = localClock(config.timezone);
  } catch {
    return false;
  }
  if (!config.working_days.includes(clock.weekday)) return false;
  const start = parseTime(config.working_hours_start);
  const end = parseTime(config.working_hours_end);
  if (start === end) return true;
  if (start < end) return clock.minutes >= start && clock.minutes < end;
  return clock.minutes >= start || clock.minutes < end;
}

async function markIncident(
  client: SupabaseClient,
  workspaceId: string,
  actorId: string,
  actionRequestId: string,
  severity: "info" | "warning" | "critical",
  code: string,
  summary: string,
  details: Record<string, unknown> = {},
) {
  const result = await client.from("orbit_autopilot_incidents").insert({
    workspace_id: workspaceId,
    action_request_id: actionRequestId,
    severity,
    incident_code: code,
    summary,
    details,
    status: "open",
    created_by: actorId,
  });
  throwDatabaseError("Create Stage 4 incident", result.error);
}

async function loadActionRequest(
  client: SupabaseClient,
  workspaceId: string,
  actionRequestId: string,
): Promise<ActionRequestRow> {
  const result = await client
    .from("orbit_external_action_requests")
    .select("id,request_id,opportunity_id,run_id,task_id,agent_id,capability_key,channel,destination,artifact_refs,payload,payload_hash,status,approval_source,approval_id,policy_grant_id,idempotency_key,attempts,max_attempts,scheduled_at")
    .eq("workspace_id", workspaceId)
    .eq("id", actionRequestId)
    .single();
  throwDatabaseError("Load Stage 4 action request", result.error);
  if (!result.data) throw new Error("Stage 4 action request was not found.");
  return result.data as ActionRequestRow;
}

async function assertExecutionApproval(
  client: SupabaseClient,
  workspaceId: string,
  action: ActionRequestRow,
) {
  if (action.approval_source === "none") return;
  if (action.approval_source === "manual") {
    if (!action.approval_id) throw new Error("Stage 4 manual action has no founder approval record.");
    const approval = await client
      .from("orbit_agent_approvals")
      .select("status,expires_at")
      .eq("workspace_id", workspaceId)
      .eq("id", action.approval_id)
      .single();
    throwDatabaseError("Revalidate Stage 4 founder approval", approval.error);
    if (!approval.data || approval.data.status !== "approved") {
      throw new Error("Stage 4 external action does not have an approved founder decision.");
    }
    if (approval.data.expires_at && Date.parse(approval.data.expires_at) <= Date.now()) {
      throw new Error("Stage 4 founder approval expired before execution.");
    }
    return;
  }
  if (!action.policy_grant_id) throw new Error("Stage 4 policy action has no policy grant reference.");
  const policy = await client
    .from("orbit_autopilot_policy_grants")
    .select("enabled,approval_mode,valid_from,valid_until")
    .eq("workspace_id", workspaceId)
    .eq("id", action.policy_grant_id)
    .single();
  throwDatabaseError("Revalidate Stage 4 policy grant", policy.error);
  if (!policy.data || !policy.data.enabled || policy.data.approval_mode !== "policy") {
    throw new Error("Stage 4 policy grant is no longer active.");
  }
  const now = Date.now();
  if (Date.parse(policy.data.valid_from) > now || (policy.data.valid_until && Date.parse(policy.data.valid_until) <= now)) {
    throw new Error("Stage 4 policy grant is outside its validity window.");
  }
}

async function beginExecution(
  client: SupabaseClient,
  workspaceId: string,
  action: ActionRequestRow,
) {
  const now = new Date().toISOString();
  const attempts = action.attempts + 1;
  const actionUpdate = await client
    .from("orbit_external_action_requests")
    .update({ status: "executing", attempts, locked_at: now, lock_expires_at: new Date(Date.now() + 60_000).toISOString() })
    .eq("workspace_id", workspaceId)
    .eq("id", action.id);
  throwDatabaseError("Start Stage 4 action execution", actionUpdate.error);
  const taskUpdate = await client
    .from("orbit_agent_tasks")
    .update({ status: "running", attempts, locked_at: now })
    .eq("workspace_id", workspaceId)
    .eq("id", action.task_id);
  throwDatabaseError("Start Stage 4 action task", taskUpdate.error);
  const runUpdate = await client
    .from("orbit_agent_runs")
    .update({ status: "running", started_at: now })
    .eq("workspace_id", workspaceId)
    .eq("id", action.run_id);
  throwDatabaseError("Start Stage 4 action run", runUpdate.error);
  return attempts;
}

async function succeedExecution(
  client: SupabaseClient,
  workspaceId: string,
  actorId: string,
  config: ConfigRow,
  action: ActionRequestRow,
  output: Record<string, unknown>,
  provider: string | null = null,
  providerRequestId: string | null = null,
) {
  const now = new Date().toISOString();
  const actionUpdate = await client
    .from("orbit_external_action_requests")
    .update({
      status: "succeeded",
      provider,
      provider_request_id: providerRequestId,
      response_summary: output,
      error: null,
      completed_at: now,
      locked_at: null,
      lock_expires_at: null,
    })
    .eq("workspace_id", workspaceId)
    .eq("id", action.id);
  throwDatabaseError("Complete Stage 4 action", actionUpdate.error);
  const taskUpdate = await client
    .from("orbit_agent_tasks")
    .update({ status: "succeeded", output, completed_at: now })
    .eq("workspace_id", workspaceId)
    .eq("id", action.task_id);
  throwDatabaseError("Complete Stage 4 action task", taskUpdate.error);
  const runUpdate = await client
    .from("orbit_agent_runs")
    .update({ status: "succeeded", output, completed_at: now })
    .eq("workspace_id", workspaceId)
    .eq("id", action.run_id);
  throwDatabaseError("Complete Stage 4 action run", runUpdate.error);
  const configUpdate = await client
    .from("orbit_autopilot_configs")
    .update({
      consecutive_failures: 0,
      last_external_action_at: stageFourGatewayCapabilities.has(action.capability_key) ? now : config.last_external_action_at,
      updated_by: actorId,
    })
    .eq("workspace_id", workspaceId)
    .eq("id", config.id);
  throwDatabaseError("Reset Stage 4 failure circuit", configUpdate.error);
}

async function failExecution(
  client: SupabaseClient,
  workspaceId: string,
  actorId: string,
  config: ConfigRow,
  action: ActionRequestRow,
  attempts: number,
  code: string,
  message: string,
  details: Record<string, unknown> = {},
) {
  const now = new Date().toISOString();
  const nextFailureCount = config.consecutive_failures + 1;
  const quarantine = attempts >= action.max_attempts;
  const tripCircuit = nextFailureCount >= config.max_consecutive_failures;
  const status = quarantine ? "quarantined" : "failed";
  const actionUpdate = await client
    .from("orbit_external_action_requests")
    .update({
      status,
      error: { code, message, ...details },
      completed_at: quarantine ? now : null,
      quarantined_at: quarantine ? now : null,
      locked_at: null,
      lock_expires_at: null,
    })
    .eq("workspace_id", workspaceId)
    .eq("id", action.id);
  throwDatabaseError("Fail Stage 4 action", actionUpdate.error);
  const taskUpdate = await client
    .from("orbit_agent_tasks")
    .update({
      status: quarantine ? "failed" : "queued",
      error: { code, message },
      completed_at: quarantine ? now : null,
      scheduled_at: quarantine ? now : new Date(Date.now() + 60_000 * attempts).toISOString(),
    })
    .eq("workspace_id", workspaceId)
    .eq("id", action.task_id);
  throwDatabaseError("Fail Stage 4 task", taskUpdate.error);
  const runUpdate = await client
    .from("orbit_agent_runs")
    .update({
      status: quarantine ? "failed" : "queued",
      error: { code, message },
      completed_at: quarantine ? now : null,
    })
    .eq("workspace_id", workspaceId)
    .eq("id", action.run_id);
  throwDatabaseError("Fail Stage 4 run", runUpdate.error);
  const configUpdate = await client
    .from("orbit_autopilot_configs")
    .update({
      consecutive_failures: nextFailureCount,
      state: tripCircuit ? "blocked" : config.state,
      kill_switch_engaged: tripCircuit ? true : config.kill_switch_engaged,
      blocked_reason: tripCircuit ? `Stage 4 circuit breaker tripped after ${nextFailureCount} consecutive failures.` : config.blocked_reason,
      updated_by: actorId,
    })
    .eq("workspace_id", workspaceId)
    .eq("id", config.id);
  throwDatabaseError("Update Stage 4 failure circuit", configUpdate.error);
  await markIncident(
    client,
    workspaceId,
    actorId,
    action.id,
    tripCircuit || quarantine ? "critical" : "warning",
    code,
    message,
    { attempts, maxAttempts: action.max_attempts, nextFailureCount, ...details },
  );
}

async function blockAction(
  client: SupabaseClient,
  workspaceId: string,
  actorId: string,
  action: ActionRequestRow,
  code: string,
  message: string,
) {
  const actionUpdate = await client
    .from("orbit_external_action_requests")
    .update({ status: "blocked", error: { code, message } })
    .eq("workspace_id", workspaceId)
    .eq("id", action.id);
  throwDatabaseError("Block Stage 4 action", actionUpdate.error);
  await markIncident(client, workspaceId, actorId, action.id, "warning", code, message);
  return { actionRequestId: action.id, status: "blocked" as const, errorCode: code, externalActionExecuted: false };
}

async function executeProjectActivation(
  client: SupabaseClient,
  workspaceId: string,
  actorId: string,
  action: ActionRequestRow,
) {
  const { opportunity, lead } = await loadOpportunityAndLead(client, workspaceId, action.opportunity_id);
  if (opportunity.current_state !== "handoff_ready") {
    throw new Error(`Project activation state changed to ${opportunity.current_state}; approval must be re-requested.`);
  }
  const handoffId = String(action.artifact_refs.handoffId || "");
  const handoff = await client
    .from("orbit_delivery_handoffs")
    .select("id,onboarding_id,project_id,capacity_status,status")
    .eq("workspace_id", workspaceId)
    .eq("id", handoffId)
    .single();
  throwDatabaseError("Revalidate Stage 4 delivery handoff", handoff.error);
  if (!handoff.data || handoff.data.capacity_status === "blocked") {
    throw new Error("Project activation is no longer safe because delivery capacity is blocked.");
  }
  const onboarding = await client
    .from("orbit_onboarding_cases")
    .select("id,payment_status,client_id")
    .eq("workspace_id", workspaceId)
    .eq("id", handoff.data.onboarding_id)
    .single();
  throwDatabaseError("Revalidate Stage 4 payment", onboarding.error);
  if (!onboarding.data || onboarding.data.payment_status !== "confirmed_external") {
    throw new Error("Project activation lost its verified payment prerequisite.");
  }

  let clientId = onboarding.data.client_id as string | null;
  if (!clientId) {
    const clientName = (lead.company ?? lead.name).slice(0, 160);
    const existingClient = await client
      .from("clients")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("name", clientName)
      .maybeSingle();
    throwDatabaseError("Resolve Stage 4 delivery client", existingClient.error);
    if (existingClient.data) {
      clientId = existingClient.data.id as string;
    } else {
      const createdClient = await client
        .from("clients")
        .insert({
          workspace_id: workspaceId,
          name: clientName,
          contact_name: lead.name,
          email: lead.email,
          phone: lead.whatsapp ?? lead.phone,
          notes: `Created by Stage 4 from won lead ${lead.id}.`,
          created_by: actorId,
        })
        .select("id")
        .single();
      throwDatabaseError("Create Stage 4 delivery client", createdClient.error);
      if (!createdClient.data) throw new Error("Stage 4 client was not returned after creation.");
      clientId = createdClient.data.id as string;
    }
  }

  let projectId = handoff.data.project_id as string | null;
  if (!projectId) {
    const createdProject = await client
      .from("projects")
      .insert({
        workspace_id: workspaceId,
        client_id: clientId,
        lead_id: lead.id,
        name: String(action.payload.projectName),
        summary: (action.payload.projectSummary as string | null) ?? null,
        status: "planned",
        value: Number(action.payload.agreedValue),
        currency: String(action.payload.currency),
        start_date: new Date().toISOString().slice(0, 10),
        due_date: (action.payload.dueDate as string | null) ?? null,
        owner_id: actorId,
        created_by: actorId,
      })
      .select("id")
      .single();
    throwDatabaseError("Create Stage 4 project", createdProject.error);
    if (!createdProject.data) throw new Error("Stage 4 project was not returned after creation.");
    projectId = createdProject.data.id as string;
  }

  const onboardingUpdate = await client
    .from("orbit_onboarding_cases")
    .update({ client_id: clientId, onboarding_status: "complete" })
    .eq("workspace_id", workspaceId)
    .eq("id", onboarding.data.id);
  throwDatabaseError("Complete Stage 4 onboarding", onboardingUpdate.error);
  const handoffUpdate = await client
    .from("orbit_delivery_handoffs")
    .update({ project_id: projectId, status: "accepted" })
    .eq("workspace_id", workspaceId)
    .eq("id", handoff.data.id);
  throwDatabaseError("Activate Stage 4 handoff", handoffUpdate.error);
  const opportunityUpdate = await client
    .from("orbit_sales_opportunities")
    .update({ current_state: "delivery_active", status: "won", next_agent_key: "proof_referral" })
    .eq("workspace_id", workspaceId)
    .eq("id", opportunity.id);
  throwDatabaseError("Advance Stage 4 opportunity to delivery", opportunityUpdate.error);

  return { projectId, clientId, deliveryActivated: true };
}

async function executeProofPublish(
  client: SupabaseClient,
  workspaceId: string,
  actorId: string,
  action: ActionRequestRow,
) {
  const planId = String(action.artifact_refs.proofReferralPlanId || "");
  const plan = await client
    .from("orbit_proof_referral_plans")
    .select("id,project_id,proof_id,result_summary,proof_permission_scope,status")
    .eq("workspace_id", workspaceId)
    .eq("id", planId)
    .single();
  throwDatabaseError("Revalidate Stage 4 proof permission", plan.error);
  if (!plan.data || !["anonymous", "public"].includes(plan.data.proof_permission_scope) || plan.data.status !== "ready") {
    throw new Error("Proof permission changed; publication requires a new founder approval.");
  }
  if (!plan.data.project_id) throw new Error("Proof publication requires a real project reference.");

  let proofId = plan.data.proof_id as string | null;
  if (!proofId) {
    const proof = await client
      .from("proofs")
      .insert({
        workspace_id: workspaceId,
        project_id: plan.data.project_id,
        title: String(action.payload.title),
        result: plan.data.result_summary,
        evidence_url: (action.payload.evidenceUrl as string | null) ?? null,
        permission_scope: plan.data.proof_permission_scope,
        status: "published",
        created_by: actorId,
      })
      .select("id")
      .single();
    throwDatabaseError("Publish Stage 4 proof", proof.error);
    if (!proof.data) throw new Error("Stage 4 proof was not returned after publication.");
    proofId = proof.data.id as string;
  } else {
    const proofUpdate = await client
      .from("proofs")
      .update({
        title: String(action.payload.title),
        result: plan.data.result_summary,
        evidence_url: (action.payload.evidenceUrl as string | null) ?? null,
        permission_scope: plan.data.proof_permission_scope,
        status: "published",
      })
      .eq("workspace_id", workspaceId)
      .eq("id", proofId);
    throwDatabaseError("Update Stage 4 published proof", proofUpdate.error);
  }

  const planUpdate = await client
    .from("orbit_proof_referral_plans")
    .update({ proof_id: proofId, status: "complete" })
    .eq("workspace_id", workspaceId)
    .eq("id", plan.data.id);
  throwDatabaseError("Complete Stage 4 proof plan", planUpdate.error);
  return { proofId, proofPublished: true, permissionScope: plan.data.proof_permission_scope };
}

async function logOutboundActivity(
  client: SupabaseClient,
  workspaceId: string,
  actorId: string,
  action: ActionRequestRow,
) {
  const opportunity = await client
    .from("orbit_sales_opportunities")
    .select("lead_id")
    .eq("workspace_id", workspaceId)
    .eq("id", action.opportunity_id)
    .single();
  throwDatabaseError("Resolve Stage 4 outbound lead", opportunity.error);
  if (!opportunity.data) return;
  const kind = action.capability_key === "growth.proposal_send"
    ? "proposal"
    : action.channel === "email"
      ? "email"
      : action.channel === "whatsapp"
        ? "whatsapp"
        : action.channel === "phone"
          ? "call"
          : "note";
  const outcome = action.capability_key === "growth.proposal_send" ? "proposal_sent" : "sent";
  const activity = await client.from("lead_activities").insert({
    workspace_id: workspaceId,
    lead_id: opportunity.data.lead_id,
    kind,
    direction: "outbound",
    outcome,
    summary: `Stage 4 executed ${action.capability_key} through the governed gateway.`,
    next_action: action.capability_key === "growth.outreach_send" || action.capability_key === "growth.followup_send"
      ? "Wait for a real reply before changing sales intent."
      : null,
    created_by: actorId,
  });
  throwDatabaseError("Log Stage 4 outbound activity", activity.error);
}

export async function executeStageFourAction(
  client: SupabaseClient,
  workspaceId: string,
  actorId: string,
  rawInput: unknown,
) {
  const input = stageFourExecuteSchema.parse(rawInput);
  await assertFounderAuthority(client, workspaceId, actorId);
  const config = await ensureConfig(client, workspaceId, actorId);
  const action = await loadActionRequest(client, workspaceId, input.actionRequestId);

  if (action.status === "succeeded") {
    return { actionRequestId: action.id, status: "succeeded" as const, reused: true, externalActionExecuted: true };
  }
  if (!["queued", "approved", "failed"].includes(action.status)) {
    throw new Error(`Stage 4 action cannot execute from status ${action.status}.`);
  }
  if (Date.parse(action.scheduled_at) > Date.now()) {
    throw new Error("Stage 4 action is scheduled for a future time.");
  }

  const expectedHash = canonicalPayloadHash({
    capabilityKey: action.capability_key,
    channel: action.channel,
    destination: action.destination,
    artifactRefs: action.artifact_refs,
    payload: action.payload,
  });
  if (expectedHash !== action.payload_hash) {
    return blockAction(client, workspaceId, actorId, action, "payload_hash_mismatch", "Stage 4 action payload changed after approval; a new approval is required.");
  }

  await assertExecutionApproval(client, workspaceId, action);

  if (!["running", "degraded"].includes(config.state)) {
    return blockAction(client, workspaceId, actorId, action, "autopilot_not_running", `Autopilot state is ${config.state}.`);
  }

  if (config.mode !== "simulation") {
    if (config.kill_switch_engaged) {
      return blockAction(client, workspaceId, actorId, action, "kill_switch", "Stage 4 kill switch is engaged.");
    }
    if (!config.external_actions_enabled) {
      return blockAction(client, workspaceId, actorId, action, "external_actions_disabled", "Stage 4 external actions are disabled.");
    }
  }

  if (outboundCapabilities.has(action.capability_key)) {
    if (!withinWorkingWindow(config)) {
      return blockAction(client, workspaceId, actorId, action, "outside_working_hours", "Stage 4 outbound action is outside approved working hours or days.");
    }
    const recentCount = await countRecentActions(client, workspaceId);
    if (recentCount >= config.max_daily_outbound) {
      return blockAction(client, workspaceId, actorId, action, "daily_rate_limit", "Stage 4 rolling 24-hour outbound limit has been reached.");
    }
    if (config.last_external_action_at && Date.now() - Date.parse(config.last_external_action_at) < config.min_seconds_between_outbound * 1000) {
      return blockAction(client, workspaceId, actorId, action, "cooldown", "Stage 4 outbound cooldown has not elapsed.");
    }
    if (action.capability_key === "growth.outreach_send") {
      const activeProjects = await countRows(
        client
          .from("projects")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", workspaceId)
          .in("status", ["planned", "in_progress", "review", "blocked"]),
        "Recheck Stage 4 capacity governor",
      );
      if (activeProjects >= config.max_active_projects) {
        return blockAction(client, workspaceId, actorId, action, "capacity_governor", "New cold outreach is paused because delivery capacity is full; hot leads and follow-ups may continue.");
      }
    }
  }

  if (stageFourGatewayCapabilities.has(action.capability_key) && action.channel === "manual") {
    return blockAction(client, workspaceId, actorId, action, "manual_channel", "This Stage 4 action requires a human to perform the manual channel step.");
  }
  if (stageFourGatewayCapabilities.has(action.capability_key) && action.channel === "phone") {
    return blockAction(client, workspaceId, actorId, action, "phone_requires_human", "Automated phone calling is not enabled in Stage 4.");
  }

  const attempts = await beginExecution(client, workspaceId, action);

  if (config.mode === "simulation") {
    const output = { simulated: true, capabilityKey: action.capability_key, payloadHash: action.payload_hash, externalActionExecuted: false };
    await succeedExecution(client, workspaceId, actorId, config, action, output, "simulation", null);
    return { actionRequestId: action.id, status: "succeeded" as const, ...output };
  }

  try {
    if (action.capability_key === "cash.payment_collect") {
      throw new Error("Stage 4 does not have a dedicated payment collection provider; money movement remains fail-closed.");
    }

    if (action.capability_key === "delivery.project_activate") {
      const output = await executeProjectActivation(client, workspaceId, actorId, action);
      await succeedExecution(client, workspaceId, actorId, config, action, output, "orbit_internal", action.id);
      return { actionRequestId: action.id, status: "succeeded" as const, ...output, externalActionExecuted: true };
    }

    if (action.capability_key === "proof.publish") {
      const output = await executeProofPublish(client, workspaceId, actorId, action);
      await succeedExecution(client, workspaceId, actorId, config, action, output, "orbit_internal", action.id);
      return { actionRequestId: action.id, status: "succeeded" as const, ...output, externalActionExecuted: true };
    }

    if (!isStageFourGatewayConfigured()) {
      throw new Error("Stage 4 signed external gateway is not configured in the runtime environment.");
    }

    const existingCall = await client
      .from("orbit_action_calls")
      .select("id,status,response_summary")
      .eq("workspace_id", workspaceId)
      .eq("request_id", action.request_id)
      .maybeSingle();
    throwDatabaseError("Resolve Stage 4 action call audit", existingCall.error);
    let callId: string;
    if (existingCall.data?.status === "succeeded") {
      const output = { ...existingCall.data.response_summary, reusedActionCall: true } as Record<string, unknown>;
      await succeedExecution(client, workspaceId, actorId, config, action, output, "orbit_gateway", null);
      return { actionRequestId: action.id, status: "succeeded" as const, ...output, externalActionExecuted: true };
    }
    if (existingCall.data) {
      callId = existingCall.data.id as string;
      const restart = await client
        .from("orbit_action_calls")
        .update({ status: "started", response_summary: {}, error_code: null, completed_at: null })
        .eq("id", callId);
      throwDatabaseError("Restart Stage 4 action call audit", restart.error);
    } else {
      const call = await client
        .from("orbit_action_calls")
        .insert({
          workspace_id: workspaceId,
          actor_id: actorId,
          action_key_id: null,
          operation: action.capability_key,
          request_id: action.request_id,
          request_summary: {
            stage: 4,
            actionRequestId: action.id,
            capabilityKey: action.capability_key,
            channel: action.channel,
            payloadHash: action.payload_hash,
          },
          status: "started",
        })
        .select("id")
        .single();
      throwDatabaseError("Begin Stage 4 action call audit", call.error);
      if (!call.data) throw new Error("Stage 4 action call audit was not returned.");
      callId = call.data.id as string;
    }

    const gatewayResult = await dispatchStageFourGateway({
      requestId: action.request_id,
      workspaceId,
      actionRequestId: action.id,
      capabilityKey: action.capability_key,
      channel: action.channel,
      destination: action.destination,
      idempotencyKey: action.idempotency_key,
      payload: action.payload,
      requestedAt: new Date().toISOString(),
    });

    const callUpdate = await client
      .from("orbit_action_calls")
      .update({
        status: gatewayResult.ok ? "succeeded" : "failed",
        response_summary: gatewayResult.responseSummary,
        error_code: gatewayResult.errorCode,
        completed_at: new Date().toISOString(),
      })
      .eq("id", callId);
    throwDatabaseError("Complete Stage 4 action call audit", callUpdate.error);

    if (!gatewayResult.ok) {
      await failExecution(
        client,
        workspaceId,
        actorId,
        config,
        action,
        attempts,
        gatewayResult.errorCode ?? "gateway_failure",
        "Stage 4 external gateway did not confirm the action.",
        gatewayResult.responseSummary,
      );
      return {
        actionRequestId: action.id,
        status: attempts >= action.max_attempts ? "quarantined" as const : "failed" as const,
        errorCode: gatewayResult.errorCode,
        externalActionExecuted: false,
      };
    }

    await logOutboundActivity(client, workspaceId, actorId, action);
    const output = {
      gateway: true,
      provider: gatewayResult.provider,
      providerRequestId: gatewayResult.providerRequestId,
      responseSummary: gatewayResult.responseSummary,
    };
    await succeedExecution(
      client,
      workspaceId,
      actorId,
      config,
      action,
      output,
      gatewayResult.provider,
      gatewayResult.providerRequestId,
    );
    return { actionRequestId: action.id, status: "succeeded" as const, ...output, externalActionExecuted: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Stage 4 execution failure";
    await failExecution(client, workspaceId, actorId, config, action, attempts, "stage4_execution_failure", message);
    return {
      actionRequestId: action.id,
      status: attempts >= action.max_attempts ? "quarantined" as const : "failed" as const,
      errorCode: "stage4_execution_failure",
      message,
      externalActionExecuted: false,
    };
  }
}
