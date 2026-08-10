import { NextResponse } from "next/server";
import { z } from "zod";
import { processStageFourProviderReply } from "@/lib/agents/stage4-provider-inbound";
import { stageFourOneTimeServiceContext } from "@/lib/agents/stage4-service-auth";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

const inputSchema = z.object({
  providerEventId: z.string().min(1).max(500),
  channel: z.enum(["email", "whatsapp"]),
  sender: z.string().min(3).max(500),
  responseText: z.string().min(1).max(4000),
  occurredAt: z.string().datetime().optional(),
});

export async function POST(request: Request) {
  const context = await stageFourOneTimeServiceContext(request);
  if (!context.authorised || !context.admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
    const result = await processStageFourProviderReply(context.admin, parsed.data);
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
