import "server-only";

import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { advanceStageThreeOpportunity } from "@/lib/agents/stage3-runtime";

const common = {
  eventId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  opportunityId: z.string().uuid(),
  occurredAt: z.string().datetime().optional(),
  channel: z.enum(["email", "whatsapp", "phone", "manual", "system"]).default("system"),
};

export const stageFourInboundEventSchema = z.discriminatedUnion("event", [
  z.object({
    ...common,
    event: z.literal("reply_interested"),
    responseText: z.string().min(1).max(4000),
  }),
  z.object({
    ...common,
    event: z.literal("reply_objection"),
    responseText: z.string().min(1).max(4000),
    objections: z.array(z.string().min(1).max(500)).max(12).default([]),
  }),
  z.object({
    ...common,
    event: z.literal("proposal_accepted"),
  }),
  z.object({
    ...common,
    event: z.literal("payment_confirmed"),
    paymentReference: z.string().min(1).max(240),
  }),
  z.object({
    ...common,
    event: z.literal("delivery_completed"),
    resultSummary: z.string().min(10).max(4000),
  }),
  z.object({
    ...common,
    event: z.literal("proof_permission_granted"),
    proofPermissionScope: z.enum(["private", "anonymous", "public"]),
  }),
  z.object({
    ...common,
    event: z.literal("lead_lost"),
    responseText: z.string().max(4000).optional(),
  }),
]);

type InboundEvent = z.infer<typeof stageFourInboundEventSchema>;

function throwDatabaseError(operation: string, error: { message: string } | null) {
  if (error) throw new Error(`${operation}: ${error.message}`);
}

async function deriveCapacityStatus(client: SupabaseClient, workspaceId: string) {
  const config = await client
    .from("orbit_autopilot_configs")
    .select("max_active_projects")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  throwDatabaseError("Load Stage 4 capacity limit", config.error);
  const maxActiveProjects = Number(config.data?.max_active_projects ?? 10);

  const projects = await client
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .in("status", ["planned", "in_progress", "review", "blocked"]);
  throwDatabaseError("Count Stage 4 delivery capacity", projects.error);
  const active = projects.count ?? 0;
  if (active >= maxActiveProjects) return "blocked" as const;
  if (active >= Math.max(1, maxActiveProjects - 1)) return "constrained" as const;
  return "available" as const;
}

async function ensureInboundActivity(
  client: SupabaseClient,
  workspaceId: string,
  actorId: string,
  leadId: string,
  event: InboundEvent,
) {
  const responseText = "responseText" in event ? event.responseText ?? "" : "";
  const summary = `Stage 4 inbound ${event.event} [${event.eventId}]${responseText ? `: ${responseText}` : ""}`.slice(0, 4000);
  const existing = await client
    .from("lead_activities")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("lead_id", leadId)
    .eq("summary", summary)
    .maybeSingle();
  throwDatabaseError("Deduplicate Stage 4 inbound activity", existing.error);
  if (existing.data) return existing.data.id as string;

  const kind = event.channel === "email"
    ? "email"
    : event.channel === "whatsapp"
      ? "whatsapp"
      : event.channel === "phone"
        ? "call"
        : "note";
  const inserted = await client
    .from("lead_activities")
    .insert({
      workspace_id: workspaceId,
      lead_id: leadId,
      kind,
      direction: "inbound",
      outcome: ["reply_interested", "reply_objection"].includes(event.event) ? "replied" : "logged",
      summary,
      occurred_at: event.occurredAt ?? new Date().toISOString(),
      created_by: actorId,
    })
    .select("id")
    .single();
  throwDatabaseError("Record Stage 4 inbound activity", inserted.error);
  if (!inserted.data) throw new Error("Stage 4 inbound activity was not returned.");
  return inserted.data.id as string;
}

