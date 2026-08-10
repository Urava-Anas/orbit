import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  stageFourGatewaySecret,
  verifyStageFourGatewaySignature,
  type StageFourGatewayEnvelope,
} from "@/lib/agents/stage4-gateway";
import { dispatchStageFourProvider } from "@/lib/agents/stage4-providers";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

const envelopeSchema = z.object({
  requestId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  actionRequestId: z.string().uuid(),
  capabilityKey: z.string().min(2).max(160),
  channel: z.enum(["email", "whatsapp"]),
  destination: z.string().min(3).max(500).nullable(),
  idempotencyKey: z.string().min(1).max(180),
  payload: z.record(z.string(), z.unknown()),
  requestedAt: z.string().datetime(),
});

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
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  workspaceId: string,
  idempotencyKey: string,
) {
  const existing = await admin
    .from("orbit_provider_dispatches")
    .select("id,status,provider,provider_request_id,response_summary,error_code,created_at,completed_at")
    .eq("workspace_id", workspaceId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (existing.error) throw new Error(`Load Stage 4 provider dispatch: ${existing.error.message}`);
  return existing.data;
}

export async function POST(request: Request) {
  const secret = stageFourGatewaySecret();
  if (!secret) {
    return NextResponse.json(
      { ok: false, provider: "orbit_gateway", errorCode: "gateway_secret_missing" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const signature = request.headers.get("x-orbit-signature")?.trim() ?? "";
  const version = request.headers.get("x-orbit-signature-version")?.trim() ?? "";
  const raw = await request.text();
  if (version !== "v1" || !signature || !verifyStageFourGatewaySignature(raw, signature, secret)) {
    return NextResponse.json(
      { ok: false, provider: "orbit_gateway", errorCode: "invalid_gateway_signature" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return NextResponse.json(
      { ok: false, provider: "orbit_gateway", errorCode: "invalid_json" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  const parsed = envelopeSchema.safeParse(parsedJson);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, provider: "orbit_gateway", errorCode: "invalid_gateway_envelope" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  const envelope = parsed.data as StageFourGatewayEnvelope;
  const requestedAt = Date.parse(envelope.requestedAt);
  if (!Number.isFinite(requestedAt) || Math.abs(Date.now() - requestedAt) > 5 * 60 * 1000) {
    return NextResponse.json(
      { ok: false, provider: "orbit_gateway", errorCode: "stale_gateway_request" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { ok: false, provider: "orbit_gateway", errorCode: "admin_client_not_configured" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const action = await admin
    .from("orbit_external_action_requests")
    .select("id,request_id,capability_key,channel,destination,payload,idempotency_key,status")
    .eq("workspace_id", envelope.workspaceId)
    .eq("id", envelope.actionRequestId)
    .single();
  if (action.error || !action.data) {
    return NextResponse.json(
      { ok: false, provider: "orbit_gateway", errorCode: "action_request_not_found" },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  const matches =
    action.data.request_id === envelope.requestId &&
    action.data.capability_key === envelope.capabilityKey &&
    action.data.channel === envelope.channel &&
    (action.data.destination ?? null) === envelope.destination &&
    action.data.idempotency_key === envelope.idempotencyKey &&
    safeEqual(action.data.payload, envelope.payload);
  if (!matches || action.data.status !== "executing") {
    return NextResponse.json(
      { ok: false, provider: "orbit_gateway", errorCode: "action_revalidation_failed" },
      { status: 409, headers: { "Cache-Control": "no-store" } },
    );
  }

  const existing = await cachedDispatch(admin, envelope.workspaceId, envelope.idempotencyKey);
  if (existing) {
    const ok = existing.status === "succeeded";
    return NextResponse.json(
      {
        ok,
        provider: existing.provider ?? "orbit_gateway",
        providerRequestId: existing.provider_request_id ?? null,
        responseSummary: { ...(existing.response_summary ?? {}), reusedProviderDispatch: true },
        errorCode: ok ? null : existing.error_code ?? "provider_dispatch_already_attempted",
      },
      { status: ok ? 200 : 409, headers: { "Cache-Control": "no-store" } },
    );
  }

  const claimed = await admin
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
    const raced = await cachedDispatch(admin, envelope.workspaceId, envelope.idempotencyKey);
    if (raced) {
      return NextResponse.json(
        {
          ok: raced.status === "succeeded",
          provider: raced.provider ?? "orbit_gateway",
          providerRequestId: raced.provider_request_id ?? null,
          responseSummary: { ...(raced.response_summary ?? {}), reusedProviderDispatch: true },
          errorCode: raced.status === "succeeded" ? null : raced.error_code ?? "provider_dispatch_in_progress",
        },
        { status: raced.status === "succeeded" ? 200 : 409, headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(
      { ok: false, provider: "orbit_gateway", errorCode: "provider_dispatch_claim_failed" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const providerResult = await dispatchStageFourProvider(envelope);
    const completedAt = new Date().toISOString();
    const update = await admin
      .from("orbit_provider_dispatches")
      .update({
        provider: providerResult.provider,
        status: providerResult.ok ? "succeeded" : "failed",
        provider_request_id: providerResult.providerRequestId,
        response_summary: providerResult.responseSummary,
        error_code: providerResult.errorCode,
        completed_at: completedAt,
      })
      .eq("workspace_id", envelope.workspaceId)
      .eq("id", claimed.data.id);
    if (update.error) {
      console.error("Stage 4 provider dispatch audit update failed", update.error);
    }

    return NextResponse.json(providerResult, {
      status: providerResult.ok ? 200 : 502,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const summary = {
      blocked: true,
      uncertainProviderOutcome: true,
      reason: error instanceof Error ? error.message : "Unknown provider transport failure",
    };
    await admin
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

    return NextResponse.json(
      {
        ok: false,
        provider: envelope.channel === "email" ? "resend" : "meta_whatsapp_cloud",
        providerRequestId: null,
        responseSummary: summary,
        errorCode: "provider_transport_outcome_uncertain",
      },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
