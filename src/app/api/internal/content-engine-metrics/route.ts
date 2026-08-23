import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { captureInstagramMediaInsights } from "@/lib/content-engine-instagram-insights";
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
  const { data, error } = await admin.from("content_worker_auth").select("secret_hash").eq("id", "publisher").maybeSingle();
  return !error && Boolean(data?.secret_hash) && safeMatch(sha256(secret), data!.secret_hash);
}

async function handle(request: Request) {
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Metrics worker database is unavailable." }, { status: 503 });
  if (!(await authorized(request, admin))) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });

  const staleBefore = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
  const publishedSince = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: publications, error } = await admin
    .from("content_publications")
    .select("id,workspace_id,content_id,provider_post_id,published_at")
    .eq("provider", "meta")
    .eq("status", "published")
    .not("provider_post_id", "is", null)
    .gte("published_at", publishedSince)
    .order("published_at", { ascending: false })
    .limit(40);
  if (error) return NextResponse.json({ error: "Published Meta items could not be loaded." }, { status: 500, headers: { "Cache-Control": "no-store" } });

  const results: Array<{ publicationId: string; status: "captured" | "fresh" | "skipped" | "failed"; detail?: string }> = [];
  for (const publication of publications ?? []) {
    const { data: draft } = await admin
      .from("content_drafts")
      .select("channel")
      .eq("workspace_id", publication.workspace_id)
      .eq("id", publication.content_id)
      .maybeSingle();
    if (draft?.channel !== "instagram") {
      results.push({ publicationId: publication.id, status: "skipped", detail: "No verified insights adapter exists for this channel yet." });
      continue;
    }

    const { data: latest } = await admin
      .from("content_metric_snapshots")
      .select("captured_at")
      .eq("workspace_id", publication.workspace_id)
      .eq("publication_id", publication.id)
      .order("captured_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latest?.captured_at && latest.captured_at > staleBefore) {
      results.push({ publicationId: publication.id, status: "fresh" });
      continue;
    }

    try {
      await captureInstagramMediaInsights({
        workspaceId: publication.workspace_id,
        contentId: publication.content_id,
        publicationId: publication.id,
        providerPostId: publication.provider_post_id as string,
      });
      results.push({ publicationId: publication.id, status: "captured" });
    } catch (metricError) {
      const detail = metricError instanceof Error ? metricError.message.slice(0, 1000) : "Unknown metrics failure";
      console.error("Instagram metric capture failed safely", { publicationId: publication.id, error: metricError });
      results.push({ publicationId: publication.id, status: "failed", detail });
    }

    if (results.filter((item) => item.status === "captured").length >= 10) break;
  }

  return NextResponse.json(
    {
      checkedAt: new Date().toISOString(),
      captured: results.filter((item) => item.status === "captured").length,
      fresh: results.filter((item) => item.status === "fresh").length,
      skipped: results.filter((item) => item.status === "skipped").length,
      failed: results.filter((item) => item.status === "failed").length,
      results,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export const GET = handle;
export const POST = handle;
