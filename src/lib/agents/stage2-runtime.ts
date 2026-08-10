import type { SupabaseClient } from "@supabase/supabase-js";
import { stageTwoAgentCatalog } from "@/lib/agents/catalog";
import {
  createAgentRun,
  enqueueAgentTask,
  registerAgentDefinition,
  writeAgentEvent,
} from "@/lib/agents/store";
import {
  stageTwoLeadCycleSchema,
  type LeadIntelligenceResult,
} from "@/lib/agents/stage2-contracts";
import {
  scoreLeadForStageTwo,
  type StageTwoFinderInput,
  type StageTwoLeadInput,
} from "@/lib/agents/stage2-scoring";
import { createStageTwoOutreachDraft } from "@/lib/agents/stage2-outreach";

type RuntimeAgent = {
  id: string;
  status: string;
};

type RuntimePermission = {
  effect: "allow" | "deny";
  authority_level: "green" | "amber" | "red";
  conditions: Record<string, unknown>;
};

type ExistingRun = {
  id: string;
  status: string;
  output: Record<string, unknown>;
};

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

  throwDatabaseError("Resolve Stage 2 founder authority", error);
  if (!data || !["owner", "admin", "founder"].includes(data.role)) {
    throw new Error("Founder or workspace-admin authority is required for Stage 2.");
  }
}

async function bootstrapStageTwoAgents(
  client: SupabaseClient,
  workspaceId: string,
  actorId: string,
) {
  for (const definition of stageTwoAgentCatalog) {
    await registerAgentDefinition(client, workspaceId, actorId, definition);
  }
}

async function resolveAgentPermission(
  client: SupabaseClient,
  workspaceId: string,
  agentKey: string,
  capabilityKey: string,
) {
  const { data: agent, error: agentError } = await client
    .from("orbit_agents")
    .select("id,status")
    .eq("workspace_id", workspaceId)
    .eq("agent_key", agentKey)
    .single();
  throwDatabaseError(`Resolve ${agentKey}`, agentError);
  if (!agent) throw new Error(`Agent ${agentKey} was not found.`);

  const runtimeAgent = agent as RuntimeAgent;
  if (runtimeAgent.status !== "active") {
    throw new Error(`Agent ${agentKey} is not active.`);
  }

  const { data: permission, error: permissionError } = await client
    .from("orbit_agent_permissions")
    .select("effect,authority_level,conditions")
    .eq("workspace_id", workspaceId)
    .eq("agent_id", runtimeAgent.id)
    .eq("capability_key", capabilityKey)
    .single();
  throwDatabaseError(`Resolve ${agentKey} permission ${capabilityKey}`, permissionError);
  if (!permission) throw new Error(`Permission ${capabilityKey} was not found for ${agentKey}.`);

  const runtimePermission = permission as RuntimePermission;
  if (runtimePermission.effect !== "allow") {
    throw new Error(`Agent ${agentKey} is denied capability ${capabilityKey}.`);
  }

  return { agent: runtimeAgent, permission: runtimePermission };
}

async function assertGreenCapability(
  client: SupabaseClient,
  workspaceId: string,
  agentKey: string,
  capabilityKey: string,
) {
  const resolved = await resolveAgentPermission(client, workspaceId, agentKey, capabilityKey);
  if (resolved.permission.authority_level !== "green") {
    throw new Error(
      `Stage 2 cannot auto-execute ${capabilityKey}; authority is ${resolved.permission.authority_level}.`,
    );
  }
  return resolved;
}

async function findExistingRootRun(
  client: SupabaseClient,
  workspaceId: string,
  idempotencyKey: string | undefined,
): Promise<ExistingRun | null> {
  if (!idempotencyKey) return null;
  const { data, error } = await client
    .from("orbit_agent_runs")
    .select("id,status,output")
    .eq("workspace_id", workspaceId)
    .eq("idempotency_key", `stage2:${idempotencyKey}`)
    .maybeSingle();
  throwDatabaseError("Resolve existing Stage 2 run", error);
  return (data as ExistingRun | null) ?? null;
}

