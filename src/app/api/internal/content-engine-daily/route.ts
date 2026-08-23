import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import {
  contentGenerationConfigured,
  generateDailyContentBatch,
  localDate,
} from "@/lib/content-engine";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function safeMatch(received: string, expected: string) {
  const actual = Buffer.from(received);
  const target = Buffer.from(expected);
  return actual.length === target.length && timingSafeEqual(actual, target);
}

function localHour(timezone: string, date = new Date()) {
  const value = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    hourCycle: "h23",
  }).format(date);
  return Number(value);
}

async function handle(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { error: "Content Engine scheduler is not configured." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const received = request.headers.get("authorization") ?? "";
  if (!safeMatch(received, `Bearer ${secret}`)) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Content Engine database worker is unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (!contentGenerationConfigured()) {
    return NextResponse.json(
      { error: "Content Engine AI generation is not configured." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const { data: profiles, error } = await admin
    .from("content_brand_profiles")
    .select("workspace_id,timezone,generation_hour,workspaces(name)")
    .eq("daily_generation_enabled", true)
    .eq("approval_required", true);

  if (error) {
    console.error("Content Engine scheduler could not read eligible profiles", error);
    return NextResponse.json(
      { error: "Eligible workspaces could not be loaded." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }

  const now = new Date();
  const eligible = (profiles ?? []).filter((profile) => {
    try {
      return localHour(profile.timezone, now) === Number(profile.generation_hour);
    } catch {
      return false;
    }
  });

  const results: Array<{ workspaceId: string; status: "generated" | "existing" | "failed"; detail?: string }> = [];
  for (const profile of eligible) {
    const workspaceRelation = profile.workspaces as { name?: string } | { name?: string }[] | null;
    const workspaceName = Array.isArray(workspaceRelation)
      ? workspaceRelation[0]?.name
      : workspaceRelation?.name;
    if (!workspaceName) {
      results.push({ workspaceId: profile.workspace_id, status: "failed", detail: "Workspace name unavailable." });
      continue;
    }

    try {
      const generated = await generateDailyContentBatch({
        supabase: admin,
        workspaceId: profile.workspace_id,
        workspaceName,
        actorId: null,
        batchDate: localDate(profile.timezone, now),
      });
      results.push({
        workspaceId: profile.workspace_id,
        status: generated.reused ? "existing" : "generated",
      });
    } catch (workerError) {
      console.error("Content Engine daily generation failed safely", {
        workspaceId: profile.workspace_id,
        error: workerError,
      });
      results.push({
        workspaceId: profile.workspace_id,
        status: "failed",
        detail: workerError instanceof Error ? workerError.message : "Unknown generation failure.",
      });
    }
  }

  const failed = results.filter((result) => result.status === "failed").length;
  return NextResponse.json(
    {
      checkedAt: now.toISOString(),
      eligible: eligible.length,
      generated: results.filter((result) => result.status === "generated").length,
      existing: results.filter((result) => result.status === "existing").length,
      failed,
      results,
    },
    {
      status: failed ? 207 : 200,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

export const GET = handle;
export const POST = handle;
