import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyStageFourGatewaySignature } from "@/lib/agents/stage4-gateway";
import { processStageFourInboundEvent } from "@/lib/agents/stage4-inbound";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: Request) {
  const secret =
    process.env.ORBIT_INBOUND_EVENT_SECRET?.trim() ||
    process.env.ORBIT_EXTERNAL_ACTION_GATEWAY_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { error: "Inbound event gateway is not configured." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const signature = request.headers.get("x-orbit-signature")?.trim();
  if (!signature) {
    return NextResponse.json({ error: "Missing event signature." }, { status: 401 });
  }

  const body = await request.text();
  let verified = false;
  try {
    verified = verifyStageFourGatewaySignature(body, signature, secret);
  } catch {
    verified = false;
  }
  if (!verified) {
    return NextResponse.json({ error: "Invalid event signature." }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid event JSON." }, { status: 400 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Inbound event processor is not configured." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const result = await processStageFourInboundEvent(admin, payload);
    return NextResponse.json(
      { ok: true, result },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Stage 4 inbound event failed safely", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Stage 4 inbound event failed.",
      },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
