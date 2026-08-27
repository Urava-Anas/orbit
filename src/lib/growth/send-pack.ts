import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { stageThreeAgentCatalog } from "@/lib/agents/catalog";
import {
  createAgentRun,
  enqueueAgentTask,
  registerAgentDefinition,
} from "@/lib/agents/store";
import {
  decideStageFourAction,
  executeStageFourAction,
  requestStageFourAction,
} from "@/lib/agents/stage4-runtime";
import { recordCompanyEventBestEffort } from "@/lib/memory/store";

type Channel = "email" | "whatsapp";

type BuildInput = {
  leadId: string;
  pricingPlanId: string;
  channel?: Channel;
};

function asStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => String(item).trim()).filter(Boolean)
    : [];
}

function chooseChannel(lead: {
  email: string | null;
  whatsapp: string | null;
  phone: string | null;
}, requested?: Channel): Channel {
  if (requested === "email" && lead.email?.trim()) return "email";
  if (
    requested === "whatsapp" &&
    (lead.whatsapp?.trim() || lead.phone?.trim())
  ) {
    return "whatsapp";
  }
  if (lead.email?.trim()) return "email";
  if (lead.whatsapp?.trim() || lead.phone?.trim()) return "whatsapp";
  throw new Error("This lead has no sendable email or WhatsApp destination.");
}

function priceShape(plan: {
  pricing_type: string;
  base_price: number | string | null;
  min_price: number | string | null;
  max_price: number | string | null;
}) {
  if (plan.pricing_type === "custom") {
    throw new Error(
      "Custom pricing requires a founder-selected price before a send pack can be built.",
    );
  }
  const base = Number(plan.base_price);
  const min = Number(plan.min_price);
  const max = Number(plan.max_price);
  if (![base, min, max].every(Number.isFinite)) {
    throw new Error("Pricing plan is missing a valid approved price range.");
  }
  return { base, min, max };
}


async function artifactContext(
  client: SupabaseClient,
  workspaceId: string,
  actorId: string,
  agentKey: "outreach" | "follow_up" | "proposal",
  capabilityKey: string,
  taskType: string,
  title: string,
  idempotencyKey: string,
) {
  for (const definition of stageThreeAgentCatalog) {
    await registerAgentDefinition(client, workspaceId, actorId, definition);
  }

  const agent = await client
    .from("orbit_agents")
    .select("id,status")
    .eq("workspace_id", workspaceId)
    .eq("agent_key", agentKey)
    .single();
  if (agent.error || !agent.data || agent.data.status !== "active") {
    throw new Error(`Orbit agent ${agentKey} is unavailable.`);
  }

  const permission = await client
    .from("orbit_agent_permissions")
    .select("effect,authority_level")
    .eq("workspace_id", workspaceId)
    .eq("agent_id", agent.data.id)
    .eq("capability_key", capabilityKey)
    .single();
  if (
    permission.error ||
    !permission.data ||
    permission.data.effect !== "allow" ||
    permission.data.authority_level !== "green"
  ) {
    throw new Error(
      `${agentKey} is not green-authorized for ${capabilityKey}.`,
    );
  }

  const run = await createAgentRun(client, workspaceId, actorId, {
    agentKey,
    triggerType: "manual",
    input: { workflow: "commercial_send_pack", externalActionsEnabled: false },
    idempotencyKey: `${idempotencyKey}:run`,
  });

  const task = await enqueueAgentTask(client, workspaceId, {
    runId: run.id,
    assignedAgentKey: agentKey,
    capabilityKey,
    taskType,
    title,
    riskLevel: "green",
    priority: 90,
    input: { workflow: "commercial_send_pack", externalActionsEnabled: false },
    idempotencyKey: `${idempotencyKey}:task`,
  });

  const now = new Date().toISOString();
  const [runUpdate, taskUpdate] = await Promise.all([
    client
      .from("orbit_agent_runs")
      .update({
        status: "succeeded",
        started_at: now,
        completed_at: now,
        output: { workflow: "commercial_send_pack", artifactPrepared: true },
      })
      .eq("workspace_id", workspaceId)
      .eq("id", run.id),
    client
      .from("orbit_agent_tasks")
      .update({
        status: "succeeded",
        attempts: 1,
        completed_at: now,
        output: { workflow: "commercial_send_pack", artifactPrepared: true },
      })
      .eq("workspace_id", workspaceId)
      .eq("id", task.id),
  ]);
  if (runUpdate.error) {
    throw new Error(`Complete artifact run: ${runUpdate.error.message}`);
  }
  if (taskUpdate.error) {
    throw new Error(`Complete artifact task: ${taskUpdate.error.message}`);
  }

  return {
    runId: run.id,
    taskId: task.id,
    agentId: String(agent.data.id),
  };
}

