import type { SupabaseClient } from "@supabase/supabase-js";
import { stageOneAgentCatalog } from "@/lib/agents/catalog";
import {
  agentApprovalDecisionSchema,
  approvalRouteForAuthority,
  founderCommandDryRunSchema,
  type AgentApprovalRoute,
  type AgentAuthorityLevel,
} from "@/lib/agents/contracts";
import {
  createAgentRun,
  enqueueAgentTask,
  registerAgentDefinition,
  writeAgentEvent,
} from "@/lib/agents/store";

type RuntimeAgentRow = {
  id: string;
  status: string;
  supervisor_agent_id: string | null;
};

type PermissionRow = {
  effect: "allow" | "deny";
  authority_level: AgentAuthorityLevel;
  conditions: Record<string, unknown>;
};

type ApprovalRow = {
  id: string;
  run_id: string;
  task_id: string;
  requested_by_agent_id: string;
  authority_level: "amber" | "red";
  approval_route: "supervisor" | "founder";
  status: "pending" | "approved" | "rejected" | "expired" | "cancelled";
};

function throwDatabaseError(operation: string, error: { message: string } | null) {
  if (error) {
    throw new Error(`${operation}: ${error.message}`);
  }
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

  throwDatabaseError("Resolve founder authority", error);
  if (!data || !["owner", "admin", "founder"].includes(data.role)) {
    throw new Error("Founder or workspace-admin authority is required.");
  }
}

async function resolveAgentAndPermission(
  client: SupabaseClient,
  workspaceId: string,
  agentKey: string,
  capabilityKey: string,
) {
  const { data: agent, error: agentError } = await client
    .from("orbit_agents")
    .select("id,status,supervisor_agent_id")
    .eq("workspace_id", workspaceId)
    .eq("agent_key", agentKey)
    .single();

  throwDatabaseError("Resolve runtime agent", agentError);
  const runtimeAgent = agent as RuntimeAgentRow;
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

  throwDatabaseError(`Resolve permission ${capabilityKey}`, permissionError);
  const runtimePermission = permission as PermissionRow;
  if (runtimePermission.effect !== "allow") {
    throw new Error(`Agent ${agentKey} is denied capability ${capabilityKey}.`);
  }

  return { agent: runtimeAgent, permission: runtimePermission };
}

function approvalRoute(
  authority: AgentAuthorityLevel,
  agent: RuntimeAgentRow,
): AgentApprovalRoute {
  const defaultRoute = approvalRouteForAuthority[authority];
  if (defaultRoute === "supervisor" && !agent.supervisor_agent_id) {
    return "founder";
  }
  return defaultRoute;
}

async function markRunFailed(
  client: SupabaseClient,
  workspaceId: string,
  runId: string,
  error: unknown,
) {
  const message = error instanceof Error ? error.message : "Unknown runtime failure";
  await client
    .from("orbit_agent_runs")
    .update({
      status: "failed",
      error: { message },
      completed_at: new Date().toISOString(),
    })
    .eq("workspace_id", workspaceId)
    .eq("id", runId);
}

export async function bootstrapStageOneAgents(
  client: SupabaseClient,
  workspaceId: string,
  actorId: string,
) {
  await assertFounderAuthority(client, workspaceId, actorId);

  const registered = [];
  for (const definition of stageOneAgentCatalog) {
    registered.push(
      await registerAgentDefinition(client, workspaceId, actorId, definition),
    );
  }
  return registered;
}

