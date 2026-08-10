import type { SupabaseClient } from "@supabase/supabase-js";
import {
  agentRunRequestSchema,
  agentTaskRequestSchema,
  type OrbitAgentDefinition,
  validateAgentDefinition,
} from "@/lib/agents/contracts";

type AgentRow = {
  id: string;
};

function throwDatabaseError(operation: string, error: { message: string } | null) {
  if (error) {
    throw new Error(`${operation}: ${error.message}`);
  }
}

export async function registerAgentDefinition(
  client: SupabaseClient,
  workspaceId: string,
  actorId: string,
  input: OrbitAgentDefinition,
) {
  const definition = validateAgentDefinition(input);

  let supervisorAgentId: string | null = null;
  if (definition.supervisorKey) {
    const { data, error } = await client
      .from("orbit_agents")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("agent_key", definition.supervisorKey)
      .single();

    throwDatabaseError("Resolve supervisor agent", error);
    supervisorAgentId = (data as AgentRow).id;
  }

  const { data: agent, error: agentError } = await client
    .from("orbit_agents")
    .upsert(
      {
        workspace_id: workspaceId,
        supervisor_agent_id: supervisorAgentId,
        agent_key: definition.key,
        name: definition.name,
        kind: definition.kind,
        status: definition.status,
        mission: definition.mission,
        instructions: definition.instructions,
        model_provider: definition.model?.provider ?? null,
        model_name: definition.model?.name ?? null,
        input_schema: definition.inputSchema,
        output_schema: definition.outputSchema,
        config: {
          ...definition.config,
          tools: definition.tools,
        },
        created_by: actorId,
      },
      { onConflict: "workspace_id,agent_key" },
    )
    .select("id")
    .single();

  throwDatabaseError("Register agent", agentError);
  const agentId = (agent as AgentRow).id;

  for (const capability of definition.capabilities) {
    const { error } = await client.from("orbit_agent_permissions").upsert(
      {
        workspace_id: workspaceId,
        agent_id: agentId,
        capability_key: capability.key,
        effect: capability.effect,
        authority_level: capability.authority,
        conditions: capability.conditions,
        created_by: actorId,
      },
      { onConflict: "workspace_id,agent_id,capability_key" },
    );

    throwDatabaseError(`Register capability ${capability.key}`, error);
  }

  return { agentId, definition };
}

export async function createAgentRun(
  client: SupabaseClient,
  workspaceId: string,
  actorId: string,
  rawRequest: unknown,
) {
  const request = agentRunRequestSchema.parse(rawRequest);

  const { data: agent, error: agentError } = await client
    .from("orbit_agents")
    .select("id,status")
    .eq("workspace_id", workspaceId)
    .eq("agent_key", request.agentKey)
    .single();

  throwDatabaseError("Resolve run agent", agentError);
  if (agent.status !== "active") {
    throw new Error(`Agent ${request.agentKey} is not active.`);
  }

  const { data: run, error: runError } = await client
    .from("orbit_agent_runs")
    .insert({
      workspace_id: workspaceId,
      agent_id: agent.id,
      parent_run_id: request.parentRunId ?? null,
      trigger_type: request.triggerType,
      status: "queued",
      input: request.input,
      idempotency_key: request.idempotencyKey ?? null,
      created_by: actorId,
    })
    .select("*")
    .single();

  throwDatabaseError("Create agent run", runError);
  return run;
}

export async function enqueueAgentTask(
  client: SupabaseClient,
  workspaceId: string,
  rawRequest: unknown,
) {
  const request = agentTaskRequestSchema.parse(rawRequest);

  const { data: agent, error: agentError } = await client
    .from("orbit_agents")
    .select("id,status")
    .eq("workspace_id", workspaceId)
    .eq("agent_key", request.assignedAgentKey)
    .single();

  throwDatabaseError("Resolve task agent", agentError);
  if (agent.status !== "active") {
    throw new Error(`Agent ${request.assignedAgentKey} is not active.`);
  }

  const { data: task, error: taskError } = await client
    .from("orbit_agent_tasks")
    .insert({
      workspace_id: workspaceId,
      run_id: request.runId,
      assigned_agent_id: agent.id,
      parent_task_id: request.parentTaskId ?? null,
      capability_key: request.capabilityKey,
      task_type: request.taskType,
      title: request.title,
      status: request.riskLevel === "green" ? "queued" : "waiting_approval",
      risk_level: request.riskLevel,
      priority: request.priority,
      input: request.input,
      idempotency_key: request.idempotencyKey ?? null,
    })
    .select("*")
    .single();

  throwDatabaseError("Enqueue agent task", taskError);
  return task;
}

export async function writeAgentEvent(
  client: SupabaseClient,
  event: {
    workspaceId: string;
    runId: string;
    taskId?: string | null;
    agentId: string;
    level?: "debug" | "info" | "warn" | "error";
    eventType: string;
    message: string;
    data?: Record<string, unknown>;
  },
) {
  const { error } = await client.from("orbit_agent_events").insert({
    workspace_id: event.workspaceId,
    run_id: event.runId,
    task_id: event.taskId ?? null,
    agent_id: event.agentId,
    level: event.level ?? "info",
    event_type: event.eventType,
    message: event.message,
    data: event.data ?? {},
  });

  throwDatabaseError("Write agent event", error);
}