async function ensureOpportunity(
  client: SupabaseClient,
  workspaceId: string,
  actorId: string,
  leadId: string,
) {
  const existing = await client
    .from("orbit_sales_opportunities")
    .select("id,current_state,status,version,context")
    .eq("workspace_id", workspaceId)
    .eq("lead_id", leadId)
    .maybeSingle();
  if (existing.error) {
    throw new Error(`Load sales opportunity: ${existing.error.message}`);
  }

  if (existing.data) {
    if (["won", "lost", "completed"].includes(existing.data.status)) {
      throw new Error(
        `This opportunity is already ${existing.data.status} and cannot receive a new proposal pack.`,
      );
    }
    const updated = await client
      .from("orbit_sales_opportunities")
      .update({
        current_state: "proposal_drafted",
        status: "active",
        version: Number(existing.data.version || 1) + 1,
        context: {
          ...(existing.data.context ?? {}),
          commercial_pack_ready: true,
          commercial_pack_updated_at: new Date().toISOString(),
        },
      })
      .eq("workspace_id", workspaceId)
      .eq("id", existing.data.id)
      .select("id")
      .single();
    if (updated.error || !updated.data) {
      throw new Error(
        `Advance sales opportunity: ${updated.error?.message ?? "not returned"}`,
      );
    }
    return String(updated.data.id);
  }

  const created = await client
    .from("orbit_sales_opportunities")
    .insert({
      workspace_id: workspaceId,
      lead_id: leadId,
      current_state: "proposal_drafted",
      status: "active",
      version: 1,
      context: {
        commercial_pack_ready: true,
        commercial_pack_created_at: new Date().toISOString(),
      },
      created_by: actorId,
    })
    .select("id")
    .single();

  if (created.error || !created.data) {
    throw new Error(
      `Create sales opportunity: ${created.error?.message ?? "not returned"}`,
    );
  }
  return String(created.data.id);
}

