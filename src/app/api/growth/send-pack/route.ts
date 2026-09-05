import { NextResponse } from "next/server";
import { z } from "zod";
import {
  approveAndSendRecommendedPack,
  buildRecommendedSendPack,
} from "@/lib/growth/send-pack";
import { getOrbitAccess } from "@/lib/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("build"),
    leadId: z.string().uuid(),
    pricingPlanId: z.string().uuid(),
    channel: z.enum(["email", "whatsapp"]).optional(),
  }),
  z.object({
    action: z.literal("approve_and_send"),
    sendPackId: z.string().uuid(),
  }),
]);

export async function POST(request: Request) {
  const context = await getOrbitAccess();
  if (!context) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { access, user, supabase } = context;
  if (
    access.accountRole !== "founder" ||
    !access.workspace ||
    !access.membershipRole ||
    !["owner", "admin"].includes(access.membershipRole)
  ) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const raw = await request.json().catch(() => null);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid send-pack request." }, { status: 400 });
  }

  try {
    if (parsed.data.action === "build") {
      const result = await buildRecommendedSendPack(
        supabase,
        access.workspace.id,
        user.id,
        parsed.data,
      );
      return NextResponse.json(result, {
        status: 201,
        headers: { "cache-control": "no-store" },
      });
    }

    const result = await approveAndSendRecommendedPack(
      supabase,
      access.workspace.id,
      user.id,
      parsed.data.sendPackId,
    );
    return NextResponse.json(result, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Send-pack operation failed.";
    const blocked =
      message.includes("pricing") ||
      message.includes("Autopilot") ||
      message.includes("disabled") ||
      message.includes("kill switch") ||
      message.includes("provider") ||
      message.includes("working hours");
    return NextResponse.json(
      { error: message },
      { status: blocked ? 409 : 500, headers: { "cache-control": "no-store" } },
    );
  }
}
