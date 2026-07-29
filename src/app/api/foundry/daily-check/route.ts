import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const payloadSchema = z.object({
  checkpoints: z
    .array(z.enum(["portal_opened", "task_opened", "feedback_viewed"]))
    .min(1)
    .max(3),
});

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin && host) {
    try {
      if (new URL(origin).host !== host) {
        return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
      }
    } catch {
      return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
    }
  }

  const payload = payloadSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!payload.success) {
    return NextResponse.json({ error: "Invalid checkpoint" }, { status: 400 });
  }

  const supabase = await createClient();
  const userResult = await supabase.auth.getUser();
  if (userResult.error || !userResult.data.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  for (const checkpoint of new Set(payload.data.checkpoints)) {
    const result = await supabase.rpc("record_foundry_daily_checkpoint", {
      checkpoint,
    });
    if (result.error) {
      return NextResponse.json(
        { error: "Checkpoint was not accepted" },
        { status: 403 },
      );
    }
  }

  return new NextResponse(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  });
}