export async function buildRecommendedSendPack(
  client: SupabaseClient,
  workspaceId: string,
  actorId: string,
  input: BuildInput,
) {
  const [leadResult, planResult] = await Promise.all([
    client
      .from("leads")
      .select(
        "id,name,company,email,phone,whatsapp,niche,pain_point,stage,lead_score,estimated_value,currency",
      )
      .eq("workspace_id", workspaceId)
      .eq("id", input.leadId)
      .single(),
    client
      .from("pricing_plans")
      .select(
        "id,plan_key,name,service_category,summary,pricing_type,base_price,min_price,max_price,currency,max_discount_percent,included_features,add_ons,offer_valid_days,requires_approval,status,version",
      )
      .eq("workspace_id", workspaceId)
      .eq("id", input.pricingPlanId)
      .eq("status", "active")
      .single(),
  ]);

  if (leadResult.error || !leadResult.data) {
    throw new Error("Lead was not found in this workspace.");
  }
  if (planResult.error || !planResult.data) {
    throw new Error(
      "No matching active pricing plan exists. Publish pricing truth before generating a send pack.",
    );
  }

  const lead = leadResult.data;
  const plan = planResult.data;
  if (["won", "lost"].includes(lead.stage)) {
    throw new Error(`Lead is already ${lead.stage}; a new sales pack is not appropriate.`);
  }

  const channel = chooseChannel(lead, input.channel);
  const { base, min, max } = priceShape(plan);
  const scope = asStringArray(plan.included_features);
  if (!scope.length) {
    throw new Error("Active pricing plan has no approved included features.");
  }

  const intelligenceResult = await client
    .from("orbit_lead_intelligence")
    .select("id,total_score,qualification,recommended_offer,recommended_channel")
    .eq("workspace_id", workspaceId)
    .eq("lead_id", lead.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (intelligenceResult.error) {
    throw new Error(`Load lead intelligence: ${intelligenceResult.error.message}`);
  }
  if (!intelligenceResult.data) {
    throw new Error(
      "This lead has no Orbit intelligence record. Run qualification before building a commercial send pack.",
    );
  }
  if (intelligenceResult.data.qualification === "unqualified") {
    throw new Error("Unqualified leads cannot receive a commercial send pack.");
  }

  const opportunityId = await ensureOpportunity(
    client,
    workspaceId,
    actorId,
    lead.id,
  );

  const pricingSnapshot = {
    pricing_plan_id: plan.id,
    plan_key: plan.plan_key,
    name: plan.name,
    service_category: plan.service_category,
    pricing_type: plan.pricing_type,
    base_price: base,
    min_price: min,
    max_price: max,
    currency: plan.currency,
    max_discount_percent: Number(plan.max_discount_percent || 0),
    offer_valid_days: plan.offer_valid_days,
    version: plan.version,
    captured_at: new Date().toISOString(),
  };

  const proposalTitle = `${plan.name} — ${lead.company ?? lead.name}`;
  const assumptions = [
    "Final delivery starts only after scope and payment terms are confirmed.",
    "Any work outside the approved included features requires a revised scope.",
  ];

  const pain = lead.pain_point?.trim();
  const messageBody = [
    `Hi ${lead.name},`,
    pain
      ? `Based on what we can see, the main opportunity is: ${pain}.`
      : `I put together a focused ${plan.service_category} proposal for ${lead.company ?? lead.name}.`,
    `The recommended package is ${plan.name}, with an approved range of ${plan.currency} ${min}–${max}.`,
    `Core scope: ${scope.join(", ")}.`,
    "If the direction makes sense, reply and we can lock the exact scope and next step.",
  ].join("\n\n");

  const subject =
    channel === "email"
      ? `${plan.name} proposal for ${lead.company ?? lead.name}`.slice(0, 240)
      : null;

  const baseKey = `send-pack:${lead.id}:${plan.id}:${plan.version}`;

  const outreachCtx = await artifactContext(
    client,
    workspaceId,
    actorId,
    "outreach",
    "growth.outreach_draft",
    "commercial_send_pack_outreach",
    `Prepare commercial message for ${lead.company ?? lead.name}`,
    `${baseKey}:outreach`,
  );

  const outreach = await client
    .from("orbit_outreach_drafts")
    .insert({
      workspace_id: workspaceId,
      lead_id: lead.id,
      intelligence_id: intelligenceResult.data.id,
      run_id: outreachCtx.runId,
      task_id: outreachCtx.taskId,
      agent_id: outreachCtx.agentId,
      channel,
      subject,
      body: messageBody,
      status: "approved",
      personalization_basis: {
        pain_point: lead.pain_point,
        niche: lead.niche,
        pricing_plan_id: plan.id,
        intelligence_id: intelligenceResult.data.id,
        intelligence_score: intelligenceResult.data.total_score,
        intelligence_qualification: intelligenceResult.data.qualification,
      },
      generation_mode: "deterministic_fallback",
      model_provider: null,
      model_name: null,
      external_send_enabled: false,
      created_by: actorId,
    })
    .select("id")
    .single();

  if (outreach.error || !outreach.data) {
    throw new Error(
      `Create outreach draft: ${outreach.error?.message ?? "not returned"}`,
    );
  }

  const proposalCtx = await artifactContext(
    client,
    workspaceId,
    actorId,
    "proposal",
    "growth.proposal_draft",
    "commercial_send_pack_proposal",
    `Prepare priced proposal for ${lead.company ?? lead.name}`,
    `${baseKey}:proposal`,
  );

  const proposal = await client
    .from("orbit_proposal_drafts")
    .insert({
      workspace_id: workspaceId,
      opportunity_id: opportunityId,
      lead_id: lead.id,
      run_id: proposalCtx.runId,
      task_id: proposalCtx.taskId,
      agent_id: proposalCtx.agentId,
      title: proposalTitle.slice(0, 240),
      scope,
      price_min: min,
      price_max: max,
      currency: plan.currency,
      assumptions,
      status: plan.requires_approval ? "reviewed" : "approved",
      external_send_enabled: false,
      created_by: actorId,
      pricing_plan_id: plan.id,
      selected_price: base,
      pricing_snapshot: pricingSnapshot,
    })
    .select("id")
    .single();

  if (proposal.error || !proposal.data) {
    throw new Error(
      `Create proposal draft: ${proposal.error?.message ?? "not returned"}`,
    );
  }

  const followupCtx = await artifactContext(
    client,
    workspaceId,
    actorId,
    "follow_up",
    "growth.followup_plan",
    "commercial_send_pack_followup",
    `Prepare follow-up sequence for ${lead.company ?? lead.name}`,
    `${baseKey}:followup`,
  );

  const followup = await client
    .from("orbit_followup_plans")
    .insert({
      workspace_id: workspaceId,
      opportunity_id: opportunityId,
      lead_id: lead.id,
      outreach_draft_id: outreach.data.id,
      run_id: followupCtx.runId,
      task_id: followupCtx.taskId,
      agent_id: followupCtx.agentId,
      channel,
      sequence: [
        { touch: 1, delayHours: 24 },
        { touch: 2, delayHours: 72 },
        { touch: 3, delayHours: 120 },
      ],
      status: "ready",
      external_send_enabled: false,
      created_by: actorId,
    })
    .select("id")
    .single();

  if (followup.error || !followup.data) {
    throw new Error(
      `Create follow-up plan: ${followup.error?.message ?? "not returned"}`,
    );
  }

  const pack = await client
    .from("orbit_recommended_send_packs")
    .insert({
      workspace_id: workspaceId,
      lead_id: lead.id,
      opportunity_id: opportunityId,
      pricing_plan_id: plan.id,
      content_asset_id: null,
      action_request_id: null,
      channel,
      subject,
      message_body: messageBody,
      proposal_title: proposalTitle.slice(0, 240),
      proposal_scope: scope,
      pricing_snapshot: pricingSnapshot,
      content_snapshot: {},
      recommendation_basis: {
        lead_score: lead.lead_score,
        niche: lead.niche,
        pain_point: lead.pain_point,
        pricing_plan_version: plan.version,
        channel_reason:
          channel === "email"
            ? "Verified email preferred."
            : "WhatsApp/phone destination available.",
        outreach_draft_id: outreach.data.id,
        proposal_id: proposal.data.id,
        followup_plan_id: followup.data.id,
      },
      confidence: lead.lead_score == null ? 65 : Math.max(0, Math.min(100, lead.lead_score)),
      requires_approval: true,
      status: "waiting_approval",
      blocked_reason: null,
      created_by: actorId,
    })
    .select("id")
    .single();

  if (pack.error || !pack.data) {
    throw new Error(
      `Create recommended send pack: ${pack.error?.message ?? "not returned"}`,
    );
  }

  await recordCompanyEventBestEffort({
    workspaceId,
    actorId,
    domain: "growth",
    eventType: "send_pack.created",
    entityType: "send_pack",
    entityId: String(pack.data.id),
    payload: {
      lead_id: lead.id,
      opportunity_id: opportunityId,
      pricing_plan_id: plan.id,
      outreach_draft_id: outreach.data.id,
      proposal_id: proposal.data.id,
      followup_plan_id: followup.data.id,
      channel,
      selected_price: base,
      currency: plan.currency,
    },
  });

  return {
    sendPackId: String(pack.data.id),
    opportunityId,
    proposalId: String(proposal.data.id),
    followupPlanId: String(followup.data.id),
    pricingPlanId: String(plan.id),
    channel,
    requiresApproval: true,
  };
}

export async function approveAndSendRecommendedPack(
  client: SupabaseClient,
  workspaceId: string,
  actorId: string,
  sendPackId: string,
) {
  const pack = await client
    .from("orbit_recommended_send_packs")
    .select(
      "id,lead_id,opportunity_id,channel,recommendation_basis,status,action_request_id",
    )
    .eq("workspace_id", workspaceId)
    .eq("id", sendPackId)
    .single();

  if (pack.error || !pack.data) throw new Error("Recommended send pack was not found.");
  if (pack.data.status === "sent") {
    return {
      sendPackId,
      status: "sent" as const,
      actionRequestId: pack.data.action_request_id as string | null,
      reused: true,
    };
  }
  if (!["waiting_approval", "ready"].includes(pack.data.status)) {
    throw new Error(`Send pack cannot be approved from status ${pack.data.status}.`);
  }

  const basis =
    pack.data.recommendation_basis &&
    typeof pack.data.recommendation_basis === "object" &&
    !Array.isArray(pack.data.recommendation_basis)
      ? (pack.data.recommendation_basis as Record<string, unknown>)
      : {};
  const proposalId = String(basis.proposal_id || "");
  if (!proposalId) throw new Error("Send pack is missing its proposal artifact.");

  const channel = pack.data.channel as Channel;
  if (!["email", "whatsapp"].includes(channel)) {
    throw new Error("One-click sending only supports governed email or WhatsApp channels.");
  }

  const request = await requestStageFourAction(client, workspaceId, actorId, {
    opportunityId: pack.data.opportunity_id,
    capabilityKey: "growth.proposal_send",
    artifactId: proposalId,
    channel,
    idempotencyKey: `send-pack:${sendPackId}:proposal`,
  });

  const actionRequestId =
    "actionRequestId" in request
      ? String(request.actionRequestId)
      : "id" in request
        ? String(request.id)
        : "";

  if (!actionRequestId) {
    throw new Error("Stage 4 did not return an external action request.");
  }

  await client
    .from("orbit_recommended_send_packs")
    .update({
      action_request_id: actionRequestId,
      status:
        request.status === "waiting_approval" ? "waiting_approval" : "queued",
    })
    .eq("workspace_id", workspaceId)
    .eq("id", sendPackId);

  if (request.status === "waiting_approval") {
    await decideStageFourAction(client, workspaceId, actorId, {
      actionRequestId,
      decision: "approved",
      reason: "Founder explicitly clicked Approve & Send on the recommended send pack.",
    });
  }

  const execution = await executeStageFourAction(client, workspaceId, actorId, {
    actionRequestId,
  });

  const succeeded = execution.status === "succeeded";
  await client
    .from("orbit_recommended_send_packs")
    .update({
      status: succeeded ? "sent" : "blocked",
      sent_at: succeeded ? new Date().toISOString() : null,
      blocked_reason: succeeded
        ? null
        : `Stage 4 execution ended with status ${execution.status}.`,
    })
    .eq("workspace_id", workspaceId)
    .eq("id", sendPackId);

  await recordCompanyEventBestEffort({
    workspaceId,
    actorId,
    domain: "growth",
    eventType: succeeded ? "send_pack.sent" : "send_pack.blocked",
    entityType: "send_pack",
    entityId: sendPackId,
    payload: {
      lead_id: pack.data.lead_id,
      opportunity_id: pack.data.opportunity_id,
      action_request_id: actionRequestId,
      channel,
      execution_status: execution.status,
    },
  });

  return {
    sendPackId,
    actionRequestId,
    status: execution.status,
    externalActionExecuted: execution.externalActionExecuted,
  };
}
