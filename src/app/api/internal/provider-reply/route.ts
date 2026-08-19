import { NextResponse } from "next/server";
import { z } from "zod";
import { processStageFourProviderReply } from "@/lib/agents/stage4-provider-inbound";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

const inputSchema = z.object({
  providerEventId: z.string().min(1).max(500),
  channel: z.enum(["email", "whatsapp"]),
  sender: z.string().min(3).max(500),
  responseText: z.string().min(1).max(4000),
  occurredAt: z.string().datetime().optional(),
}).strict();

const MAX_REPLY_BYTES = 12 * 1024;

function oneTimeHeaders(request: Request) {
  const invocationId = request.headers.get("x-orbit-scheduler-invocation")?.trim();
  const token = request.headers.get("x-orbit-scheduler-token")?.trim();
  if (
    !invocationId ||
    !token ||
    !/^[0-9a-f-]{36}$/i.test(invocationId) ||
    !/^[0-9a-f]{64}$/i.test(token)
  ) {
    return null;
  }
  return { invocationId, token };
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_REPLY_BYTES) {
    return NextResponse.json(
      { error: "Payload too large." },
      { status: 413, headers: { "Cache-Control": "no-store" } },
    );
  }

  const capability = oneTimeHeaders(request);
  const admin = createAdminClient();
  if (!capability || !admin) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const consumed = await admin.rpc("consume_stage4_scheduler_invocation", {
    p_id: capability.invocationId,
    p_token: capability.token,
    p_purpose: "provider_reply",
  });
  if (consumed.error || consumed.data !== true) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const parsed = inputSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid provider reply envelope." }, { status: 400 });
  }

  try {
    const result = await processStageFourProviderReply(admin, parsed.data);
    return NextResponse.json(
      { ok: true, result },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Stage 4 provider reply failed safely", error);
    return NextResponse.json(
      { error: "Provider reply failed safely and may be retried." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
