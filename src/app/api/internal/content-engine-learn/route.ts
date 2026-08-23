import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { deriveContentLearnings } from "@/lib/content-engine-learning";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function safeMatch(received: string, expected: string) {
  const actual = Buffer.from(received);
  const target = Buffer.from(expected);
  return actual.length === target.length && timingSafeEqual(actual, target);
}

async function handle(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: "Content learning scheduler is not configured." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  if (!safeMatch(request.headers.get("authorization") ?? "", `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Content learning database worker is unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  const { data: profiles, error } = await admin
    .from("content_brand_profiles")
    .select("workspace_id,timezone")
    .eq("daily_generation_enabled", true)
    .eq("approval_required", true);
  if (error) {
    console.error("Content learning worker could not load eligible profiles", error);
    return NextResponse.json({ error: "Eligible workspaces could not be loaded." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }

  const results: Array<{ workspaceId: string; status: "inserted" | "existing" | "no_data" | "failed"; inserted: number; detail?: string }> = [];
  for (const profile of profiles ?? []) {
    try {
      const result = await deriveContentLearnings({
        supabase: admin,
        workspaceId: profile.workspace_id,
        timezone: profile.timezone,
      });
      results.push({ workspaceId: profile.workspace_id, status: result.status, inserted: result.inserted });
    } catch (workerError) {
      console.error("Content learning failed safely", { workspaceId: profile.workspace_id, error: workerError });
      results.push({
        workspaceId: profile.workspace_id,
        status: "failed",
        inserted: 0,
        detail: workerError instanceof Error ? workerError.message : "Unknown learning failure.",
      });
    }
  }

  const failed = results.filter((item) => item.status === "failed").length;
  return NextResponse.json(
    {
      checkedAt: new Date().toISOString(),
      workspaces: results.length,
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
