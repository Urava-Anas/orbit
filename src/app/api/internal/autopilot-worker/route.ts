import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runStageFourAutopilotWorker } from "@/lib/agents/stage4-worker";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

function authorised(request: Request) {
  const received = request.headers.get("authorization");
  if (!received) return false;
  const secrets = [
    process.env.CRON_SECRET,
    process.env.ORBIT_AUTOPILOT_WORKER_SECRET,
  ].filter((secret): secret is string => Boolean(secret));

  return secrets.some((secret) => {
    const expected = Buffer.from(`Bearer ${secret}`);
    const actual = Buffer.from(received);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  });
}

async function handle(request: Request) {
  if (!authorised(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runStageFourAutopilotWorker();
    console.info("Stage 4 Autopilot worker completed", {
      claimed: result.claimed,
      succeeded: result.succeeded,
      failed: result.failed,
      blocked: result.blocked,
    });
    return NextResponse.json(result, {
      status: result.configured ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    });
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
