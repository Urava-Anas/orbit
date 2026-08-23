import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { deriveContentLearnings } from "@/lib/content-engine-learning";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function safeMatch(received: string, expected: string) {
  const actual = Buffer.from(received);
  const target = Buffer.from(expected);
  return actual.length === target.length && timingSafeEqual(actual, target);
}

async function authorized(request: Request, admin: NonNullable<ReturnType<typeof createAdminClient>>) {
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return false;
  const secret = header.slice("Bearer ".length).trim();
  if (!secret || secret.length > 512) return false;
  const { data, error } = await admin
    .from("content_worker_auth")
    .select("secret_hash")
    .eq("id", "learning")
    .maybeSingle();
  return !error && Boolean(data?.secret_hash) && safeMatch(sha256(secret), data!.secret_hash);
}

function localHour(timezone: string, date: Date) {
  const value = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    hourCycle: "h23",
  }).format(date);
  return Number(value);
}

async function handle(request: Request) {
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Content learning database worker is unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  if (!(await authorized(request, admin))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  const { data: profiles, error } = await admin
    .from("content_brand_profiles")
    .select("workspace_id,timezone,generation_hour")
    .eq("daily_generation_enabled", true)
    .eq("approval_required", true);
  if (error) {
    console.error("Content learning worker could not load eligible profiles", error);
    return NextResponse.json({ error: "Eligible workspaces could not be loaded." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }

  const now = new Date();
  const eligible = (profiles ?? []).filter((profile) => {
    try {
      const generationHour = Number(profile.generation_hour);
      if (!Number.isInteger(generationHour) || generationHour < 0 || generationHour > 23) return false;
      const learningHour = (generationHour + 23) % 24;
      return localHour(profile.timezone, now) === learningHour;
    } catch {
      return false;
    }
  });

  const results: Array<{ workspaceId: string; status: "inserted" | "existing" | "no_data" | "failed"; inserted: number; detail?: string }> = [];
  for (const profile of eligible) {
    try {
      const result = await deriveContentLearnings({
        supabase: admin,
        workspaceId: profile.workspace_id,
        timezone: profile.timezone,
        now,
      });
      results.push({ workspaceId: profile.workspace_id, status: result.status, inserted: result.inserted });
    } catch (workerError) {
      console.error("Content learning failed safely", { workspaceId: profile.workspace_id, error: workerError });
      results.push({
        workspaceId: profile.workspace_id,
        status: "failed",
        inserted: 0,
        detail: "Content learning failed safely.",
      });
    }
  }

  const failed = results.filter((item) => item.status === "failed").length;
  return NextResponse.json(
    {
      checkedAt: now.toISOString(),
      eligible: eligible.length,
      learned: results.reduce((sum, item) => sum + item.inserted, 0),
      noData: results.filter((item) => item.status === "no_data").length,
      failed,
      results,
    },
    { status: failed ? 207 : 200, headers: { "Cache-Control": "no-store" } },
  );
}

export const GET = handle;
export const POST = handle;
