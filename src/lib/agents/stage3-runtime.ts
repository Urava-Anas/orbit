import type { SupabaseClient } from "@supabase/supabase-js";
import { stageThreeAgentCatalog } from "@/lib/agents/catalog";
import {
  createAgentRun,
  enqueueAgentTask,
  registerAgentDefinition,
  writeAgentEvent,
} from "@/lib/agents/store";
import {
  assertStageThreeEventAllowed,
  stageThreeAdvanceSchema,
  stageThreePrepareSchema,
  type StageThreeOpportunityState,
} from "@/lib/agents/stage3-contracts";
import {
  scoreLeadForStageTwo,
  type StageTwoFinderInput,
  type StageTwoLeadInput,
} from "@/lib/agents/stage2-scoring";
import { createStageTwoOutreachDraft } from "@/lib/agents/stage2-outreach";
import type { LeadIntelligenceResult } from "@/lib/agents/stage2-contracts";

type RuntimeAgent = { id: string; status: string };
type RuntimePermission = {
  effect: "allow" | "deny";
  authority_level: "green" | "amber" | "red";
};
type OpportunityRow = {
  id: string;
  lead_id: string;
  current_state: StageThreeOpportunityState;
  status: "active" | "won" | "lost" | "blocked" | "completed";
  next_agent_key: string | null;
  last_agent_id: string | null;
  version: number;
  context: Record<string, unknown>;
};
type ExistingRun = { id: string; status: string; output: Record<string, unknown> };
type ResearchResult = {
  researchId: string;
  confidence: number;
  status: "complete" | "needs_review";
};
type QualificationResult = {
  qualificationId: string;
  decision: "qualified" | "review" | "unqualified";
  totalScore: number;
  recommendedOffer: string | null;
  recommendedChannel: "email" | "whatsapp" | "phone" | "manual";
};

function throwDatabaseError(operation: string, error: { message: string } | null) {
  if (error) throw new Error(`${operation}: ${error.message}`);
}

async function assertFounderAuthority(client: SupabaseClient, workspaceId: string, actorId: string) {
  const { data, error } = await client
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", actorId)
    .single();
  throwDatabaseError("Resolve Stage 3 founder authority", error);
  if (!data || !["owner", "admin", "founder"].includes(data.role)) {
    throw new Error("Founder or workspace-admin authority is required for Stage 3.");
  }
}

async function bootstrapStageThreeAgents(client: SupabaseClient, workspaceId: string, actorId: string) {
  for (const definition of stageThreeAgentCatalog) {
    await registerAgentDefinition(client, workspaceId, actorId, definition);
  }
}

async function resolveGreenAgent(
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
  throwDatabaseError(`Resolve Stage 3 agent ${agentKey}`, agentError);
  if (!agent) throw new Error(`Agent ${agentKey} was not found.`);
  const runtimeAgent = agent as RuntimeAgent;
  if (runtimeAgent.status !== "active") throw new Error(`Agent ${agentKey} is not active.`);

  const { data: permission, error: permissionError } = await client
    .from("orbit_agent_permissions")
    .select("effect,authority_level")
    .eq("workspace_id", workspaceId)
    .eq("agent_id", runtimeAgent.id)
    .eq("capability_key", capabilityKey)
    .single();
  throwDatabaseError(`Resolve Stage 3 capability ${capabilityKey}`, permissionError);
  if (!permission) throw new Error(`Capability ${capabilityKey} was not found for ${agentKey}.`);
  const runtimePermission = permission as RuntimePermission;
  if (runtimePermission.effect !== "allow") throw new Error(`${agentKey} is denied ${capabilityKey}.`);
  if (runtimePermission.authority_level !== "green") {
    throw new Error(`Stage 3 cannot auto-execute ${capabilityKey}; authority is ${runtimePermission.authority_level}.`);
  }
  return runtimeAgent;
}

async function findExistingRun(
  client: SupabaseClient,
  workspaceId: string,
  key: string | undefined,
): Promise<ExistingRun | null> {
  if (!key) return null;
  const { data, error } = await client
    .from("orbit_agent_runs")
    .select("id,status,output")
    .eq("workspace_id", workspaceId)
    .eq("idempotency_key", key)
    .maybeSingle();
  throwDatabaseError("Resolve existing Stage 3 run", error);
  return (data as ExistingRun | null) ?? null;
}

async function loadLead(
  client: SupabaseClient,
  workspaceId: string,
  leadId: string,
): Promise<StageTwoLeadInput & { id: string }> {
  const { data, error } = await client
    .from("leads")
    .select("id,name,company,email,phone,whatsapp,source,stage,estimated_value,niche,lead_score,pain_point,notes,google_maps_url,google_place_id")
    .eq("workspace_id", workspaceId)
    .eq("id", leadId)
    .single();
  throwDatabaseError("Load Stage 3 lead", error);
  if (!data) throw new Error(`Lead ${leadId} was not found in this workspace.`);
  return data as StageTwoLeadInput & { id: string };
}