export async function runFounderCommandDryRun(
  client: SupabaseClient,
  workspaceId: string,
  actorId: string,
  rawInput: unknown,
) {
  const input = founderCommandDryRunSchema.parse(rawInput);
  await assertFounderAuthority(client, workspaceId, actorId);
  await bootstrapStageOneAgents(client, workspaceId, actorId);

  const run = await createAgentRun(client, workspaceId, actorId, {
    agentKey: "sales_director",
    triggerType: "manual",
    idempotencyKey: input.idempotencyKey,
    input: {
      command: input.command,
      requestedCapability: input.capabilityKey,
      executionMode: "dry_run",
      externalActionsEnabled: false,
    },
  });

  try {
    const { agent, permission } = await resolveAgentAndPermission(
      client,
      workspaceId,
      "sales_director",
      input.capabilityKey,
    );

    const { error: runStartError } = await client
      .from("orbit_agent_runs")
      .update({ status: "running", started_at: new Date().toISOString() })
      .eq("workspace_id", workspaceId)
      .eq("id", run.id);
    throwDatabaseError("Start agent run", runStartError);

    await writeAgentEvent(client, {
      workspaceId,
      runId: run.id,
      agentId: agent.id,
      eventType: "run.started",
      message: "Founder command entered the Stage 1 dry-run controller.",
      data: {
        capabilityKey: input.capabilityKey,
        authority: permission.authority_level,
      },
    });

    const task = await enqueueAgentTask(client, workspaceId, {
      runId: run.id,
      assignedAgentKey: "sales_director",
      capabilityKey: input.capabilityKey,
      taskType: "founder_command",
      title: `Dry-run founder command: ${input.command.slice(0, 120)}`,
      riskLevel: permission.authority_level,
      priority: input.priority,
      input: {
        command: input.command,
        permissionConditions: permission.conditions,
        executionMode: "dry_run",
      },
      idempotencyKey: input.idempotencyKey
        ? `${input.idempotencyKey}:sales-director`
        : undefined,
    });

    await writeAgentEvent(client, {
      workspaceId,
      runId: run.id,
      taskId: task.id,
      agentId: agent.id,
      eventType: "permission.checked",
      message: `Capability ${input.capabilityKey} allowed at ${permission.authority_level} authority.`,
      data: { capabilityKey: input.capabilityKey, effect: permission.effect },
    });

    const route = approvalRoute(permission.authority_level, agent);
    if (route === "auto") {
      const completedAt = new Date().toISOString();
      const result = {
        decision: "allowed_dry_run",
        command: input.command,
        capabilityKey: input.capabilityKey,
        authority: permission.authority_level,
        externalActionExecuted: false,
      };

      const { error: taskError } = await client
        .from("orbit_agent_tasks")
        .update({
          status: "succeeded",
          attempts: 1,
          output: result,
          locked_at: completedAt,
          completed_at: completedAt,
        })
        .eq("workspace_id", workspaceId)
        .eq("id", task.id);
      throwDatabaseError("Complete green agent task", taskError);

      const { error: runError } = await client
        .from("orbit_agent_runs")
        .update({ status: "succeeded", output: result, completed_at: completedAt })
        .eq("workspace_id", workspaceId)
        .eq("id", run.id);
      throwDatabaseError("Complete green agent run", runError);

      await writeAgentEvent(client, {
        workspaceId,
        runId: run.id,
        taskId: task.id,
        agentId: agent.id,
        eventType: "task.succeeded",
        message: "Green-authority task completed in dry-run mode.",
        data: result,
      });

      return { status: "succeeded" as const, runId: run.id, taskId: task.id, result };
    }

    const approvalAuthority = permission.authority_level === "red" ? "red" : "amber";
    const { data: approval, error: approvalError } = await client
      .from("orbit_agent_approvals")
      .insert({
        workspace_id: workspaceId,
        run_id: run.id,
        task_id: task.id,
        requested_by_agent_id: agent.id,
        authority_level: approvalAuthority,
        approval_route: route,
        proposed_action: `dry_run:${input.capabilityKey}`,
        proposed_payload: {
          command: input.command,
          capabilityKey: input.capabilityKey,
          authority: permission.authority_level,
          executionMode: "dry_run",
          externalActionsEnabled: false,
        },
        status: "pending",
      })
      .select("*")
      .single();
    throwDatabaseError("Create agent approval", approvalError);

    const { error: waitError } = await client
      .from("orbit_agent_runs")
      .update({ status: "waiting_approval" })
      .eq("workspace_id", workspaceId)
      .eq("id", run.id);
    throwDatabaseError("Pause run for approval", waitError);

    await writeAgentEvent(client, {
      workspaceId,
      runId: run.id,
      taskId: task.id,
      agentId: agent.id,
      eventType: "approval.requested",
      message: `${permission.authority_level} action routed to ${route} approval.`,
      data: { approvalId: approval.id, route, capabilityKey: input.capabilityKey },
    });

    return {
      status: "waiting_approval" as const,
      runId: run.id,
      taskId: task.id,
      approvalId: approval.id,
      route,
      authority: permission.authority_level,
    };
  } catch (error) {
    await markRunFailed(client, workspaceId, run.id, error);
    throw error;
  }
}

