import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  StageFourGatewayEnvelope,
  StageFourGatewayResult,
} from "@/lib/agents/stage4-gateway";
import { dispatchStageFourProvider } from "@/lib/agents/stage4-providers";

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
    .join(",")}}`;
}

function safeEqual(a: unknown, b: unknown) {
  return canonical(a) === canonical(b);
}

async function cachedDispatch(
  client: SupabaseClient,
  workspaceId: string,
  idempotencyKey: string,
) {
  const existing = await client
    .from("orbit_provider_dispatches")
    .select("id,status,provider,provider_request_id,response_summary,error_code,created_at,completed_at")
    .eq("workspace_id", workspaceId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (existing.error) {
    throw new Error(`Load Stage 4 provider dispatch: ${existing.error.message}`);
  }
  return existing.data;
}

function fromExisting(existing: NonNullable<Awaited<ReturnType<typeof cachedDispatch>>>): StageFourGatewayResult {
  const ok = existing.status === "succeeded";
  return {
    ok,
    provider: existing.provider ?? "orbit_provider_router",
    providerRequestId: existing.provider_request_id ?? null,
    responseSummary: {
      ...(existing.response_summary ?? {}),
      reusedProviderDispatch: true,
    },
    errorCode: ok
      ? null
      : existing.error_code ?? "provider_dispatch_already_attempted",
  };
}

export async function dispatchStageFourProviderGoverned(
  client: SupabaseClient,
  envelope: StageFourGatewayEnvelope,
): Promise<StageFourGatewayResult> {
  const requestedAt = Date.parse(envelope.requestedAt);
  if (!Number.isFinite(requestedAt) || Math.abs(Date.now() - requestedAt) > 5 * 60 * 1000) {
    return {
      ok: false,
      provider: "orbit_provider_router",
      providerRequestId: null,
      responseSummary: { blocked: true, reason: "Stage 4 provider request is stale." },
      errorCode: "stale_gateway_request",
    };
  }

  const action = await client
    .from("orbit_external_action_requests")
    .select("id,request_id,capability_key,channel,destination,payload,idempotency_key,status")
    .eq("workspace_id", envelope.workspaceId)
    .eq("id", envelope.actionRequestId)
    .single();
  if (action.error || !action.data) {
    return {
      ok: false,
      provider: "orbit_provider_router",
      providerRequestId: null,
      responseSummary: { blocked: true, reason: "Action request was not found." },
      errorCode: "action_request_not_found",
    };
  }

  const matches =
    action.data.request_id === envelope.requestId &&
    action.data.capability_key === envelope.capabilityKey &&
    action.data.channel === envelope.channel &&
    (action.data.destination ?? null) === envelope.destination &&
    action.data.idempotency_key === envelope.idempotencyKey &&
    safeEqual(action.data.payload, envelope.payload);
  if (!matches || action.data.status !== "executing") {
    return {
      ok: false,
      provider: "orbit_provider_router",
      providerRequestId: null,
      responseSummary: { blocked: true, reason: "Action revalidation failed before provider dispatch." },
      errorCode: "action_revalidation_failed",
    };
  }

  const existing = await cachedDispatch(client, envelope.workspaceId, envelope.idempotencyKey);
  if (existing) return fromExisting(existing);

  const claimed = await client
    .from("orbit_provider_dispatches")
    .insert({
      workspace_id: envelope.workspaceId,
      action_request_id: envelope.actionRequestId,
      request_id: envelope.requestId,
      idempotency_key: envelope.idempotencyKey,
      channel: envelope.channel,
      status: "started",
    })
    .select("id")
    .single();

  if (claimed.error || !claimed.data) {
    const raced = await cachedDispatch(client, envelope.workspaceId, envelope.idempotencyKey);
    if (raced) return fromExisting(raced);
    return {
      ok: false,
      provider: "orbit_provider_router",
      providerRequestId: null,
      responseSummary: { blocked: true, reason: "Provider dispatch could not be claimed." },
      errorCode: "provider_dispatch_claim_failed",
    };
  }

  try {
    const providerResult = await dispatchStageFourProvider(envelope);
    const update = await client
      .from("orbit_provider_dispatches")
      .update({
        provider: providerResult.provider,
        status: providerResult.ok ? "succeeded" : "failed",
        provider_request_id: providerResult.providerRequestId,
        response_summary: providerResult.responseSummary,
        error_code: providerResult.errorCode,
        completed_at: new Date().toISOString(),
      })
      .eq("workspace_id", envelope.workspaceId)
      .eq("id", claimed.data.id);
    if (update.error) {
      console.error("Stage 4 provider dispatch audit update failed", update.error);
    }
    return providerResult;
  } catch (error) {
    const summary = {
      blocked: true,
      uncertainProviderOutcome: true,
      reason: error instanceof Error ? error.message : "Unknown provider transport failure",
    };
    await client
      .from("orbit_provider_dispatches")
      .update({
        provider: envelope.channel === "email" ? "resend" : "meta_whatsapp_cloud",
        status: "blocked",
        response_summary: summary,
        error_code: "provider_transport_outcome_uncertain",
        completed_at: new Date().toISOString(),
      })
      .eq("workspace_id", envelope.workspaceId)
      .eq("id", claimed.data.id);

    return {
      ok: false,
      provider: envelope.channel === "email" ? "resend" : "meta_whatsapp_cloud",
      providerRequestId: null,
      responseSummary: summary,
      errorCode: "provider_transport_outcome_uncertain",
    };
  }
}
