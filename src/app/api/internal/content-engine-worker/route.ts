import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { publishFacebookJob } from "@/lib/content-engine-facebook";
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

type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>;

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function safeMatch(received: string, expected: string) {
  const actual = Buffer.from(received);
  const target = Buffer.from(expected);
  return actual.length === target.length && timingSafeEqual(actual, target);
}

async function authorize(request: Request, admin: AdminClient) {
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

async function appendWorkerEvent(
  admin: AdminClient,
  event: {
    workspaceId: string;
    batchId?: string | null;
    contentId: string;
    eventType: "publication_started" | "publication_published" | "publication_failed" | "publication_blocked";
    details?: Record<string, unknown>;
  },
) {
  const { error } = await admin.from("content_review_events").insert({
    workspace_id: event.workspaceId,
    batch_id: event.batchId ?? null,
    content_id: event.contentId,
    event_type: event.eventType,
    actor_id: null,
    details: event.details ?? {},
  });
  if (error) console.error("Content Engine worker could not append audit event", { event, error });
}

async function prepareOneInstagramAsset(admin: AdminClient) {
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
      if (draft.status === "approved") await promoteApprovedAssetForPublishing(draft.workspace_id, draft.id);
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

async function reconcileBlockedMeta(admin: AdminClient) {
  const { data: blocked, error } = await admin
    .from("content_publications")
    .select("id,workspace_id,content_id,status")
    .eq("provider", "meta")
    .eq("status", "blocked")
    .order("created_at", { ascending: true })
    .limit(40);
  if (error) throw new Error("Blocked Meta publications could not be scanned.");

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
        .select("status,metadata,selected_assets")
        .eq("workspace_id", item.workspace_id)
        .eq("provider", "meta")
        .maybeSingle(),
      admin
        .from("content_brand_profiles")
        .select("publishing_enabled")
        .eq("workspace_id", item.workspace_id)
        .maybeSingle(),
    ]);

    const channel = draftResult.data?.channel;
    if (draftResult.data?.status !== "approved" || !["instagram", "facebook"].includes(channel ?? "")) continue;
    if (process.env.CONTENT_PUBLISHING_ENABLED !== "true" || profileResult.data?.publishing_enabled !== true) continue;
    if (connectionResult.data?.status !== "connected") continue;

    const metadata = (connectionResult.data?.metadata ?? {}) as Record<string, unknown>;
    const capabilities = Array.isArray(metadata.verifiedCapabilities)
      ? metadata.verifiedCapabilities.map(String)
      : [];
    const assets = Array.isArray(connectionResult.data?.selected_assets)
      ? (connectionResult.data?.selected_assets as Array<Record<string, unknown>>)
      : [];

    const channelReady = channel === "instagram"
      ? capabilities.includes("instagram.publish")
        && assets.filter((asset) => asset.kind === "instagram_account" && asset.id && asset.page_id).length === 1
        && Boolean(assetResult.data?.public_url)
      : capabilities.includes("facebook.publish")
        && assets.filter((asset) => asset.kind === "facebook_page" && asset.id).length === 1;
    if (!channelReady) continue;

    const { data: requeuedRow, error: queueError } = await admin
      .from("content_publications")
      .update({ status: "queued", last_error: null, next_attempt_at: null, locked_at: null, lock_token: null })
      .eq("id", item.id)
      .eq("workspace_id", item.workspace_id)
      .eq("status", "blocked")
      .select("status")
      .maybeSingle();
    if (!queueError && requeuedRow?.status === "queued") requeued += 1;
  }

  return requeued;
}

