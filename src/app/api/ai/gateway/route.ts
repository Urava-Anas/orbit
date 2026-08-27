import { NextResponse } from "next/server";
import { z } from "zod";
import { runAiGateway } from "@/lib/ai/gateway";
import { aiCapabilities, aiSensitivities } from "@/lib/ai/types";
import { getOrbitAccess } from "@/lib/access";

export const runtime = "nodejs";

const requestSchema = z.object({
  module: z.string().min(1).max(80),
  action: z.string().min(1).max(120),
  capability: z.enum(aiCapabilities),
  sensitivity: z.enum(aiSensitivities).default("internal"),
  messages: z
    .array(
      z.object({
        role: z.enum(["system", "user", "assistant"]),
        content: z.string().min(1).max(100_000),
      }),
    )
    .min(1)
    .max(64),
  maxOutputTokens: z.number().int().positive().max(32_768).optional(),
  temperature: z.number().min(0).max(2).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(request: Request) {
  const context = await getOrbitAccess();

  if (!context) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { access, user } = context;
  if (
    access.accountRole !== "founder" ||
    !access.workspace ||
    !access.membershipRole ||
    !["owner", "admin"].includes(access.membershipRole)
  ) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const payload = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid AI Gateway request." },
      { status: 400 },
    );
  }

  try {
    const result = await runAiGateway({
      workspaceId: access.workspace.id,
      actorId: user.id,
      request: parsed.data,
    });

    return NextResponse.json(result, {
      headers: {
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "AI Gateway failed.";

    return NextResponse.json(
      { error: message },
      {
        status: message.includes("No enabled AI model") ? 503 : 502,
        headers: {
          "cache-control": "no-store",
        },
      },
    );
  }
}
