import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runStageFourCompletionPlanner } from "@/lib/agents/stage4-completion-planner";
import { runStageFourAutopilotWorker } from "@/lib/agents/stage4-worker";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

function safeMatch(received: string, expected: string) {
  const actual = Buffer.from(received);
  const target = Buffer.from(expected);
  return actual.length === target.length && timingSafeEqual(actual, target);
}

function authorised(request: Request) {
  const received = request.headers.get("authorization");
  if (received) {
    const secrets = [
      process.env.CRON_SECRET,
      process.env.ORBIT_AUTOPILOT_WORKER_SECRET,
    ].filter((secret): secret is string => Boolean(secret));
    if (secrets.some((secret) => safeMatch(received, `Bearer ${secret}`))) return true;
  }

  const serviceSecret =
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  const serviceAuth = request.headers.get("x-orbit-service-auth");
  if (!serviceSecret || !serviceAuth) return false;
  const expected = createHmac("sha256", serviceSecret)
    .update("orbit-stage4-worker:v1")
    .digest("hex");
  return safeMatch(serviceAuth, expected);
}

async function handle(request: Request) {
  if (!authorised(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const completionPlanner = await runStageFourCompletionPlanner();
    const result = await runStageFourAutopilotWorker();
    console.info("Stage 4 Autopilot worker completed", {
      completionPlanned: completionPlanner.planned,
      completionErrors: completionPlanner.errors,
      planned: result.planned,
      claimed: result.claimed,
      succeeded: result.succeeded,
      failed: result.failed,
      blocked: result.blocked,
    });
    return NextResponse.json(
      { ...result, completionPlanner },
      {
        status: result.configured && completionPlanner.configured ? 200 : 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    console.error("Stage 4 Autopilot worker failed safely", error);
    return NextResponse.json(
      { error: "Autopilot worker failed safely; governed actions remain retryable or blocked." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export const GET = handle;
export const POST = handle;
