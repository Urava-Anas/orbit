import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { publishLinkedInJob } from "@/lib/content-engine-linkedin";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>;

type PublicationJob = {
  id: string;
  workspace_id: string;
  content_id: string;
  provider: string;
  provider_post_id: string | null;
  attempts: number;
};

type LinkedInAsset = { kind?: string; id?: string };

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function safeMatch(received: string, expected: string) {
  const actual = Buffer.from(received);
  const target = Buffer.from(expected);
  return actual.length === target.length && timingSafeEqual(actual, target);
}

function linkedinTextFormat(format: string | null | undefined) {
  return ["post", "text", "text post"].includes(String(format ?? "").trim().toLowerCase());
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

async function appendEvent(
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
  if (error) console.error("LinkedIn worker could not append Content Engine audit event", { eventType: event.eventType, error });
}

function retryAt(attempts: number) {
  if (attempts >= 6) return null;
  const minutes = Math.min(360, 5 * 2 ** Math.max(0, attempts - 1));
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

async function linkedinConnectionReady(admin: AdminClient, workspaceId: string) {
  const { data: connection, error } = await admin
    .from("integration_connections")
    .select("status,metadata,selected_assets")
    .eq("workspace_id", workspaceId)
    .eq("provider", "linkedin")
    .maybeSingle();
  if (error || connection?.status !== "connected") return false;

  const metadata = (connection.metadata ?? {}) as Record<string, unknown>;
  const capabilities = Array.isArray(metadata.verifiedCapabilities)
    ? metadata.verifiedCapabilities.map(String)
    : [];
  if (!capabilities.includes("linkedin.publish.member")) return false;

  const assets = Array.isArray(connection.selected_assets)
    ? (connection.selected_assets as LinkedInAsset[])
    : [];
  return assets.filter((asset) => asset.kind === "linkedin_member" && asset.id).length === 1;
}

async function reconcileBlockedLinkedIn(admin: AdminClient) {
  const { data: blocked, error } = await admin
    .from("content_publications")
    .select("id,workspace_id,content_id")
    .eq("provider", "linkedin")
    .eq("status", "blocked")
    .order("created_at", { ascending: true })
    .limit(40);
  if (error) throw new Error("Blocked LinkedIn publications could not be scanned.");

  let requeued = 0;
  for (const item of blocked ?? []) {
    const [{ data: draft }, { data: profile }, connectionReady] = await Promise.all([
      admin
        .from("content_drafts")
        .select("channel,status,format")
        .eq("workspace_id", item.workspace_id)
        .eq("id", item.content_id)
        .maybeSingle(),
      admin
        .from("content_brand_profiles")
        .select("publishing_enabled")
        .eq("workspace_id", item.workspace_id)
        .maybeSingle(),
      linkedinConnectionReady(admin, item.workspace_id),
    ]);

    if (process.env.CONTENT_PUBLISHING_ENABLED !== "true") continue;
    if (profile?.publishing_enabled !== true) continue;
    if (draft?.status !== "approved" || draft.channel !== "linkedin") continue;
    if (!linkedinTextFormat(draft.format)) continue;
    if (!connectionReady) continue;

    const { data: queued, error: queueError } = await admin
      .from("content_publications")
      .update({ status: "queued", last_error: null, next_attempt_at: null, locked_at: null, lock_token: null })
      .eq("id", item.id)
      .eq("workspace_id", item.workspace_id)
      .eq("status", "blocked")
      .select("status")
      .maybeSingle();
    if (!queueError && queued?.status === "queued") requeued += 1;
  }
  return requeued;
}

async function blockJob(admin: AdminClient, job: PublicationJob, batchId: string | null, reason: string) {
  await admin
    .from("content_publications")
    .update({ status: "blocked", last_error: reason, locked_at: null, lock_token: null, next_attempt_at: null })
    .eq("id", job.id)
    .eq("workspace_id", job.workspace_id);
  await appendEvent(admin, {
    workspaceId: job.workspace_id,
    batchId,
    contentId: job.content_id,
    eventType: "publication_blocked",
    details: { provider: "linkedin", channel: "linkedin", reason, worker_guard: true },
  });
}

async function deliver(admin: AdminClient) {
  const { data, error } = await admin.rpc("claim_content_linkedin_publications", { max_jobs: 3 });
  if (error) throw new Error(`LinkedIn queue claim failed: ${error.message}`);
  const jobs = (data ?? []) as PublicationJob[];
  const results: Array<{ id: string; status: "published" | "failed" | "blocked"; detail?: string }> = [];

  for (const job of jobs) {
    const [{ data: draft }, { data: profile }, connectionReady] = await Promise.all([
      admin
        .from("content_drafts")
        .select("channel,status,batch_id,format")
        .eq("workspace_id", job.workspace_id)
        .eq("id", job.content_id)
        .maybeSingle(),
      admin
        .from("content_brand_profiles")
        .select("publishing_enabled")
        .eq("workspace_id", job.workspace_id)
        .maybeSingle(),
      linkedinConnectionReady(admin, job.workspace_id),
    ]);
    const batchId = draft?.batch_id ?? null;

    let blockReason: string | null = null;
    if (process.env.CONTENT_PUBLISHING_ENABLED !== "true") blockReason = "Deployment-wide Content Engine publishing is disabled.";
    else if (profile?.publishing_enabled !== true) blockReason = "Workspace automatic publishing was turned off before delivery.";
    else if (draft?.status !== "approved") blockReason = "Content is no longer founder-approved.";
    else if (job.provider !== "linkedin" || draft.channel !== "linkedin") blockReason = "The LinkedIn worker received an unsupported provider/channel pair.";
    else if (!linkedinTextFormat(draft.format)) blockReason = "LinkedIn automatic delivery currently supports text posts only. Document or media concepts stay blocked.";
    else if (!connectionReady) blockReason = "LinkedIn member publishing capability is not currently verified.";

    if (blockReason) {
      await blockJob(admin, job, batchId, blockReason);
      results.push({ id: job.id, status: "blocked", detail: blockReason });
      continue;
    }

    await appendEvent(admin, {
      workspaceId: job.workspace_id,
      batchId,
      contentId: job.content_id,
      eventType: "publication_started",
      details: { provider: "linkedin", channel: "linkedin", attempt: job.attempts },
    });

    try {
      const published = await publishLinkedInJob(job);
      const publishedAt = new Date().toISOString();
      const { error: saveError } = await admin
        .from("content_publications")
        .update({
          status: "published",
          provider_post_id: published.providerPostId,
          provider_post_url: published.providerPostUrl,
          published_at: publishedAt,
          locked_at: null,
          lock_token: null,
          next_attempt_at: null,
          last_error: null,
          provider_response: {
            confirmed: true,
            channel: "linkedin",
            account: published.memberName,
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
      await appendEvent(admin, {
        workspaceId: job.workspace_id,
        batchId,
        contentId: job.content_id,
        eventType: "publication_published",
        details: { provider: "linkedin", channel: "linkedin", provider_post_id: published.providerPostId, published_at: publishedAt },
      });
      results.push({ id: job.id, status: "published" });
    } catch (publishError) {
      const detail = publishError instanceof Error ? publishError.message.slice(0, 1000) : "Unknown LinkedIn publishing failure";
      const nextAttemptAt = retryAt(job.attempts);
      console.error("Content Engine LinkedIn publishing failed safely", {
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
          next_attempt_at: nextAttemptAt,
          locked_at: null,
          lock_token: null,
          provider_response: { failed_at: new Date().toISOString(), attempt: job.attempts, channel: "linkedin" },
        })
        .eq("id", job.id)
        .eq("workspace_id", job.workspace_id);
      await appendEvent(admin, {
        workspaceId: job.workspace_id,
        batchId,
        contentId: job.content_id,
        eventType: "publication_failed",
        details: { provider: "linkedin", channel: "linkedin", attempt: job.attempts, reason: detail, retry_at: nextAttemptAt },
      });
      results.push({ id: job.id, status: "failed", detail });
    }
  }

  return results;
}

async function handle(request: Request) {
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Content Engine worker database is unavailable." }, { status: 503 });
  if (!(await authorize(request, admin))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const requeued = await reconcileBlockedLinkedIn(admin);
    const deliveries = await deliver(admin);
    return NextResponse.json({
      checkedAt: new Date().toISOString(),
      provider: "linkedin",
      requeued,
      claimed: deliveries.length,
      published: deliveries.filter((item) => item.status === "published").length,
      blocked: deliveries.filter((item) => item.status === "blocked").length,
      failed: deliveries.filter((item) => item.status === "failed").length,
      deliveries,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Content Engine LinkedIn worker failed safely", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Content Engine LinkedIn worker failed." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function POST(request: Request) {
  return handle(request);
}

export async function GET(request: Request) {
  return handle(request);
}
