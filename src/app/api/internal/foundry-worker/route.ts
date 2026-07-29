import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runFoundryWorker } from "@/lib/foundry-integrations/worker";

export const runtime = "nodejs";
export const maxDuration = 60;

function authorised(request: Request) {
  const received = request.headers.get("authorization");
  if (!received) return false;
  const secrets = [
    process.env.CRON_SECRET,
    process.env.FOUNDRY_WORKER_SECRET,
  ].filter((secret): secret is string => Boolean(secret));
  return secrets.some((secret) => {
    const expected = Buffer.from(`Bearer ${secret}`);
    const actual = Buffer.from(received);
    return (
      expected.length === actual.length && timingSafeEqual(expected, actual)
    );
  });
}

async function handle(request: Request) {
  if (!authorised(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await runFoundryWorker();
    return NextResponse.json(result, {
      status: result.configured ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Foundry worker route failed", error);
    return NextResponse.json(
      { error: "Worker failed safely; queued work remains retryable." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export const GET = handle;
export const POST = handle;