async function loadLead(
  client: SupabaseClient,
  workspaceId: string,
  leadId: string,
): Promise<StageTwoLeadInput & { id: string }> {
  const { data, error } = await client
    .from("leads")
    .select(
      "id,name,company,email,phone,whatsapp,source,stage,estimated_value,niche,lead_score,pain_point,notes,google_maps_url,google_place_id",
    )
    .eq("workspace_id", workspaceId)
    .eq("id", leadId)
    .single();
  throwDatabaseError("Load Stage 2 lead", error);
  if (!data) throw new Error(`Lead ${leadId} was not found in this workspace.`);
  return data as StageTwoLeadInput & { id: string };
}

async function loadFinderEvidence(
  client: SupabaseClient,
  workspaceId: string,
  lead: StageTwoLeadInput & { id: string },
): Promise<StageTwoFinderInput | null> {
  const select =
    "id,business_name,formatted_address,website_url,phone,rating,review_count,niche,target_problem,fit_score,problem_score,contactability_score,commercial_score,total_score,score_reason,detected_weakness,recommended_offer,suggested_next_action";

  const byLead = await client
    .from("lead_finder_results")
    .select(select)
    .eq("workspace_id", workspaceId)
    .eq("lead_id", lead.id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  throwDatabaseError("Load linked Lead Finder evidence", byLead.error);
  if (byLead.data) return byLead.data as StageTwoFinderInput;

  if (!lead.google_place_id) return null;
  const byPlace = await client
    .from("lead_finder_results")
    .select(select)
    .eq("workspace_id", workspaceId)
    .eq("provider_place_id", lead.google_place_id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  throwDatabaseError("Load Lead Finder evidence by place", byPlace.error);
  return (byPlace.data as StageTwoFinderInput | null) ?? null;
}

async function startRunAndTask(
  client: SupabaseClient,
  workspaceId: string,
  runId: string,
  taskId: string,
) {
  const now = new Date().toISOString();
  const runUpdate = await client
    .from("orbit_agent_runs")
    .update({ status: "running", started_at: now })
    .eq("workspace_id", workspaceId)
    .eq("id", runId);
  throwDatabaseError("Start Stage 2 run", runUpdate.error);

  const taskUpdate = await client
    .from("orbit_agent_tasks")
    .update({ status: "running", attempts: 1, locked_at: now })
    .eq("workspace_id", workspaceId)
    .eq("id", taskId);
  throwDatabaseError("Start Stage 2 task", taskUpdate.error);
}

async function succeedRunAndTask(
  client: SupabaseClient,
  workspaceId: string,
  runId: string,
  taskId: string,
  output: Record<string, unknown>,
) {
  const now = new Date().toISOString();
  const taskUpdate = await client
    .from("orbit_agent_tasks")
    .update({ status: "succeeded", output, completed_at: now })
    .eq("workspace_id", workspaceId)
    .eq("id", taskId);
  throwDatabaseError("Complete Stage 2 task", taskUpdate.error);

  const runUpdate = await client
    .from("orbit_agent_runs")
    .update({ status: "succeeded", output, completed_at: now })
    .eq("workspace_id", workspaceId)
    .eq("id", runId);
  throwDatabaseError("Complete Stage 2 run", runUpdate.error);
}

async function failRunAndTask(
  client: SupabaseClient,
  workspaceId: string,
  runId: string | null,
  taskId: string | null,
  error: unknown,
) {
  const now = new Date().toISOString();
  const message = error instanceof Error ? error.message : "Unknown Stage 2 failure";

  if (taskId) {
    await client
      .from("orbit_agent_tasks")
      .update({ status: "failed", error: { message }, completed_at: now })
      .eq("workspace_id", workspaceId)
      .eq("id", taskId);
  }
  if (runId) {
    await client
      .from("orbit_agent_runs")
      .update({ status: "failed", error: { message }, completed_at: now })
      .eq("workspace_id", workspaceId)
      .eq("id", runId);
  }
}

async function persistLeadIntelligence(
  client: SupabaseClient,
  workspaceId: string,
  actorId: string,
  lead: StageTwoLeadInput & { id: string },
  finder: StageTwoFinderInput | null,
  runId: string,
  taskId: string,
  agentId: string,
  intelligence: LeadIntelligenceResult,
) {
  const { data, error } = await client
    .from("orbit_lead_intelligence")
    .insert({
      workspace_id: workspaceId,
      lead_id: lead.id,
      finder_result_id: finder?.id ?? null,
      run_id: runId,
      task_id: taskId,
      agent_id: agentId,
      fit_score: intelligence.fitScore,
      problem_score: intelligence.problemScore,
      contactability_score: intelligence.contactabilityScore,
      commercial_score: intelligence.commercialScore,
      total_score: intelligence.totalScore,
      qualification: intelligence.qualification,
      pain_point: intelligence.painPoint,
      detected_weakness: intelligence.detectedWeakness,
      recommended_offer: intelligence.recommendedOffer,
      recommended_channel: intelligence.recommendedChannel,
      suggested_next_action: intelligence.suggestedNextAction,
      evidence: intelligence.evidence,
      scoring_basis: intelligence.scoringBasis,
      created_by: actorId,
    })
    .select("id")
    .single();
  throwDatabaseError("Persist Lead Intelligence", error);
  if (!data) throw new Error("Lead Intelligence snapshot was not returned after creation.");

  const preservedStage = ["raw", "new", "scored"].includes(lead.stage)
    ? intelligence.qualification === "qualified"
      ? "qualified"
      : "scored"
    : lead.stage;

  const leadUpdate = await client
    .from("leads")
    .update({
      lead_score: intelligence.totalScore,
      pain_point: lead.pain_point ?? intelligence.painPoint,
      next_action: intelligence.suggestedNextAction.slice(0, 240),
      stage: preservedStage,
    })
    .eq("workspace_id", workspaceId)
    .eq("id", lead.id);
  throwDatabaseError("Sync Lead Intelligence to lead", leadUpdate.error);

  const activity = await client.from("lead_activities").insert({
    workspace_id: workspaceId,
    lead_id: lead.id,
    kind: "audit",
    direction: "internal",
    outcome: "logged",
    summary: `Lead Intelligence scored this lead ${intelligence.totalScore}/100 (${intelligence.qualification}).`,
    next_action: intelligence.suggestedNextAction.slice(0, 240),
    created_by: actorId,
  });
  throwDatabaseError("Log Lead Intelligence activity", activity.error);

  return data.id as string;
}

async function persistOutreachDraft(
  client: SupabaseClient,
  workspaceId: string,
  actorId: string,
  leadId: string,
  intelligenceId: string,
  runId: string,
  taskId: string,
  agentId: string,
  draft: Awaited<ReturnType<typeof createStageTwoOutreachDraft>>,
) {
  const { data, error } = await client
    .from("orbit_outreach_drafts")
    .insert({
      workspace_id: workspaceId,
      lead_id: leadId,
      intelligence_id: intelligenceId,
      run_id: runId,
      task_id: taskId,
      agent_id: agentId,
      channel: draft.channel,
      subject: draft.subject,
      body: draft.body,
      status: "draft",
      personalization_basis: draft.personalizationBasis,
      generation_mode: draft.generationMode,
      model_provider: draft.modelProvider,
      model_name: draft.modelName,
      external_send_enabled: false,
      created_by: actorId,
    })
    .select("id")
    .single();
  throwDatabaseError("Persist Stage 2 outreach draft", error);
  if (!data) throw new Error("Outreach draft was not returned after creation.");

  const activity = await client.from("lead_activities").insert({
    workspace_id: workspaceId,
    lead_id: leadId,
    kind: "note",
    direction: "internal",
    outcome: "logged",
    summary: `Orbit prepared a ${draft.channel} outreach draft. It has not been sent.`,
    next_action: "Review the outreach draft before any future sending stage.",
    created_by: actorId,
  });
  throwDatabaseError("Log outreach draft activity", activity.error);

  return data.id as string;
}

export async function runStageTwoLeadCycle(
  client: SupabaseClient,
  workspaceId: string,
  actorId: string,
  rawInput: unknown,
) {
  const input = stageTwoLeadCycleSchema.parse(rawInput);
  await assertFounderAuthority(client, workspaceId, actorId);
  await bootstrapStageTwoAgents(client, workspaceId, actorId);

  const existing = await findExistingRootRun(client, workspaceId, input.idempotencyKey);
  if (existing) {
    return {
      status: existing.status,
      rootRunId: existing.id,
      reused: true,
      output: existing.output,
    };
  }

  const director = await assertGreenCapability(
    client,
    workspaceId,
    "sales_director",
    "agents.delegate",
  );
  const lead = await loadLead(client, workspaceId, input.leadId);
  const finder = await loadFinderEvidence(client, workspaceId, lead);

  const rootRun = await createAgentRun(client, workspaceId, actorId, {
    agentKey: "sales_director",
    triggerType: "manual",
    idempotencyKey: input.idempotencyKey ? `stage2:${input.idempotencyKey}` : undefined,
    input: {
      leadId: lead.id,
      workflow: "lead_intelligence_to_outreach_draft",
      externalActionsEnabled: false,
    },
  });
  const rootTask = await enqueueAgentTask(client, workspaceId, {
    runId: rootRun.id,
    assignedAgentKey: "sales_director",
    capabilityKey: "agents.delegate",
    taskType: "stage2_sales_cycle",
    title: `Orchestrate Lead Intelligence and outreach draft for ${lead.company ?? lead.name}`,
    riskLevel: "green",
    priority: 70,
    input: { leadId: lead.id, externalActionsEnabled: false },
    idempotencyKey: input.idempotencyKey ? `stage2:${input.idempotencyKey}:director` : undefined,
  });

  let intelligenceRunId: string | null = null;
  let intelligenceTaskId: string | null = null;
  let outreachRunId: string | null = null;
  let outreachTaskId: string | null = null;

  try {
    await startRunAndTask(client, workspaceId, rootRun.id, rootTask.id);
    await writeAgentEvent(client, {
      workspaceId,
      runId: rootRun.id,
      taskId: rootTask.id,
      agentId: director.agent.id,
      eventType: "stage2.started",
      message: "Sales Director started the Stage 2 lead cycle.",
      data: { leadId: lead.id, externalActionsEnabled: false },
    });

    const intelligencePermission = await assertGreenCapability(
      client,
      workspaceId,
      "lead_intelligence",
      "growth.lead_intelligence",
    );
    const intelligenceRun = await createAgentRun(client, workspaceId, actorId, {
      agentKey: "lead_intelligence",
      parentRunId: rootRun.id,
      triggerType: "agent",
      idempotencyKey: input.idempotencyKey ? `stage2:${input.idempotencyKey}:intelligence-run` : undefined,
      input: { leadId: lead.id, finderResultId: finder?.id ?? null },
    });
    intelligenceRunId = intelligenceRun.id;
    const intelligenceTask = await enqueueAgentTask(client, workspaceId, {
      runId: intelligenceRun.id,
      assignedAgentKey: "lead_intelligence",
      capabilityKey: "growth.lead_intelligence",
      parentTaskId: rootTask.id,
      taskType: "lead_intelligence",
      title: `Analyze and qualify ${lead.company ?? lead.name}`,
      riskLevel: "green",
      priority: 80,
      input: { leadId: lead.id, finderResultId: finder?.id ?? null },
      idempotencyKey: input.idempotencyKey ? `stage2:${input.idempotencyKey}:intelligence-task` : undefined,
    });
    intelligenceTaskId = intelligenceTask.id;
    await startRunAndTask(client, workspaceId, intelligenceRun.id, intelligenceTask.id);

    const intelligence = scoreLeadForStageTwo(lead, finder, {
      requestedChannel: input.requestedChannel,
      qualifiedThreshold: input.qualifiedThreshold,
      reviewThreshold: input.reviewThreshold,
    });
    const intelligenceId = await persistLeadIntelligence(
      client,
      workspaceId,
      actorId,
      lead,
      finder,
      intelligenceRun.id,
      intelligenceTask.id,
      intelligencePermission.agent.id,
      intelligence,
    );
    const intelligenceOutput = {
      intelligenceId,
      totalScore: intelligence.totalScore,
      qualification: intelligence.qualification,
      recommendedChannel: intelligence.recommendedChannel,
    };
    await succeedRunAndTask(
      client,
      workspaceId,
      intelligenceRun.id,
      intelligenceTask.id,
      intelligenceOutput,
    );
    await writeAgentEvent(client, {
      workspaceId,
      runId: intelligenceRun.id,
      taskId: intelligenceTask.id,
      agentId: intelligencePermission.agent.id,
      eventType: "lead_intelligence.completed",
      message: `Lead Intelligence completed at ${intelligence.totalScore}/100 (${intelligence.qualification}).`,
      data: intelligenceOutput,
    });

    if (intelligence.qualification !== "qualified") {
      const result = {
        decision: "hold_outreach",
        leadId: lead.id,
        intelligenceId,
        totalScore: intelligence.totalScore,
        qualification: intelligence.qualification,
        draftId: null,
        externalActionExecuted: false,
      };
      await succeedRunAndTask(client, workspaceId, rootRun.id, rootTask.id, result);
      await writeAgentEvent(client, {
        workspaceId,
        runId: rootRun.id,
        taskId: rootTask.id,
        agentId: director.agent.id,
        eventType: "stage2.completed",
        message: "Sales Director held outreach because the lead did not meet the qualified threshold.",
        data: result,
      });
      return { status: "succeeded" as const, rootRunId: rootRun.id, reused: false, output: result };
    }

    const outreachPermission = await assertGreenCapability(
      client,
      workspaceId,
      "outreach",
      "growth.outreach_draft",
    );
    const outreachRun = await createAgentRun(client, workspaceId, actorId, {
      agentKey: "outreach",
      parentRunId: rootRun.id,
      triggerType: "agent",
      idempotencyKey: input.idempotencyKey ? `stage2:${input.idempotencyKey}:outreach-run` : undefined,
      input: { leadId: lead.id, intelligenceId, externalSendEnabled: false },
    });
    outreachRunId = outreachRun.id;
    const outreachTask = await enqueueAgentTask(client, workspaceId, {
      runId: outreachRun.id,
      assignedAgentKey: "outreach",
      capabilityKey: "growth.outreach_draft",
      parentTaskId: rootTask.id,
      taskType: "outreach_draft",
      title: `Draft ${intelligence.recommendedChannel} outreach for ${lead.company ?? lead.name}`,
      riskLevel: "green",
      priority: 75,
      input: { leadId: lead.id, intelligenceId, externalSendEnabled: false },
      idempotencyKey: input.idempotencyKey ? `stage2:${input.idempotencyKey}:outreach-task` : undefined,
    });
    outreachTaskId = outreachTask.id;
    await startRunAndTask(client, workspaceId, outreachRun.id, outreachTask.id);

    const draft = await createStageTwoOutreachDraft(lead, intelligence);
    const draftId = await persistOutreachDraft(
      client,
      workspaceId,
      actorId,
      lead.id,
      intelligenceId,
      outreachRun.id,
      outreachTask.id,
      outreachPermission.agent.id,
      draft,
    );
    const outreachOutput = {
      draftId,
      channel: draft.channel,
      generationMode: draft.generationMode,
      externalSendEnabled: false,
    };
    await succeedRunAndTask(
      client,
      workspaceId,
      outreachRun.id,
      outreachTask.id,
      outreachOutput,
    );
    await writeAgentEvent(client, {
      workspaceId,
      runId: outreachRun.id,
      taskId: outreachTask.id,
      agentId: outreachPermission.agent.id,
      eventType: "outreach.draft_created",
      message: "Outreach created a personalized draft with external sending disabled.",
      data: outreachOutput,
    });

    const result = {
      decision: "draft_prepared",
      leadId: lead.id,
      intelligenceId,
      draftId,
      totalScore: intelligence.totalScore,
      qualification: intelligence.qualification,
      channel: draft.channel,
      generationMode: draft.generationMode,
      childRuns: { intelligence: intelligenceRun.id, outreach: outreachRun.id },
      externalActionExecuted: false,
    };
    await succeedRunAndTask(client, workspaceId, rootRun.id, rootTask.id, result);
    await writeAgentEvent(client, {
      workspaceId,
      runId: rootRun.id,
      taskId: rootTask.id,
      agentId: director.agent.id,
      eventType: "stage2.completed",
      message: "Sales Director completed Stage 2 with a qualified lead intelligence snapshot and unsent outreach draft.",
      data: result,
    });

    return { status: "succeeded" as const, rootRunId: rootRun.id, reused: false, output: result };
  } catch (error) {
    await failRunAndTask(client, workspaceId, outreachRunId, outreachTaskId, error);
    await failRunAndTask(client, workspaceId, intelligenceRunId, intelligenceTaskId, error);
    await failRunAndTask(client, workspaceId, rootRun.id, rootTask.id, error);
    throw error;
  }
}
