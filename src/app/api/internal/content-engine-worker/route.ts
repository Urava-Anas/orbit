import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { generateInstagramDraftAsset, promoteApprovedAssetForPublishing } from "@/lib/content-engine-media";
import { publishInstagramJob } from "@/lib/content-engine-instagram";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type PublicationJob = {
  id: string;
  workspace_id: string;
  content_id: string;
  provider: string;
  provider_post_id: string | null;
  provider_container_id: string | null;
  attempts: number;
  scheduled_for: string | null;
};

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function safeMatch(received: string, expected: string) {
  const actual = Buffer.from(received);
  const target = Buffer.from(expected);
  return actual.length === target.length && timingSafeEqual(actual, target);
}

async function authorize(request: Request, admin: NonNullable<ReturnType<typeof createAdminClient>>) {
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return false;
  const secret = header.slice("Bearer ".length).trim();
  if (!secret || secret.length > 512) return false;

  const { data, error } = await admin
    .from("content_worker_auth")
    .select("secret_hash")
    .eq("id", "publisher")
    .maybeSingle();
  if (error || !data?.secret_hash) return false;
  return safeMatch(sha256(secret), data.secret_hash);
}

async function prepareOneInstagramAsset(admin: NonNullable<ReturnType<typeof createAdminClient>>) {
  const { data: drafts, error } = await admin
    .from("content_drafts")
    .select("id,workspace_id,channel,format,title,hook,body,cta,media_brief,status,created_at")
    .eq("channel", "instagram")
    .in("status", ["draft", "review", "approved"])
    .order("created_at", { ascending: true })
    .limit(20);
  if (error) throw new Error("Instagram drafts could not be scanned for media generation.");

  for (const draft of drafts ?? []) {
    const { data: activeAsset } = await admin
      .from("content_assets")
      .select("id,status,public_url")
      .eq("workspace_id", draft.workspace_id)
      .eq("content_id", draft.id)
      .eq("source", "generated")
      .eq("asset_type", "image")
      .in("status", ["generating", "ready"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (activeAsset?.status === "generating") continue;
    if (activeAsset?.status === "ready") {
      if (draft.status === "approved" && !activeAsset.public_url) {
        await promoteApprovedAssetForPublishing(draft.workspace_id, draft.id);
        return { contentId: draft.id as string, status: "promoted" as const };
      }
      continue;
    }

    try {
      await generateInstagramDraftAsset(draft);
      if (draft.status === "approved") {
        await promoteApprovedAssetForPublishing(draft.workspace_id, draft.id);
      }
      return { contentId: draft.id as string, status: "generated" as const };
    } catch (generationError) {
      console.error("Content Engine Instagram media generation failed safely", {
        contentId: draft.id,
        workspaceId: draft.workspace_id,
        error: generationError,
      });
      return {
        contentId: draft.id as string,
        status: "failed" as const,
        detail: generationError instanceof Error ? generationError.message : "Unknown media generation failure",
      };
    }
  }

  return { contentId: null, status: "idle" as const };
}

async function reconcileBlockedInstagram(admin: NonNullable<ReturnType<typeof createAdminClient>>) {
  const { data: blocked, error } = await admin
    .from("content_publications")
    .select("id,workspace_id,content_id,status")
    .eq("provider", "meta")
    .eq("status", "blocked")
    .order("created_at", { ascending: true })
    .limit(30);
  if (error) throw new Error("Blocked Instagram publications could not be scanned.");

  let requeued = 0;
  for (const item of blocked ?? []) {
    const [draftResult, assetResult, connectionResult, profileResult] = await Promise.all([
      admin
        .from("content_drafts")
        .select("channel,status")
        .eq("workspace_id", item.workspace_id)
        .eq("id", item.content_id)
        .maybeSingle(),
      admin
        .from("content_assets")
        .select("id,public_url,status,asset_type")
        .eq("workspace_id", item.workspace_id)
        .eq("content_id", item.content_id)
        .eq("status", "ready")
        .eq("asset_type", "image")
        .not("public_url", "is", null)
        .limit(1)
        .maybeSingle(),
      admin
        .from("integration_connections")
        .select("status,metadata")
        .eq("workspace_id", item.workspace_id)
        .eq("provider", "meta")
        .maybeSingle(),
      admin
        .from("content_brand_profiles")
        .select("publishing_enabled")
        .eq("workspace_id", item.workspace_id)
        .maybeSingle(),
    ]);

    const capabilities = Array.isArray((connectionResult.data?.metadata as Record<string, unknown> | null)?.verifiedCapabilities)
      ? ((connectionResult.data?.metadata as Record<string, unknown>).verifiedCapabilities as unknown[]).map(String)
      : [];
    const ready =
      draftResult.data?.channel === "instagram" &&
      draftResult.data?.status === "approved" &&
      Boolean(assetResult.data?.public_url) &&
      connectionResult.data?.status === "connected" &&
      capabilities.includes("instagram.publish") &&
      profileResult.data?.publishing_enabled === true;

    if (!ready) continue;
    const { error: queueError } = await admin
      .from("content_publications")
      .update({ status: "queued", last_error: null, next_attempt_at: null, locked_at: null, lock_token: null })
      .eq("id", item.id)
      .eq("workspace_id", item.workspace_id)
      .eq("status", "blocked");
    if (!queueError) requeued += 1;
  }

  return requeued;
}

function retryAt(attempts: number) {
  if (attempts >= 6) return null;
  const minutes = Math.min(360, 5 * 2 ** Math.max(0, attempts - 1));
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

async function deliverClaimedJobs(admin: NonNullable<ReturnType<typeof createAdminClient>>) {
  const { data, error } = await admin.rpc("claim_content_publications", { max_jobs: 3 });
  if (error) throw new Error(`Publishing queue claim failed: ${error.message}`);
  const jobs = (data ?? []) as PublicationJob[];
  const results: Array<{ id: string; status: "published" | "failed"; detail?: string }> = [];

  for (const job of jobs) {
    try {
      if (job.provider !== "meta") throw new Error(`Unsupported provider: ${job.provider}`);
      const published = await publishInstagramJob(job);
      const publishedAt = new Date().toISOString();
      const { error: saveError } = await admin
        .from("content_publications")
        .update({
          status: "published",
          provider_post_id: published.providerPostId,
          provider_post_url: published.providerPostUrl,
          provider_container_id: published.containerId ?? job.provider_container_id,
          published_at: publishedAt,
          locked_at: null,
          lock_token: null,
          next_attempt_at: null,
          last_error: null,
          provider_response: {
            confirmed: true,
            username: published.username ?? null,
            reused: published.reused,
            confirmed_at: publishedAt,
          },
        })
        .eq("id", job.id)
        .eq("workspace_id", job.workspace_id);
      if (saveError) throw new Error(`Published state could not be saved: ${saveError.message}`);

      await admin
        .from("content_drafts")
        .update({ status: "published" })
        .eq("id", job.content_id)
        .eq("workspace_id", job.workspace_id);
      results.push({ id: job.id, status: "published" });
    } catch (publishError) {
      const detail = publishError instanceof Error ? publishError.message.slice(0, 1500) : "Unknown publishing failure";
      console.error("Content Engine Instagram publishing failed safely", {
        publicationId: job.id,
        workspaceId: job.workspace_id,
        attempts: job.attempts,
        error: publishError,
      });
      await admin
        .from("content_publications")
        .update({
          status: "failed",
          last_error: detail,
          next_attempt_at: retryAt(job.attempts),
          locked_at: null,
          lock_token: null,
          provider_response: { failed_at: new Date().toISOString(), attempt: job.attempts },
        })
        .eq("id", job.id)
        .eq("workspace_id", job.workspace_id);
      results.push({ id: job.id, status: "failed", detail });
    }
  }

  return results;
}

async function handle(request: Request) {
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Content Engine worker database is unavailable." }, { status: 503 });
  }
  if (!(await authorize(request, admin))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  const startedAt = new Date();
  try {
    const media = await prepareOneInstagramAsset(admin);
    const requeued = await reconcileBlockedInstagram(admin);
    const deliveries = await deliverClaimedJobs(admin);
    return NextResponse.json(
      {
        checkedAt: startedAt.toISOString(),
        media,
        requeued,
        claimed: deliveries.length,
        published: deliveries.filter((item) => item.status === "published").length,
        failed: deliveries.filter((item) => item.status === "failed").length,
        deliveries,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Content Engine worker failed safely", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Content Engine worker failed." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export const GET = handle;
export const POST = handle;