async function loadFinderEvidence(
  client: SupabaseClient,
  workspaceId: string,
  lead: StageTwoLeadInput & { id: string },
): Promise<StageTwoFinderInput | null> {
  const select = "id,business_name,formatted_address,website_url,phone,rating,review_count,niche,target_problem,fit_score,problem_score,contactability_score,commercial_score,total_score,score_reason,detected_weakness,recommended_offer,suggested_next_action";
  const linked = await client
    .from("lead_finder_results")
    .select(select)
    .eq("workspace_id", workspaceId)
    .eq("lead_id", lead.id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  throwDatabaseError("Load Stage 3 Lead Finder evidence", linked.error);
  if (linked.data) return linked.data as StageTwoFinderInput;
  if (!lead.google_place_id) return null;
  const byPlace = await client
    .from("lead_finder_results")
    .select(select)
    .eq("workspace_id", workspaceId)
    .eq("provider_place_id", lead.google_place_id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  throwDatabaseError("Load Stage 3 Lead Finder evidence by place", byPlace.error);
  return (byPlace.data as StageTwoFinderInput | null) ?? null;
}

async function ensureOpportunity(
  client: SupabaseClient,
  workspaceId: string,
  actorId: string,
  leadId: string,
): Promise<OpportunityRow> {
  const existing = await client
    .from("orbit_sales_opportunities")
    .select("id,lead_id,current_state,status,next_agent_key,last_agent_id,version,context")
    .eq("workspace_id", workspaceId)
    .eq("lead_id", leadId)
    .maybeSingle();
  throwDatabaseError("Resolve Stage 3 opportunity", existing.error);
  if (existing.data) return existing.data as OpportunityRow;

  const created = await client
    .from("orbit_sales_opportunities")
    .insert({
      workspace_id: workspaceId,
      lead_id: leadId,
      current_state: "intelligence_pending",
      status: "active",
      next_agent_key: "lead_intelligence",
      context: { externalActionsEnabled: false },
      created_by: actorId,
    })
    .select("id,lead_id,current_state,status,next_agent_key,last_agent_id,version,context")
    .single();
  throwDatabaseError("Create Stage 3 opportunity", created.error);
  if (!created.data) throw new Error("Stage 3 opportunity was not returned after creation.");
  return created.data as OpportunityRow;
}

async function loadOpportunity(
  client: SupabaseClient,
  workspaceId: string,
  opportunityId: string,
): Promise<OpportunityRow> {
  const { data, error } = await client
    .from("orbit_sales_opportunities")
    .select("id,lead_id,current_state,status,next_agent_key,last_agent_id,version,context")
    .eq("workspace_id", workspaceId)
    .eq("id", opportunityId)
    .single();
  throwDatabaseError("Load Stage 3 opportunity", error);
  if (!data) throw new Error(`Opportunity ${opportunityId} was not found.`);
  return data as OpportunityRow;
}

async function transitionOpportunity(
  client: SupabaseClient,
  workspaceId: string,
  opportunity: OpportunityRow,
  patch: {
    state: StageThreeOpportunityState;
    status?: OpportunityRow["status"];
    nextAgentKey?: string | null;
    lastAgentId?: string | null;
    context?: Record<string, unknown>;
  },
) {
  const mergedContext = patch.context ? { ...opportunity.context, ...patch.context } : opportunity.context;
  const { data, error } = await client
    .from("orbit_sales_opportunities")
    .update({
      current_state: patch.state,
      status: patch.status ?? opportunity.status,
      next_agent_key: patch.nextAgentKey === undefined ? opportunity.next_agent_key : patch.nextAgentKey,
      last_agent_id: patch.lastAgentId === undefined ? opportunity.last_agent_id : patch.lastAgentId,
      context: mergedContext,
      version: opportunity.version + 1,
    })
    .eq("workspace_id", workspaceId)
    .eq("id", opportunity.id)
    .eq("version", opportunity.version)
    .select("id,lead_id,current_state,status,next_agent_key,last_agent_id,version,context")
    .single();
  throwDatabaseError("Transition Stage 3 opportunity", error);
  if (!data) throw new Error("Stage 3 opportunity changed concurrently; retry from fresh state.");
  return data as OpportunityRow;
}

async function startRunAndTask(client: SupabaseClient, workspaceId: string, runId: string, taskId: string) {
  const now = new Date().toISOString();
  const runUpdate = await client.from("orbit_agent_runs").update({ status: "running", started_at: now }).eq("workspace_id", workspaceId).eq("id", runId);
  throwDatabaseError("Start Stage 3 run", runUpdate.error);
  const taskUpdate = await client.from("orbit_agent_tasks").update({ status: "running", attempts: 1, locked_at: now }).eq("workspace_id", workspaceId).eq("id", taskId);
  throwDatabaseError("Start Stage 3 task", taskUpdate.error);
}

async function succeedRunAndTask(
  client: SupabaseClient,
  workspaceId: string,
  runId: string,
  taskId: string,
  output: Record<string, unknown>,
) {
  const now = new Date().toISOString();
  const taskUpdate = await client.from("orbit_agent_tasks").update({ status: "succeeded", output, completed_at: now }).eq("workspace_id", workspaceId).eq("id", taskId);
  throwDatabaseError("Complete Stage 3 task", taskUpdate.error);
  const runUpdate = await client.from("orbit_agent_runs").update({ status: "succeeded", output, completed_at: now }).eq("workspace_id", workspaceId).eq("id", runId);
  throwDatabaseError("Complete Stage 3 run", runUpdate.error);
}

async function failRunAndTask(
  client: SupabaseClient,
  workspaceId: string,
  runId: string | null,
  taskId: string | null,
  error: unknown,
) {
  const now = new Date().toISOString();
  const message = error instanceof Error ? error.message : "Unknown Stage 3 failure";
  if (taskId) await client.from("orbit_agent_tasks").update({ status: "failed", error: { message }, completed_at: now }).eq("workspace_id", workspaceId).eq("id", taskId);
  if (runId) await client.from("orbit_agent_runs").update({ status: "failed", error: { message }, completed_at: now }).eq("workspace_id", workspaceId).eq("id", runId);
}

async function runSpecialistStep<T extends Record<string, unknown>>(
  client: SupabaseClient,
  args: {
    workspaceId: string;
    actorId: string;
    rootRunId: string;
    rootTaskId: string;
    agentKey: string;
    capabilityKey: string;
    taskType: string;
    title: string;
    priority: number;
    input: Record<string, unknown>;
    idempotencyKey?: string;
    execute: (agentId: string, runId: string, taskId: string) => Promise<T>;
  },
): Promise<T & { runId: string; taskId: string; agentId: string }> {
  const agent = await resolveGreenAgent(client, args.workspaceId, args.agentKey, args.capabilityKey);
  const run = await createAgentRun(client, args.workspaceId, args.actorId, {
    agentKey: args.agentKey,
    parentRunId: args.rootRunId,
    triggerType: "agent",
    idempotencyKey: args.idempotencyKey,
    input: { ...args.input, externalActionsEnabled: false },
  });
  const task = await enqueueAgentTask(client, args.workspaceId, {
    runId: run.id,
    assignedAgentKey: args.agentKey,
    parentTaskId: args.rootTaskId,
    capabilityKey: args.capabilityKey,
    taskType: args.taskType,
    title: args.title,
    riskLevel: "green",
    priority: args.priority,
    input: { ...args.input, externalActionsEnabled: false },
    idempotencyKey: args.idempotencyKey ? `${args.idempotencyKey}:task` : undefined,
  });
  await startRunAndTask(client, args.workspaceId, run.id, task.id);
  await writeAgentEvent(client, {
    workspaceId: args.workspaceId,
    runId: run.id,
    taskId: task.id,
    agentId: agent.id,
    eventType: "stage3.specialist.started",
    message: `${args.agentKey} started ${args.taskType}.`,
    data: { capabilityKey: args.capabilityKey },
  });
  try {
    const output = await args.execute(agent.id, run.id, task.id);
    await succeedRunAndTask(client, args.workspaceId, run.id, task.id, output);
    await writeAgentEvent(client, {
      workspaceId: args.workspaceId,
      runId: run.id,
      taskId: task.id,
      agentId: agent.id,
      eventType: "stage3.specialist.succeeded",
      message: `${args.agentKey} completed ${args.taskType}.`,
      data: output,
    });
    return { ...output, runId: run.id, taskId: task.id, agentId: agent.id };
  } catch (error) {
    await failRunAndTask(client, args.workspaceId, run.id, task.id, error);
    throw error;
  }
}

async function createRoot(
  client: SupabaseClient,
  workspaceId: string,
  actorId: string,
  idempotencyKey: string | undefined,
  taskType: string,
  title: string,
  input: Record<string, unknown>,
) {
  const director = await resolveGreenAgent(client, workspaceId, "sales_director", "agents.delegate");
  const run = await createAgentRun(client, workspaceId, actorId, {
    agentKey: "sales_director",
    triggerType: "manual",
    idempotencyKey,
    input: { ...input, workflow: taskType, externalActionsEnabled: false },
  });
  const task = await enqueueAgentTask(client, workspaceId, {
    runId: run.id,
    assignedAgentKey: "sales_director",
    capabilityKey: "agents.delegate",
    taskType,
    title,
    riskLevel: "green",
    priority: 80,
    input: { ...input, externalActionsEnabled: false },
    idempotencyKey: idempotencyKey ? `${idempotencyKey}:director` : undefined,
  });
  await startRunAndTask(client, workspaceId, run.id, task.id);
  await writeAgentEvent(client, {
    workspaceId,
    runId: run.id,
    taskId: task.id,
    agentId: director.id,
    eventType: "stage3.director.started",
    message: `Sales Director started ${taskType}.`,
    data: input,
  });
  return { run, task, director };
}

function buildResearchPacket(
  lead: StageTwoLeadInput,
  finder: StageTwoFinderInput | null,
  intelligence: LeadIntelligenceResult,
) {
  const business = lead.company?.trim() || lead.name.trim();
  const facts = intelligence.evidence;
  const riskFlags: Array<Record<string, unknown>> = [];
  if (!lead.email && !lead.phone && !lead.whatsapp && !finder?.phone) {
    riskFlags.push({ key: "no_direct_contact", severity: "high" });
  }
  if (!intelligence.painPoint) riskFlags.push({ key: "weak_problem_evidence", severity: "medium" });
  if (!finder?.website_url) riskFlags.push({ key: "website_not_verified", severity: "low" });
  const opportunities = [
    intelligence.painPoint ? { type: "problem", value: intelligence.painPoint } : null,
    intelligence.recommendedOffer ? { type: "offer", value: intelligence.recommendedOffer } : null,
  ].filter(Boolean);
  const contactRoutes = [
    lead.email ? { channel: "email", value: lead.email } : null,
    lead.whatsapp ? { channel: "whatsapp", value: lead.whatsapp } : null,
    lead.phone || finder?.phone ? { channel: "phone", value: lead.phone ?? finder?.phone } : null,
  ].filter(Boolean);
  const confidence = Math.min(100, 35 + Math.min(facts.length, 8) * 6 + (intelligence.painPoint ? 10 : 0));
  return {
    companySummary: `${business} is an Orbit lead with ${facts.length} persisted evidence points. Stage 3 research uses only those workspace-owned facts and does not claim external enrichment.`,
    verifiedFacts: facts,
    riskFlags,
    opportunities,
    contactRoutes,
    confidence,
    status: confidence >= 50 ? ("complete" as const) : ("needs_review" as const),
  };
}

async function latestRow(
  client: SupabaseClient,
  table: string,
  workspaceId: string,
  opportunityId: string,
  select: string,
) {
  const result = await client.from(table).select(select).eq("workspace_id", workspaceId).eq("opportunity_id", opportunityId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  throwDatabaseError(`Load latest ${table}`, result.error);
  return result.data;
}

export async function prepareStageThreeOpportunity(
  client: SupabaseClient,
  workspaceId: string,
  actorId: string,
  rawInput: unknown,
) {
  const input = stageThreePrepareSchema.parse(rawInput);
  await assertFounderAuthority(client, workspaceId, actorId);
  await bootstrapStageThreeAgents(client, workspaceId, actorId);

  const rootKey = input.idempotencyKey ? `stage3:prepare:${input.idempotencyKey}` : undefined;
  const existing = await findExistingRun(client, workspaceId, rootKey);
  if (existing) return { status: existing.status, rootRunId: existing.id, reused: true, output: existing.output };

  const lead = await loadLead(client, workspaceId, input.leadId);
  const finder = await loadFinderEvidence(client, workspaceId, lead);
  let opportunity = await ensureOpportunity(client, workspaceId, actorId, lead.id);
  if (!["intelligence_pending", "intelligence_ready", "research_ready", "qualified", "review", "unqualified"].includes(opportunity.current_state)) {
    return { status: "already_prepared" as const, opportunityId: opportunity.id, state: opportunity.current_state };
  }

  const root = await createRoot(client, workspaceId, actorId, rootKey, "stage3_prepare", `Prepare full internal sales opportunity for ${lead.company ?? lead.name}`, { leadId: lead.id, opportunityId: opportunity.id });
  try {
    const intelligenceStep = await runSpecialistStep(client, {
      workspaceId,
      actorId,
      rootRunId: root.run.id,
      rootTaskId: root.task.id,
      agentKey: "lead_intelligence",
      capabilityKey: "growth.lead_intelligence",
      taskType: "lead_intelligence",
      title: `Build preliminary intelligence for ${lead.company ?? lead.name}`,
      priority: 90,
      input: { leadId: lead.id, opportunityId: opportunity.id },
      idempotencyKey: rootKey ? `${rootKey}:intelligence` : undefined,
      execute: async (agentId, runId, taskId) => {
        const intelligence = scoreLeadForStageTwo(lead, finder, { qualifiedThreshold: 60, reviewThreshold: 40 });
        const inserted = await client.from("orbit_lead_intelligence").insert({
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
          scoring_basis: { ...intelligence.scoringBasis, stage: 3, role: "preliminary_intelligence" },
          created_by: actorId,
        }).select("id").single();
        throwDatabaseError("Persist Stage 3 preliminary intelligence", inserted.error);
        if (!inserted.data) throw new Error("Stage 3 intelligence was not returned.");
        return {
          intelligenceId: inserted.data.id as string,
          totalScore: intelligence.totalScore,
          preliminaryQualification: intelligence.qualification,
          intelligence,
        };
      },
    });
    opportunity = await transitionOpportunity(client, workspaceId, opportunity, {
      state: "intelligence_ready",
      nextAgentKey: "research",
      lastAgentId: intelligenceStep.agentId,
      context: { intelligenceId: intelligenceStep.intelligenceId, preliminaryScore: intelligenceStep.totalScore },
    });

    const intelligence = intelligenceStep.intelligence as LeadIntelligenceResult;
    const researchPacket = buildResearchPacket(lead, finder, intelligence);
    const researchStep = await runSpecialistStep(client, {
      workspaceId,
      actorId,
      rootRunId: root.run.id,
      rootTaskId: root.task.id,
      agentKey: "research",
      capabilityKey: "growth.research",
      taskType: "lead_research",
      title: `Research ${lead.company ?? lead.name} from verified Orbit evidence`,
      priority: 88,
      input: { leadId: lead.id, opportunityId: opportunity.id, intelligenceId: intelligenceStep.intelligenceId },
      idempotencyKey: rootKey ? `${rootKey}:research` : undefined,
      execute: async (agentId, runId, taskId) => {
        const inserted = await client.from("orbit_lead_research").insert({
          workspace_id: workspaceId,
          opportunity_id: opportunity.id,
          lead_id: lead.id,
          intelligence_id: intelligenceStep.intelligenceId,
          run_id: runId,
          task_id: taskId,
          agent_id: agentId,
          company_summary: researchPacket.companySummary,
          verified_facts: researchPacket.verifiedFacts,
          risk_flags: researchPacket.riskFlags,
          opportunities: researchPacket.opportunities,
          contact_routes: researchPacket.contactRoutes,
          confidence: researchPacket.confidence,
          status: researchPacket.status,
          created_by: actorId,
        }).select("id").single();
        throwDatabaseError("Persist Stage 3 research", inserted.error);
        if (!inserted.data) throw new Error("Stage 3 research packet was not returned.");
        return { researchId: inserted.data.id as string, confidence: researchPacket.confidence, status: researchPacket.status };
      },
    }) as ResearchResult & { runId: string; taskId: string; agentId: string };
    opportunity = await transitionOpportunity(client, workspaceId, opportunity, {
      state: "research_ready",
      nextAgentKey: "qualification",
      lastAgentId: researchStep.agentId,
      context: { researchId: researchStep.researchId, researchConfidence: researchStep.confidence },
    });

    const qualificationStep = await runSpecialistStep(client, {
      workspaceId,
      actorId,
      rootRunId: root.run.id,
      rootTaskId: root.task.id,
      agentKey: "qualification",
      capabilityKey: "growth.qualify",
      taskType: "final_qualification",
      title: `Finalize qualification for ${lead.company ?? lead.name}`,
      priority: 86,
      input: { opportunityId: opportunity.id, intelligenceId: intelligenceStep.intelligenceId, researchId: researchStep.researchId },
      idempotencyKey: rootKey ? `${rootKey}:qualification` : undefined,
      execute: async (agentId, runId, taskId) => {
        const decision: QualificationResult["decision"] =
          intelligence.totalScore >= 60 && researchStep.confidence >= 50
            ? "qualified"
            : intelligence.totalScore >= 40
              ? "review"
              : "unqualified";
        const reason = `Final Stage 3 decision uses preliminary score ${intelligence.totalScore}/100 and research confidence ${researchStep.confidence}/100. Decision: ${decision}.`;
        const inserted = await client.from("orbit_qualifications").insert({
          workspace_id: workspaceId,
          opportunity_id: opportunity.id,
          lead_id: lead.id,
          intelligence_id: intelligenceStep.intelligenceId,
          research_id: researchStep.researchId,
          run_id: runId,
          task_id: taskId,
          agent_id: agentId,
          total_score: intelligence.totalScore,
          decision,
          reason,
          recommended_offer: intelligence.recommendedOffer,
          recommended_channel: intelligence.recommendedChannel,
          next_state: decision,
          created_by: actorId,
        }).select("id").single();
        throwDatabaseError("Persist Stage 3 qualification", inserted.error);
        if (!inserted.data) throw new Error("Stage 3 qualification was not returned.");
        return {
          qualificationId: inserted.data.id as string,
          decision,
          totalScore: intelligence.totalScore,
          recommendedOffer: intelligence.recommendedOffer,
          recommendedChannel: intelligence.recommendedChannel,
        };
      },
    }) as QualificationResult & { runId: string; taskId: string; agentId: string };

    const leadStage = qualificationStep.decision === "qualified" ? "qualified" : "scored";
    const leadUpdate = await client.from("leads").update({
      stage: ["raw", "new", "scored", "qualified"].includes(lead.stage) ? leadStage : lead.stage,
      lead_score: qualificationStep.totalScore,
      next_action:
        qualificationStep.decision === "qualified"
          ? "Prepare internal outreach and follow-up plan."
          : qualificationStep.decision === "review"
            ? "Collect stronger evidence or review qualification."
            : "Keep out of active outreach.",
    }).eq("workspace_id", workspaceId).eq("id", lead.id);
    throwDatabaseError("Sync Stage 3 qualification to lead", leadUpdate.error);

    opportunity = await transitionOpportunity(client, workspaceId, opportunity, {
      state: qualificationStep.decision,
      nextAgentKey: qualificationStep.decision === "qualified" ? "outreach" : null,
      lastAgentId: qualificationStep.agentId,
      status: qualificationStep.decision === "unqualified" ? "lost" : "active",
      context: {
        qualificationId: qualificationStep.qualificationId,
        finalScore: qualificationStep.totalScore,
        recommendedOffer: qualificationStep.recommendedOffer,
        recommendedChannel: qualificationStep.recommendedChannel,
      },
    });

    if (qualificationStep.decision !== "qualified") {
      const output = {
        decision: qualificationStep.decision,
        opportunityId: opportunity.id,
        state: opportunity.current_state,
        intelligenceId: intelligenceStep.intelligenceId,
        researchId: researchStep.researchId,
        qualificationId: qualificationStep.qualificationId,
        externalActionExecuted: false,
      };
      await succeedRunAndTask(client, workspaceId, root.run.id, root.task.id, output);
      return { status: "succeeded" as const, rootRunId: root.run.id, rootTaskId: root.task.id, ...output };
    }

    const outreachStep = await runSpecialistStep(client, {
      workspaceId,
      actorId,
      rootRunId: root.run.id,
      rootTaskId: root.task.id,
      agentKey: "outreach",
      capabilityKey: "growth.outreach_draft",
      taskType: "outreach_draft",
      title: `Draft outreach for ${lead.company ?? lead.name}`,
      priority: 82,
      input: { opportunityId: opportunity.id, leadId: lead.id, intelligenceId: intelligenceStep.intelligenceId },
      idempotencyKey: rootKey ? `${rootKey}:outreach` : undefined,
      execute: async (agentId, runId, taskId) => {
        const draft = await createStageTwoOutreachDraft(lead, intelligence);
        const inserted = await client.from("orbit_outreach_drafts").insert({
          workspace_id: workspaceId,
          lead_id: lead.id,
          intelligence_id: intelligenceStep.intelligenceId,
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
        }).select("id").single();
        throwDatabaseError("Persist Stage 3 outreach draft", inserted.error);
        if (!inserted.data) throw new Error("Stage 3 outreach draft was not returned.");
        return { draftId: inserted.data.id as string, channel: draft.channel, externalSendEnabled: false };
      },
    });
    opportunity = await transitionOpportunity(client, workspaceId, opportunity, {
      state: "outreach_drafted",
      nextAgentKey: "follow_up",
      lastAgentId: outreachStep.agentId,
      context: { outreachDraftId: outreachStep.draftId },
    });

    const followupStep = await runSpecialistStep(client, {
      workspaceId,
      actorId,
      rootRunId: root.run.id,
      rootTaskId: root.task.id,
      agentKey: "follow_up",
      capabilityKey: "growth.followup_plan",
      taskType: "followup_plan",
      title: `Prepare follow-up plan for ${lead.company ?? lead.name}`,
      priority: 78,
      input: { opportunityId: opportunity.id, outreachDraftId: outreachStep.draftId },
      idempotencyKey: rootKey ? `${rootKey}:followup` : undefined,
      execute: async (agentId, runId, taskId) => {
        const sequence = [
          { touch: 1, delayHours: 24, purpose: "Useful reminder", stopOnReply: true },
          { touch: 2, delayHours: 72, purpose: "Add one concrete value point", stopOnReply: true },
          { touch: 3, delayHours: 168, purpose: "Close the loop respectfully", stopOnReply: true, finalTouch: true },
        ];
        const inserted = await client.from("orbit_followup_plans").insert({
          workspace_id: workspaceId,
          opportunity_id: opportunity.id,
          lead_id: lead.id,
          outreach_draft_id: outreachStep.draftId,
          run_id: runId,
          task_id: taskId,
          agent_id: agentId,
          channel: outreachStep.channel,
          sequence,
          status: "ready",
          external_send_enabled: false,
          created_by: actorId,
        }).select("id").single();
        throwDatabaseError("Persist Stage 3 follow-up plan", inserted.error);
        if (!inserted.data) throw new Error("Stage 3 follow-up plan was not returned.");
        return { followupPlanId: inserted.data.id as string, externalSendEnabled: false };
      },
    });
    opportunity = await transitionOpportunity(client, workspaceId, opportunity, {
      state: "waiting_reply",
      nextAgentKey: "sales",
      lastAgentId: followupStep.agentId,
      context: { followupPlanId: followupStep.followupPlanId },
    });

    const output = {
      decision: "prepared_waiting_external_reply",
      opportunityId: opportunity.id,
      state: opportunity.current_state,
      intelligenceId: intelligenceStep.intelligenceId,
      researchId: researchStep.researchId,
      qualificationId: qualificationStep.qualificationId,
      outreachDraftId: outreachStep.draftId,
      followupPlanId: followupStep.followupPlanId,
      externalActionExecuted: false,
    };
    await succeedRunAndTask(client, workspaceId, root.run.id, root.task.id, output);
    return { status: "succeeded" as const, rootRunId: root.run.id, rootTaskId: root.task.id, ...output };
  } catch (error) {
    await failRunAndTask(client, workspaceId, root.run.id, root.task.id, error);
    throw error;
  }
}

export async function advanceStageThreeOpportunity(
  client: SupabaseClient,
  workspaceId: string,
  actorId: string,
  rawInput: unknown,
) {
  const input = stageThreeAdvanceSchema.parse(rawInput);
  await assertFounderAuthority(client, workspaceId, actorId);
  await bootstrapStageThreeAgents(client, workspaceId, actorId);
  let opportunity = await loadOpportunity(client, workspaceId, input.opportunityId);
  assertStageThreeEventAllowed(opportunity.current_state, input.event);

  const rootKey = input.idempotencyKey ? `stage3:advance:${input.idempotencyKey}` : undefined;
  const existing = await findExistingRun(client, workspaceId, rootKey);
  if (existing) return { status: existing.status, rootRunId: existing.id, reused: true, output: existing.output };

  const lead = await loadLead(client, workspaceId, opportunity.lead_id);
  const root = await createRoot(client, workspaceId, actorId, rootKey, "stage3_advance", `Advance ${lead.company ?? lead.name} with event ${input.event}`, { opportunityId: opportunity.id, event: input.event });
  try {
    if (input.event === "lead_lost") {
      const leadUpdate = await client.from("leads").update({ stage: "lost", next_action: "Closed lost; preserve history and stop outreach." }).eq("workspace_id", workspaceId).eq("id", lead.id);
      throwDatabaseError("Close Stage 3 lead lost", leadUpdate.error);
      opportunity = await transitionOpportunity(client, workspaceId, opportunity, { state: "closed_lost", status: "lost", nextAgentKey: null, context: { lostAt: new Date().toISOString() } });
      const output = { opportunityId: opportunity.id, state: opportunity.current_state, decision: "closed_lost", externalActionExecuted: false };
      await succeedRunAndTask(client, workspaceId, root.run.id, root.task.id, output);
      return { status: "succeeded" as const, rootRunId: root.run.id, ...output };
    }

    if (input.event === "reply_interested" || input.event === "reply_objection") {
      const salesStep = await runSpecialistStep(client, {
        workspaceId,
        actorId,
        rootRunId: root.run.id,
        rootTaskId: root.task.id,
        agentKey: "sales",
        capabilityKey: "growth.sales_reason",
        taskType: "sales_signal",
        title: `Interpret inbound sales signal from ${lead.company ?? lead.name}`,
        priority: 90,
        input: { opportunityId: opportunity.id, event: input.event, responseText: input.responseText, objections: input.objections },
        idempotencyKey: rootKey ? `${rootKey}:sales` : undefined,
        execute: async (agentId, runId, taskId) => {
          const interested = input.event === "reply_interested";
          const recommendedResponse = interested
            ? "Acknowledge the interest, clarify the desired outcome, and move toward a scoped proposal only after requirements are clear."
            : "Address the stated objection using verified facts, avoid pressure, and keep the next step optional and specific.";
          const inserted = await client.from("orbit_sales_guidance").insert({
            workspace_id: workspaceId,
            opportunity_id: opportunity.id,
            lead_id: lead.id,
            run_id: runId,
            task_id: taskId,
            agent_id: agentId,
            buying_signal: input.responseText,
            objections: input.objections,
            recommended_response: recommendedResponse,
            recommended_next_state: "engaged",
            confidence: interested ? 90 : 75,
            created_by: actorId,
          }).select("id").single();
          throwDatabaseError("Persist Stage 3 sales guidance", inserted.error);
          if (!inserted.data) throw new Error("Stage 3 sales guidance was not returned.");
          return { guidanceId: inserted.data.id as string, recommendedNextState: "engaged", externalActionExecuted: false };
        },
      });
      opportunity = await transitionOpportunity(client, workspaceId, opportunity, { state: "engaged", nextAgentKey: "proposal", lastAgentId: salesStep.agentId, context: { salesGuidanceId: salesStep.guidanceId } });
      const leadUpdate = await client.from("leads").update({ stage: "interested", next_action: "Clarify requirements and prepare proposal only with approved pricing inputs." }).eq("workspace_id", workspaceId).eq("id", lead.id);
      throwDatabaseError("Sync engaged Stage 3 lead", leadUpdate.error);
      const output = { opportunityId: opportunity.id, state: opportunity.current_state, guidanceId: salesStep.guidanceId, externalActionExecuted: false };
      await succeedRunAndTask(client, workspaceId, root.run.id, root.task.id, output);
      return { status: "succeeded" as const, rootRunId: root.run.id, ...output };
    }

    if (input.event === "proposal_requested") {
      const proposalStep = await runSpecialistStep(client, {
        workspaceId,
        actorId,
        rootRunId: root.run.id,
        rootTaskId: root.task.id,
        agentKey: "proposal",
        capabilityKey: "growth.proposal_draft",
        taskType: "proposal_draft",
        title: `Prepare internal proposal for ${lead.company ?? lead.name}`,
        priority: 92,
        input: { opportunityId: opportunity.id, priceMin: input.priceMin, priceMax: input.priceMax, currency: input.currency },
        idempotencyKey: rootKey ? `${rootKey}:proposal` : undefined,
        execute: async (agentId, runId, taskId) => {
          const recommendedOffer = typeof opportunity.context.recommendedOffer === "string" ? opportunity.context.recommendedOffer : "Approved solution scope";
          const inserted = await client.from("orbit_proposal_drafts").insert({
            workspace_id: workspaceId,
            opportunity_id: opportunity.id,
            lead_id: lead.id,
            run_id: runId,
            task_id: taskId,
            agent_id: agentId,
            title: `Proposal for ${lead.company ?? lead.name}`,
            scope: [{ item: recommendedOffer, source: "qualification" }],
            price_min: input.priceMin,
            price_max: input.priceMax,
            currency: input.currency,
            assumptions: [{ key: "pricing", value: "Explicit approved bounds supplied to Stage 3" }],
            status: "draft",
            external_send_enabled: false,
            created_by: actorId,
          }).select("id").single();
          throwDatabaseError("Persist Stage 3 proposal", inserted.error);
          if (!inserted.data) throw new Error("Stage 3 proposal was not returned.");
          return { proposalId: inserted.data.id as string, externalSendEnabled: false };
        },
      });
      opportunity = await transitionOpportunity(client, workspaceId, opportunity, { state: "proposal_drafted", nextAgentKey: "payment_onboarding", lastAgentId: proposalStep.agentId, context: { proposalId: proposalStep.proposalId } });
      const leadUpdate = await client.from("leads").update({ stage: "proposal", next_action: "Review proposal; external sending remains disabled in Stage 3." }).eq("workspace_id", workspaceId).eq("id", lead.id);
      throwDatabaseError("Sync Stage 3 proposal lead", leadUpdate.error);
      const output = { opportunityId: opportunity.id, state: opportunity.current_state, proposalId: proposalStep.proposalId, externalActionExecuted: false };
      await succeedRunAndTask(client, workspaceId, root.run.id, root.task.id, output);
      return { status: "succeeded" as const, rootRunId: root.run.id, ...output };
    }

    if (input.event === "proposal_accepted") {
      const proposal = await latestRow(client, "orbit_proposal_drafts", workspaceId, opportunity.id, "id,status");
      if (!proposal) throw new Error("Proposal acceptance requires an existing Stage 3 proposal draft.");
      const onboardingStep = await runSpecialistStep(client, {
        workspaceId,
        actorId,
        rootRunId: root.run.id,
        rootTaskId: root.task.id,
        agentKey: "payment_onboarding",
        capabilityKey: "cash.payment_prepare",
        taskType: "payment_onboarding_prepare",
        title: `Prepare payment/onboarding case for ${lead.company ?? lead.name}`,
        priority: 94,
        input: { opportunityId: opportunity.id, proposalId: proposal.id },
        idempotencyKey: rootKey ? `${rootKey}:onboarding` : undefined,
        execute: async (agentId, runId, taskId) => {
          const requirements = [
            { key: "billing_identity", status: "needed" },
            { key: "primary_project_contact", status: "needed" },
            { key: "delivery_inputs", status: "needed" },
          ];
          const inserted = await client.from("orbit_onboarding_cases").insert({
            workspace_id: workspaceId,
            opportunity_id: opportunity.id,
            lead_id: lead.id,
            proposal_id: proposal.id,
            run_id: runId,
            task_id: taskId,
            agent_id: agentId,
            payment_status: "pending",
            onboarding_status: "draft",
            requirements,
            external_payment_action_enabled: false,
            created_by: actorId,
          }).select("id").single();
          throwDatabaseError("Persist Stage 3 onboarding case", inserted.error);
          if (!inserted.data) throw new Error("Stage 3 onboarding case was not returned.");
          return { onboardingId: inserted.data.id as string, externalPaymentActionEnabled: false };
        },
      });
      opportunity = await transitionOpportunity(client, workspaceId, opportunity, { state: "payment_pending", nextAgentKey: "payment_onboarding", lastAgentId: onboardingStep.agentId, context: { onboardingId: onboardingStep.onboardingId } });
      const output = { opportunityId: opportunity.id, state: opportunity.current_state, onboardingId: onboardingStep.onboardingId, externalActionExecuted: false };
      await succeedRunAndTask(client, workspaceId, root.run.id, root.task.id, output);
      return { status: "succeeded" as const, rootRunId: root.run.id, ...output };
    }

    if (input.event === "payment_confirmed") {
      const onboarding = await latestRow(client, "orbit_onboarding_cases", workspaceId, opportunity.id, "id,payment_status,onboarding_status");
      if (!onboarding) throw new Error("Payment confirmation requires an existing onboarding case.");
      const onboardingUpdate = await client.from("orbit_onboarding_cases").update({ payment_status: "confirmed_external", onboarding_status: "ready", payment_reference: input.paymentReference }).eq("workspace_id", workspaceId).eq("id", onboarding.id);
      throwDatabaseError("Record Stage 3 external payment confirmation", onboardingUpdate.error);
      opportunity = await transitionOpportunity(client, workspaceId, opportunity, { state: "payment_confirmed", nextAgentKey: "delivery_handoff", context: { paymentReference: input.paymentReference } });

      const handoffStep = await runSpecialistStep(client, {
        workspaceId,
        actorId,
        rootRunId: root.run.id,
        rootTaskId: root.task.id,
        agentKey: "delivery_handoff",
        capabilityKey: "delivery.handoff_prepare",
        taskType: "delivery_handoff",
        title: `Prepare delivery handoff for ${lead.company ?? lead.name}`,
        priority: 96,
        input: { opportunityId: opportunity.id, onboardingId: onboarding.id, capacityStatus: input.capacityStatus },
        idempotencyKey: rootKey ? `${rootKey}:handoff` : undefined,
        execute: async (agentId, runId, taskId) => {
          const inserted = await client.from("orbit_delivery_handoffs").insert({
            workspace_id: workspaceId,
            opportunity_id: opportunity.id,
            lead_id: lead.id,
            onboarding_id: onboarding.id,
            run_id: runId,
            task_id: taskId,
            agent_id: agentId,
            brief: input.deliveryBrief ?? { source: "stage3", note: "Delivery brief requires Studio review before activation." },
            capacity_status: input.capacityStatus,
            status: input.capacityStatus === "blocked" ? "rejected" : "ready",
            external_commitment_enabled: false,
            created_by: actorId,
          }).select("id").single();
          throwDatabaseError("Persist Stage 3 delivery handoff", inserted.error);
          if (!inserted.data) throw new Error("Stage 3 delivery handoff was not returned.");
          return { handoffId: inserted.data.id as string, capacityStatus: input.capacityStatus!, externalCommitmentEnabled: false };
        },
      });
      opportunity = await transitionOpportunity(client, workspaceId, opportunity, {
        state: input.capacityStatus === "blocked" ? "blocked" : "handoff_ready",
        status: input.capacityStatus === "blocked" ? "blocked" : "won",
        nextAgentKey: input.capacityStatus === "blocked" ? null : "proof_referral",
        lastAgentId: handoffStep.agentId,
        context: { handoffId: handoffStep.handoffId, capacityStatus: input.capacityStatus },
      });
      const leadUpdate = await client.from("leads").update({ stage: "won", next_action: input.capacityStatus === "blocked" ? "Resolve delivery capacity before any activation." : "Studio must review and activate delivery outside Stage 3." }).eq("workspace_id", workspaceId).eq("id", lead.id);
      throwDatabaseError("Sync Stage 3 won lead", leadUpdate.error);
      const output = { opportunityId: opportunity.id, state: opportunity.current_state, handoffId: handoffStep.handoffId, externalActionExecuted: false };
      await succeedRunAndTask(client, workspaceId, root.run.id, root.task.id, output);
      return { status: "succeeded" as const, rootRunId: root.run.id, ...output };
    }

    if (input.event === "delivery_completed") {
      const handoff = await latestRow(client, "orbit_delivery_handoffs", workspaceId, opportunity.id, "id,project_id,status");
      if (!handoff) throw new Error("Delivery completion requires an existing Stage 3 handoff.");
      opportunity = await transitionOpportunity(client, workspaceId, opportunity, { state: "delivery_completed", nextAgentKey: "proof_referral" });
      const proofStep = await runSpecialistStep(client, {
        workspaceId,
        actorId,
        rootRunId: root.run.id,
        rootTaskId: root.task.id,
        agentKey: "proof_referral",
        capabilityKey: "proof.prepare",
        taskType: "proof_referral_plan",
        title: `Prepare private proof/referral plan for ${lead.company ?? lead.name}`,
        priority: 88,
        input: { opportunityId: opportunity.id, handoffId: handoff.id, resultSummary: input.resultSummary },
        idempotencyKey: rootKey ? `${rootKey}:proof` : undefined,
        execute: async (agentId, runId, taskId) => {
          const inserted = await client.from("orbit_proof_referral_plans").insert({
            workspace_id: workspaceId,
            opportunity_id: opportunity.id,
            lead_id: lead.id,
            handoff_id: handoff.id,
            run_id: runId,
            task_id: taskId,
            agent_id: agentId,
            project_id: handoff.project_id ?? null,
            result_summary: input.resultSummary,
            proof_permission_scope: "private",
            referral_plan: { status: "not_requested", rule: "Only request after explicit permission and Stage 4 authority." },
            status: "draft",
            proof_publish_enabled: false,
            referral_request_enabled: false,
            created_by: actorId,
          }).select("id").single();
          throwDatabaseError("Persist Stage 3 proof/referral plan", inserted.error);
          if (!inserted.data) throw new Error("Stage 3 proof/referral plan was not returned.");
          return { planId: inserted.data.id as string, proofPublishEnabled: false, referralRequestEnabled: false };
        },
      });
      opportunity = await transitionOpportunity(client, workspaceId, opportunity, { state: "proof_ready", nextAgentKey: "proof_referral", lastAgentId: proofStep.agentId, context: { proofReferralPlanId: proofStep.planId } });
      const output = { opportunityId: opportunity.id, state: opportunity.current_state, proofReferralPlanId: proofStep.planId, externalActionExecuted: false };
      await succeedRunAndTask(client, workspaceId, root.run.id, root.task.id, output);
      return { status: "succeeded" as const, rootRunId: root.run.id, ...output };
    }

    if (input.event === "proof_permission_granted") {
      const plan = await latestRow(client, "orbit_proof_referral_plans", workspaceId, opportunity.id, "id,status,proof_permission_scope");
      if (!plan) throw new Error("Proof permission requires an existing proof/referral plan.");
      const planUpdate = await client.from("orbit_proof_referral_plans").update({
        proof_permission_scope: input.proofPermissionScope,
        status: "ready",
        proof_publish_enabled: false,
        referral_request_enabled: false,
      }).eq("workspace_id", workspaceId).eq("id", plan.id);
      throwDatabaseError("Record Stage 3 proof permission", planUpdate.error);
      opportunity = await transitionOpportunity(client, workspaceId, opportunity, { state: "referral_ready", status: "completed", nextAgentKey: null, context: { proofPermissionScope: input.proofPermissionScope } });
      const output = { opportunityId: opportunity.id, state: opportunity.current_state, proofReferralPlanId: plan.id, proofPermissionScope: input.proofPermissionScope, proofPublished: false, referralSent: false, externalActionExecuted: false };
      await succeedRunAndTask(client, workspaceId, root.run.id, root.task.id, output);
      return { status: "succeeded" as const, rootRunId: root.run.id, ...output };
    }

    throw new Error(`Unhandled Stage 3 event: ${input.event}`);
  } catch (error) {
    await failRunAndTask(client, workspaceId, root.run.id, root.task.id, error);
    throw error;
  }
}
