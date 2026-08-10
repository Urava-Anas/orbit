import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processStageFourProviderReply } from "@/lib/agents/stage4-provider-inbound";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

function safeHexMatch(left: string, right: string) {
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

function verifyMetaSignature(raw: string, request: Request, appSecret: string) {
  const supplied = request.headers.get("x-hub-signature-256")?.trim() ?? "";
  if (!supplied.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", appSecret).update(raw).digest("hex");
  return safeHexMatch(supplied.slice("sha256=".length), expected);
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function messageText(message: Record<string, unknown>) {
  const type = typeof message.type === "string" ? message.type : "";
  if (type === "text") return String(record(message.text).body ?? "").trim();
  if (type === "button") return String(record(message.button).text ?? "").trim();
  if (type === "interactive") {
    const interactive = record(message.interactive);
    const buttonReply = record(interactive.button_reply);
    const listReply = record(interactive.list_reply);
    return String(buttonReply.title ?? listReply.title ?? "").trim();
  }
  return "";
}

export async function GET(request: Request) {
  const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN?.trim();
  if (!verifyToken) return new NextResponse("Webhook not configured", { status: 503 });
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  if (mode !== "subscribe" || token !== verifyToken || !challenge) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  return new NextResponse(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
}

export async function POST(request: Request) {
  const appSecret = process.env.WHATSAPP_APP_SECRET?.trim();
  if (!appSecret) {
    return NextResponse.json({ error: "WhatsApp inbound is not configured." }, { status: 503 });
  }
  const raw = await request.text();
  if (!verifyMetaSignature(raw, request, appSecret)) {
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  if (payload.object !== "whatsapp_business_account") {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Orbit server database identity is unavailable." }, { status: 503 });
  }

  const results: unknown[] = [];
  try {
    const entries = Array.isArray(payload.entry) ? payload.entry : [];
    for (const entryValue of entries) {
      const entry = record(entryValue);
      const changes = Array.isArray(entry.changes) ? entry.changes : [];
      for (const changeValue of changes) {
        const change = record(changeValue);
        if (change.field !== "messages") continue;
        const value = record(change.value);
        const messages = Array.isArray(value.messages) ? value.messages : [];
        for (const messageValue of messages) {
          const message = record(messageValue);
          const providerMessageId = typeof message.id === "string" ? message.id : "";
          const sender = typeof message.from === "string" ? message.from : "";
          const responseText = messageText(message);
          if (!providerMessageId || !sender || !responseText) continue;
          const timestampSeconds = Number(message.timestamp);
          const occurredAt = Number.isFinite(timestampSeconds)
            ? new Date(timestampSeconds * 1000).toISOString()
            : undefined;
          results.push(await processStageFourProviderReply(admin, {
            providerEventId: `whatsapp:${providerMessageId}`,
            channel: "whatsapp",
            sender,
            responseText,
            occurredAt,
          }));
        }
      }
    }
    return NextResponse.json({ ok: true, processed: results.length, results }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Stage 4 WhatsApp inbound failed", error);
    return NextResponse.json({ error: "Inbound WhatsApp event failed safely and may be retried." }, { status: 500 });
  }
}