export async function processStageFourInboundEvent(
  client: SupabaseClient,
  rawInput: unknown,
) {
  const input = stageFourInboundEventSchema.parse(rawInput);

  const workspace = await client
    .from("workspaces")
    .select("owner_id")
    .eq("id", input.workspaceId)
    .single();
  throwDatabaseError("Resolve Stage 4 inbound workspace owner", workspace.error);
  if (!workspace.data?.owner_id) throw new Error("Stage 4 inbound workspace owner is unavailable.");
  const actorId = workspace.data.owner_id as string;

  const existingCall = await client
    .from("orbit_action_calls")
    .select("id,status,response_summary")
    .eq("workspace_id", input.workspaceId)
    .eq("request_id", input.eventId)
    .maybeSingle();
  throwDatabaseError("Resolve Stage 4 inbound idempotency", existingCall.error);
  if (existingCall.data?.status === "succeeded") {
    return {
      eventId: input.eventId,
      reused: true,
      status: "succeeded" as const,
      result: existingCall.data.response_summary,
    };
  }

  let callId: string;
  if (existingCall.data) {
    callId = existingCall.data.id as string;
    const restart = await client
      .from("orbit_action_calls")
      .update({ status: "started", error_code: null, response_summary: {}, completed_at: null })
      .eq("id", callId);
    throwDatabaseError("Restart Stage 4 inbound audit", restart.error);
  } else {
    const call = await client
      .from("orbit_action_calls")
      .insert({
        workspace_id: input.workspaceId,
        actor_id: actorId,
        action_key_id: null,
        operation: `stage4.inbound.${input.event}`,
        request_id: input.eventId,
        request_summary: {
          opportunityId: input.opportunityId,
          event: input.event,
          channel: input.channel,
          occurredAt: input.occurredAt ?? null,
        },
        status: "started",
      })
      .select("id")
      .single();
    throwDatabaseError("Begin Stage 4 inbound audit", call.error);
    if (!call.data) throw new Error("Stage 4 inbound audit row was not returned.");
    callId = call.data.id as string;
  }

  try {
    const opportunity = await client
      .from("orbit_sales_opportunities")
      .select("lead_id")
      .eq("workspace_id", input.workspaceId)
      .eq("id", input.opportunityId)
      .single();
    throwDatabaseError("Resolve Stage 4 inbound opportunity", opportunity.error);
    if (!opportunity.data) throw new Error("Stage 4 inbound opportunity does not exist in this workspace.");

    const activityId = await ensureInboundActivity(
      client,
      input.workspaceId,
      actorId,
      opportunity.data.lead_id,
      input,
    );

    const advanceInput: Record<string, unknown> = {
      opportunityId: input.opportunityId,
      event: input.event,
      idempotencyKey: `stage4-inbound:${input.eventId}`,
    };
    if ("responseText" in input && input.responseText) advanceInput.responseText = input.responseText;
    if ("objections" in input) advanceInput.objections = input.objections;
    if (input.event === "payment_confirmed") {
      advanceInput.paymentReference = input.paymentReference;
      advanceInput.capacityStatus = await deriveCapacityStatus(client, input.workspaceId);
      advanceInput.deliveryBrief = {
        source: "stage4_verified_payment_event",
        note: "Studio must still review the handoff before founder-gated project activation.",
      };
    }
    if (input.event === "delivery_completed") advanceInput.resultSummary = input.resultSummary;
    if (input.event === "proof_permission_granted") {
      advanceInput.proofPermissionScope = input.proofPermissionScope;
    }

    const advanced = await advanceStageThreeOpportunity(
      client,
      input.workspaceId,
      actorId,
      advanceInput,
    );
    const responseSummary = {
      activityId,
      opportunityId: input.opportunityId,
      event: input.event,
      advanced,
    };
    const callUpdate = await client
      .from("orbit_action_calls")
      .update({
        status: "succeeded",
        response_summary: responseSummary,
        completed_at: new Date().toISOString(),
      })
      .eq("id", callId);
    throwDatabaseError("Complete Stage 4 inbound audit", callUpdate.error);

    return {
      eventId: input.eventId,
      status: "succeeded" as const,
      ...responseSummary,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Stage 4 inbound failure";
    await client
      .from("orbit_action_calls")
      .update({
        status: "failed",
        error_code: "stage4_inbound_failure",
        response_summary: { error: message },
        completed_at: new Date().toISOString(),
      })
      .eq("id", callId);
    throw error;
  }
}