export async function decideAgentApprovalDryRun(
  client: SupabaseClient,
  workspaceId: string,
  actorId: string,
  rawDecision: unknown,
) {
  const decision = agentApprovalDecisionSchema.parse(rawDecision);
  await assertFounderAuthority(client, workspaceId, actorId);

  const { data, error } = await client
    .from("orbit_agent_approvals")
    .select(
      "id,run_id,task_id,requested_by_agent_id,authority_level,approval_route,status",
    )
    .eq("workspace_id", workspaceId)
    .eq("id", decision.approvalId)
    .single();
  throwDatabaseError("Resolve agent approval", error);

  const approval = data as ApprovalRow;
  if (approval.status !== "pending") {
    throw new Error(`Approval ${approval.id} is already ${approval.status}.`);
  }

  const decidedAt = new Date().toISOString();
  const { error: decisionError } = await client
    .from("orbit_agent_approvals")
    .update({
      status: decision.decision,
      decision_reason: decision.reason ?? null,
      decided_by: actorId,
      decided_at: decidedAt,
    })
    .eq("workspace_id", workspaceId)
    .eq("id", approval.id)
    .eq("status", "pending");
  throwDatabaseError("Persist agent approval decision", decisionError);

  if (decision.decision === "rejected") {
    const result = {
      decision: "rejected",
      approvalId: approval.id,
      externalActionExecuted: false,
    };

    const { error: taskError } = await client
      .from("orbit_agent_tasks")
      .update({ status: "cancelled", output: result, completed_at: decidedAt })
      .eq("workspace_id", workspaceId)
      .eq("id", approval.task_id);
    throwDatabaseError("Cancel rejected agent task", taskError);

    const { error: runError } = await client
      .from("orbit_agent_runs")
      .update({ status: "cancelled", output: result, completed_at: decidedAt })
      .eq("workspace_id", workspaceId)
      .eq("id", approval.run_id);
    throwDatabaseError("Cancel rejected agent run", runError);

    await writeAgentEvent(client, {
      workspaceId,
      runId: approval.run_id,
      taskId: approval.task_id,
      agentId: approval.requested_by_agent_id,
      eventType: "approval.rejected",
      message: "Founder rejected the dry-run action.",
      data: { approvalId: approval.id, reason: decision.reason ?? null },
    });

    return { status: "cancelled" as const, runId: approval.run_id, taskId: approval.task_id };
  }

  const result = {
    decision: "approved_dry_run",
    approvalId: approval.id,
    authority: approval.authority_level,
    approvalRoute: approval.approval_route,
    externalActionExecuted: false,
  };

  const { error: taskError } = await client
    .from("orbit_agent_tasks")
    .update({
      status: "succeeded",
      attempts: 1,
      output: result,
      locked_at: decidedAt,
      completed_at: decidedAt,
    })
    .eq("workspace_id", workspaceId)
    .eq("id", approval.task_id);
  throwDatabaseError("Complete approved agent task", taskError);

  const { error: runError } = await client
    .from("orbit_agent_runs")
    .update({ status: "succeeded", output: result, completed_at: decidedAt })
    .eq("workspace_id", workspaceId)
    .eq("id", approval.run_id);
  throwDatabaseError("Complete approved agent run", runError);

  await writeAgentEvent(client, {
    workspaceId,
    runId: approval.run_id,
    taskId: approval.task_id,
    agentId: approval.requested_by_agent_id,
    eventType: "approval.approved",
    message: "Founder approved the action; Stage 1 completed it in dry-run mode only.",
    data: result,
  });

  return {
    status: "succeeded" as const,
    runId: approval.run_id,
    taskId: approval.task_id,
    result,
  };
}
