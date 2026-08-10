import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processStageFourProviderReply } from "@/lib/agents/stage4-provider-inbound";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

function constantTimeBase64(left: string, right: string) {
  const a = Buffer.from(left, "base64");
  const b = Buffer.from(right, "base64");
  return a.length === b.length && timingSafeEqual(a, b);
}

function verifySvix(raw: string, request: Request, secret: string) {
  const id = request.headers.get("svix-id")?.trim() ?? "";
  const timestamp = request.headers.get("svix-timestamp")?.trim() ?? "";
  const signatureHeader = request.headers.get("svix-signature")?.trim() ?? "";
  const timestampSeconds = Number(timestamp);
  if (!id || !Number.isFinite(timestampSeconds) || !signatureHeader) return null;
  if (Math.abs(Date.now() / 1000 - timestampSeconds) > 5 * 60) return null;
  if (!secret.startsWith("whsec_")) return null;

  const key = Buffer.from(secret.slice("whsec_".length), "base64");
  const expected = createHmac("sha256", key)
    .update(`${id}.${timestamp}.${raw}`)
    .digest("base64");
  const valid = signatureHeader
    .split(/\s+/)
    .map((entry) => entry.split(",", 2))
    .some(([version, signature]) => version === "v1" && Boolean(signature) && constantTimeBase64(signature, expected));
  return valid ? id : null;
}

function plainText(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function POST(request: Request) {
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!webhookSecret || !apiKey) {
    return NextResponse.json({ error: "Resend inbound is not configured." }, { status: 503 });
  }

  const raw = await request.text();
  const deliveryId = verifySvix(raw, request, webhookSecret);
  if (!deliveryId) {
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });
  }

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  if (event.type !== "email.received") {
    return NextResponse.json({ ok: true, ignored: true }, { status: 200 });
  }

  const data = event.data && typeof event.data === "object" && !Array.isArray(event.data)
    ? (event.data as Record<string, unknown>)
    : {};
  const emailId = typeof data.email_id === "string" ? data.email_id : "";
  const sender = typeof data.from === "string" ? data.from : "";
  if (!emailId || !sender) {
    return NextResponse.json({ error: "Incomplete email.received payload." }, { status: 400 });
  }

  const emailResponse = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  const email = (await emailResponse.json().catch(() => ({}))) as Record<string, unknown>;
  if (!emailResponse.ok) {
    return NextResponse.json({ error: "Unable to retrieve received email." }, { status: 502 });
  }
  const responseText =
    (typeof email.text === "string" && email.text.trim()) ||
    (typeof email.html === "string" ? plainText(email.html) : "");
  if (!responseText) {
    return NextResponse.json({ ok: true, ignored: true, reason: "empty_email_body" });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Orbit server database identity is unavailable." }, { status: 503 });
  }

  try {
    const result = await processStageFourProviderReply(admin, {
      providerEventId: `resend:${deliveryId}`,
      channel: "email",
      sender,
      responseText,
      occurredAt: typeof event.created_at === "string" ? event.created_at : undefined,
    });
    return NextResponse.json({ ok: true, result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Stage 4 Resend inbound failed", error);
    return NextResponse.json({ error: "Inbound email failed safely and may be retried." }, { status: 500 });
  }
}
