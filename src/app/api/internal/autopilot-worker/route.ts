import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runStageFourCompletionPlanner } from "@/lib/agents/stage4-completion-planner";
import { runStageFourAutopilotWorker } from "@/lib/agents/stage4-worker";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

function safeMatch(received: string, expected: string) {
  const actual = Buffer.from(received);
  const target = Buffer.from(expected);
  return actual.length === target.length && timingSafeEqual(actual, target);
}

async function consumeSchedulerInvocation(request: Request) {
  const invocationId = request.headers.get("x-orbit-scheduler-invocation")?.trim();
  const token = request.headers.get("x-orbit-scheduler-token")?.trim();
  if (!invocationId || !token || !/^[0-9a-f-]{36}$/i.test(invocationId) || token.length < 32) {
    return false;
  }

  const admin = createAdminClient();
  if (!admin) return false;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const consumed = await admin
    .from("orbit_scheduler_invocations")
    .update({ used_at: new Date().toISOString() })
    .eq("id", invocationId)
    .eq("token_hash", tokenHash)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("id")
    .maybeSingle();
  return !consumed.error && Boolean(consumed.data?.id);
}

async function authorised(request: Request) {
  const received = request.headers.get("authorization");
  if (received) {
    const secrets = [
      process.env.CRON_SECRET,
      process.env.ORBIT_AUTOPILOT_WORKER_SECRET,
    ].filter((secret): secret is string => Boolean(secret));
    if (secrets.some((secret) => safeMatch(received, `Bearer ${secret}`))) return true;
  }

  const serviceAuth = request.headers.get("x-orbit-service-auth");
  if (serviceAuth) {
    const serviceIdentities = [
      process.env.SUPABASE_SECRET_KEY,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    ].filter((secret): secret is string => Boolean(secret));
    const serviceMatched = serviceIdentities.some((serviceSecret) => {
      const expected = createHmac("sha256", serviceSecret)
        .update("orbit-stage4-worker:v1")
        .digest("hex");
      return safeMatch(serviceAuth, expected);
    });
    if (serviceMatched) return true;
  }

  return consumeSchedulerInvocation(request);
}

async function handle(request: Request) {
  if (!(await authorised(request))) {
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