function retryAt(attempts: number) {
  if (attempts >= 6) return null;
  const minutes = Math.min(360, 5 * 2 ** Math.max(0, attempts - 1));
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

async function blockClaimedJob(
  admin: AdminClient,
  job: PublicationJob,
  batchId: string | null,
  reason: string,
) {
  await admin
    .from("content_publications")
    .update({ status: "blocked", last_error: reason, locked_at: null, lock_token: null, next_attempt_at: null })
    .eq("id", job.id)
    .eq("workspace_id", job.workspace_id);
  await appendWorkerEvent(admin, {
    workspaceId: job.workspace_id,
    batchId,
    contentId: job.content_id,
    eventType: "publication_blocked",
    details: { provider: job.provider, reason, worker_guard: true },
  });
}

async function deliverClaimedJobs(admin: AdminClient) {
  const { data, error } = await admin.rpc("claim_content_publications", { max_jobs: 3 });
  if (error) throw new Error(`Publishing queue claim failed: ${error.message}`);
  const jobs = (data ?? []) as PublicationJob[];
  const results: Array<{ id: string; status: "published" | "failed" | "blocked"; detail?: string }> = [];

  for (const job of jobs) {
    const [{ data: draft }, { data: profile }] = await Promise.all([
      admin
        .from("content_drafts")
        .select("channel,status,batch_id")
        .eq("workspace_id", job.workspace_id)
        .eq("id", job.content_id)
        .maybeSingle(),
      admin
        .from("content_brand_profiles")
        .select("publishing_enabled")
        .eq("workspace_id", job.workspace_id)
        .maybeSingle(),
    ]);
    const batchId = draft?.batch_id ?? null;

    if (process.env.CONTENT_PUBLISHING_ENABLED !== "true") {
      const reason = "Deployment-wide Content Engine publishing is disabled.";
      await blockClaimedJob(admin, job, batchId, reason);
      results.push({ id: job.id, status: "blocked", detail: reason });
      continue;
    }
    if (profile?.publishing_enabled !== true) {
      const reason = "Workspace automatic publishing was turned off before delivery.";
      await blockClaimedJob(admin, job, batchId, reason);
      results.push({ id: job.id, status: "blocked", detail: reason });
      continue;
    }
    if (draft?.status !== "approved") {
      const reason = "Content is no longer founder-approved.";
      await blockClaimedJob(admin, job, batchId, reason);
      results.push({ id: job.id, status: "blocked", detail: reason });
      continue;
    }
    if (job.provider !== "meta" || !["instagram", "facebook"].includes(draft.channel)) {
      const reason = `No verified automatic publisher exists for ${draft?.channel || job.provider}.`;
      await blockClaimedJob(admin, job, batchId, reason);
      results.push({ id: job.id, status: "blocked", detail: reason });
      continue;
    }

    await appendWorkerEvent(admin, {
      workspaceId: job.workspace_id,
      batchId,
      contentId: job.content_id,
      eventType: "publication_started",
      details: { provider: job.provider, channel: draft.channel, attempt: job.attempts },
    });

    try {
      const published = draft.channel === "instagram"
        ? await publishInstagramJob(job)
        : await publishFacebookJob(job);
      const publishedAt = new Date().toISOString();
      const { error: saveError } = await admin
        .from("content_publications")
        .update({
          status: "published",
          provider_post_id: published.providerPostId,
          provider_post_url: published.providerPostUrl,
          provider_container_id: "containerId" in published ? published.containerId ?? job.provider_container_id : job.provider_container_id,
          published_at: publishedAt,
          locked_at: null,
          lock_token: null,
          next_attempt_at: null,
          last_error: null,
          provider_response: {
            confirmed: true,
            channel: draft.channel,
            account: "username" in published ? published.username ?? null : published.pageName ?? null,
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
      await appendWorkerEvent(admin, {
        workspaceId: job.workspace_id,
        batchId,
        contentId: job.content_id,
        eventType: "publication_published",
        details: { provider: job.provider, channel: draft.channel, provider_post_id: published.providerPostId, published_at: publishedAt },
      });
      results.push({ id: job.id, status: "published" });
    } catch (publishError) {
      const detail = publishError instanceof Error ? publishError.message.slice(0, 1500) : "Unknown publishing failure";
      console.error("Content Engine publishing failed safely", {
        publicationId: job.id,
        workspaceId: job.workspace_id,
        channel: draft.channel,
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
          provider_response: { failed_at: new Date().toISOString(), attempt: job.attempts, channel: draft.channel },
        })
        .eq("id", job.id)
        .eq("workspace_id", job.workspace_id);
      await appendWorkerEvent(admin, {
        workspaceId: job.workspace_id,
        batchId,
        contentId: job.content_id,
        eventType: "publication_failed",
        details: { provider: job.provider, channel: draft.channel, attempt: job.attempts, reason: detail, retry_at: retryAt(job.attempts) },
      });
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
    const requeued = await reconcileBlockedMeta(admin);
    const deliveries = await deliverClaimedJobs(admin);
    return NextResponse.json(
      {
        checkedAt: startedAt.toISOString(),
        media,
        requeued,
        claimed: deliveries.length,
        published: deliveries.filter((item) => item.status === "published").length,
        blocked: deliveries.filter((item) => item.status === "blocked").length,
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
