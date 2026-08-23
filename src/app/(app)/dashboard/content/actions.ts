"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  contentGenerationConfigured,
  generateDailyContentBatch,
  providerForChannel,
} from "@/lib/content-engine";
import { promoteApprovedAssetForPublishing } from "@/lib/content-engine-media";
import { requireWorkspace } from "@/lib/workspace";

const contentPath = "/dashboard/content";
const contentSettingsPath = "/dashboard/content/settings";
const idSchema = z.string().uuid();
type WorkspaceSupabase = Awaited<ReturnType<typeof requireWorkspace>>["supabase"];

type MetaAsset = {
  kind?: string;
  id?: string;
  page_id?: string | null;
};

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function lines(value: string) {
  return value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function fail(message: string): never {
  redirect(`${contentPath}?error=${encodeURIComponent(message)}`);
}

function failSettings(message: string): never {
  redirect(`${contentSettingsPath}?error=${encodeURIComponent(message)}`);
}

function succeed(message: string): never {
  revalidatePath(contentPath);
  revalidatePath(`${contentPath}/calendar`);
  revalidatePath(`${contentPath}/library`);
  revalidatePath(`${contentPath}/activity`);
  revalidatePath(contentSettingsPath);
  redirect(`${contentPath}?notice=${encodeURIComponent(message)}`);
}

function succeedSettings(message: string): never {
  revalidatePath(contentPath);
  revalidatePath(contentSettingsPath);
  revalidatePath(`${contentPath}/activity`);
  redirect(`${contentSettingsPath}?notice=${encodeURIComponent(message)}`);
}

async function requireContentAdmin() {
  const context = await requireWorkspace();
  if (context.role !== "owner" && context.role !== "admin") {
    fail("Founder or admin access is required for Content Engine approvals.");
  }
  return context;
}

function isReviewState(status: string) {
  return status === "review" || status === "draft";
}

async function appendAuditEvent(
  supabase: WorkspaceSupabase,
  event: {
    workspaceId: string;
    batchId?: string | null;
    contentId?: string | null;
    eventType:
      | "batch_approved"
      | "content_edited"
      | "content_approved"
      | "content_rejected"
      | "publication_blocked"
      | "publication_queued"
      | "brand_brain_updated";
    actorId: string | null;
    details?: Record<string, unknown>;
  },
) {
  const { error } = await supabase.from("content_review_events").insert({
    workspace_id: event.workspaceId,
    batch_id: event.batchId ?? null,
    content_id: event.contentId ?? null,
    event_type: event.eventType,
    actor_id: event.actorId,
    details: event.details ?? {},
  });
  if (error) {
    console.error("Content Engine could not append an audit event", {
      eventType: event.eventType,
      workspaceId: event.workspaceId,
      contentId: event.contentId,
      error,
    });
  }
}

async function readyGeneratedImageIds(
  supabase: WorkspaceSupabase,
  workspaceId: string,
  contentIds: string[],
) {
  if (!contentIds.length) return new Set<string>();
  const { data, error } = await supabase
    .from("content_assets")
    .select("content_id")
    .eq("workspace_id", workspaceId)
    .eq("source", "generated")
    .eq("asset_type", "image")
    .eq("status", "ready")
    .in("content_id", contentIds);
  if (error) throw new Error("Generated visual readiness could not be verified.");
  return new Set((data ?? []).map((item) => String(item.content_id)));
}

async function archiveGeneratedVisuals(
  supabase: WorkspaceSupabase,
  workspaceId: string,
  contentId: string,
) {
  const { error } = await supabase
    .from("content_assets")
    .update({ status: "archived" })
    .eq("workspace_id", workspaceId)
    .eq("content_id", contentId)
    .eq("source", "generated")
    .eq("asset_type", "image")
    .in("status", ["pending", "generating", "ready"]);
  if (error) throw new Error("The old generated visual could not be invalidated safely.");
}

export async function saveBrandBrain(formData: FormData) {
  const parsed = z
    .object({
      audience: z.string().min(2).max(1500),
      voice: z.string().min(2).max(1500),
      pillars: z.string().max(3000),
      offers: z.string().max(3000),
      proofRules: z.string().min(10).max(3000),
      defaultCta: z.string().min(2).max(500),
      timezone: z.string().min(2).max(80),
      dailyTargetCount: z.coerce.number().int().min(1).max(20),
      dailyGenerationEnabled: z.boolean(),
    })
    .safeParse({
      audience: text(formData, "audience"),
      voice: text(formData, "voice"),
      pillars: text(formData, "pillars"),
      offers: text(formData, "offers"),
      proofRules: text(formData, "proofRules"),
      defaultCta: text(formData, "defaultCta"),
      timezone: text(formData, "timezone"),
      dailyTargetCount: text(formData, "dailyTargetCount") || "5",
      dailyGenerationEnabled: formData.get("dailyGenerationEnabled") === "on",
    });

  if (!parsed.success) fail("Check Brand Brain fields and try again.");
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: parsed.data.timezone }).format();
  } catch {
    fail("Use a valid IANA timezone such as Asia/Karachi.");
  }

  const { supabase, workspace, user } = await requireContentAdmin();
  const { error } = await supabase.from("content_brand_profiles").upsert(
    {
      workspace_id: workspace.id,
      audience: parsed.data.audience,
      voice: parsed.data.voice,
      pillars: lines(parsed.data.pillars),
      offers: lines(parsed.data.offers),
      proof_rules: parsed.data.proofRules,
      default_cta: parsed.data.defaultCta,
      timezone: parsed.data.timezone,
      daily_target_count: parsed.data.dailyTargetCount,
      daily_generation_enabled: parsed.data.dailyGenerationEnabled,
      generation_hour: 6,
      approval_required: true,
    },
    { onConflict: "workspace_id" },
  );

  if (error) fail("Orbit could not save Brand Brain.");
  await appendAuditEvent(supabase, {
    workspaceId: workspace.id,
    eventType: "brand_brain_updated",
    actorId: user.id,
    details: {
      timezone: parsed.data.timezone,
      daily_target_count: parsed.data.dailyTargetCount,
      daily_generation_enabled: parsed.data.dailyGenerationEnabled,
      approval_required: true,
    },
  });
  succeed("Brand Brain saved. Future batches will use these rules.");
}

export async function setPublishingMode(formData: FormData) {
  const enabled = formData.get("publishingEnabled") === "on";
  const context = await requireWorkspace();
  if (context.role !== "owner" && context.role !== "admin") {
    failSettings("Founder or admin access is required to change publishing mode.");
  }
  const { supabase, workspace, user } = context;

  const { data: profile, error: profileError } = await supabase
    .from("content_brand_profiles")
    .select("workspace_id")
    .eq("workspace_id", workspace.id)
    .maybeSingle();
  if (profileError) failSettings("Publishing settings could not be loaded.");
  if (!profile) failSettings("Save Brand Brain before enabling automatic publishing.");

  const { error } = await supabase
    .from("content_brand_profiles")
    .update({ publishing_enabled: enabled })
    .eq("workspace_id", workspace.id);
  if (error) failSettings("Publishing mode could not be changed.");

  if (!enabled) {
    await supabase
      .from("content_publications")
      .update({ status: "blocked", last_error: "Automatic publishing was turned off by a workspace admin." })
      .eq("workspace_id", workspace.id)
      .in("status", ["queued", "failed"]);
  }

  await appendAuditEvent(supabase, {
    workspaceId: workspace.id,
    eventType: "brand_brain_updated",
    actorId: user.id,
    details: { publishing_enabled: enabled, setting: "publishing_kill_switch" },
  });

  succeedSettings(enabled ? "Automatic publishing is armed behind provider and safety checks." : "Automatic publishing is off. Approved content will remain safely blocked.");
}

export async function generateTodayBatch() {
  const { supabase, user, workspace } = await requireContentAdmin();
  if (!contentGenerationConfigured()) {
    fail("AI generation is not configured on the server yet. Add OPENAI_API_KEY to enable daily generation.");
  }

  let message = "Today’s content batch is ready for review.";
  try {
    const result = await generateDailyContentBatch({
      supabase,
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      actorId: user.id,
    });
    if (result.reused) message = "Today’s batch already exists.";
  } catch (error) {
    fail(error instanceof Error ? error.message : "Orbit could not generate today’s batch.");
  }
  succeed(message);
}

function requiredCapability(channel: string) {
  if (channel === "instagram") return "instagram.publish";
  if (channel === "facebook") return "facebook.publish";
  return null;
}

function supportedAutomaticChannel(channel: string) {
  return channel === "instagram" || channel === "facebook";
}

async function publicationReadiness(supabase: WorkspaceSupabase, workspaceId: string, channel: string) {
  const provider = providerForChannel(channel);
  const capability = requiredCapability(channel);

  if (!supportedAutomaticChannel(channel) || provider !== "meta" || !capability) {
    return {
      provider,
      ready: false,
      reason: `${channel === "linkedin" ? "LinkedIn" : channel === "tiktok" ? "TikTok" : "This channel"} automatic publishing is not verified yet. The approved item stays in Content Library for controlled distribution.`,
    };
  }

  if (process.env.CONTENT_PUBLISHING_ENABLED !== "true") {
    return { provider, ready: false, reason: "The deployment-wide publishing master switch is off." };
  }

  const [{ data: profile }, { data: connection }] = await Promise.all([
    supabase
      .from("content_brand_profiles")
      .select("publishing_enabled")
      .eq("workspace_id", workspaceId)
      .maybeSingle(),
    supabase
      .from("integration_connections")
      .select("status,metadata,selected_assets")
      .eq("workspace_id", workspaceId)
      .eq("provider", provider)
      .maybeSingle(),
  ]);

  if (profile?.publishing_enabled !== true) {
    return { provider, ready: false, reason: "Automatic publishing is off in Content Engine settings." };
  }

  if (connection?.status !== "connected") {
    return { provider, ready: false, reason: "Connect Meta in Plugins before automatic publishing." };
  }

  const metadata = (connection.metadata ?? {}) as Record<string, unknown>;
  const capabilities = Array.isArray(metadata.verifiedCapabilities)
    ? metadata.verifiedCapabilities.map(String)
    : [];
  if (!capabilities.includes(capability)) {
    return { provider, ready: false, reason: `Meta has not verified the ${capability} capability. Reconnect the account after permissions are approved.` };
  }

  const assets = Array.isArray(connection.selected_assets) ? (connection.selected_assets as MetaAsset[]) : [];
  if (channel === "instagram") {
    const instagramAccounts = assets.filter((asset) => asset.kind === "instagram_account" && asset.id && asset.page_id);
    if (instagramAccounts.length !== 1) {
      return { provider, ready: false, reason: instagramAccounts.length ? "Select exactly one Instagram Professional account for publishing." : "No publishable Instagram Professional account is selected." };
    }
  }
  if (channel === "facebook") {
    const pages = assets.filter((asset) => asset.kind === "facebook_page" && asset.id);
    if (pages.length !== 1) {
      return { provider, ready: false, reason: pages.length ? "Select exactly one Facebook Page for publishing." : "No publishable Facebook Page is selected." };
    }
  }

  return { provider, ready: true, reason: null };
}

async function upsertPublication(
  supabase: WorkspaceSupabase,
  workspaceId: string,
  actorId: string | null,
  content: { id: string; channel: string; scheduled_for: string | null; batch_id?: string | null },
) {
  const readiness = await publicationReadiness(supabase, workspaceId, content.channel);
  const requestedStatus = readiness.ready ? "queued" : "blocked";
  const { data: publication, error } = await supabase.from("content_publications").upsert(
    {
      workspace_id: workspaceId,
      content_id: content.id,
      provider: readiness.provider,
      status: requestedStatus,
      scheduled_for: content.scheduled_for,
      last_error: readiness.reason,
      idempotency_key: `${content.id}:${readiness.provider}`,
    },
    { onConflict: "workspace_id,content_id" },
  ).select("status,last_error").single();
  if (error || !publication) throw new Error("Publishing queue could not be prepared.");

  const actuallyQueued = publication.status === "queued";
  const reason = actuallyQueued ? null : publication.last_error || readiness.reason || "A publishing guard blocked this item.";
  await appendAuditEvent(supabase, {
    workspaceId,
    batchId: content.batch_id ?? null,
    contentId: content.id,
    eventType: actuallyQueued ? "publication_queued" : "publication_blocked",
    actorId,
    details: {
      provider: readiness.provider,
      channel: content.channel,
      scheduled_for: content.scheduled_for,
      reason,
    },
  });
  return actuallyQueued;
}

export async function approveContentItem(formData: FormData) {
  const parsed = idSchema.safeParse(text(formData, "id"));
  if (!parsed.success) fail("Invalid content item.");

  const { supabase, user, workspace } = await requireContentAdmin();
  const { data: content, error: contentError } = await supabase
    .from("content_drafts")
    .select("id,channel,scheduled_for,batch_id,status")
    .eq("id", parsed.data)
    .eq("workspace_id", workspace.id)
    .single();

  if (contentError || !content) fail("Content item was not found.");
  if (!isReviewState(content.status)) fail("Only content awaiting review can be approved.");
  if (content.channel === "instagram") {
    try {
      const readyIds = await readyGeneratedImageIds(supabase, workspace.id, [content.id]);
      if (!readyIds.has(content.id)) {
        fail("Instagram approval is locked until its generated visual is ready for founder review.");
      }
    } catch (assetError) {
      fail(assetError instanceof Error ? assetError.message : "Instagram visual readiness could not be verified.");
    }
  }

  const approvedAt = new Date().toISOString();
  const { data: approved, error } = await supabase
    .from("content_drafts")
    .update({ status: "approved", approved_at: approvedAt, approved_by: user.id, rejection_reason: null })
    .eq("id", content.id)
    .eq("workspace_id", workspace.id)
    .in("status", ["review", "draft"])
    .select("id")
    .maybeSingle();
  if (error || !approved) fail("Content item changed during review. Reload it before approving.");

  if (content.channel === "instagram") {
    try {
      await promoteApprovedAssetForPublishing(workspace.id, content.id);
    } catch (promotionError) {
      await supabase
        .from("content_drafts")
        .update({ status: "review", approved_at: null, approved_by: null })
        .eq("workspace_id", workspace.id)
        .eq("id", content.id)
        .eq("status", "approved");
      fail(promotionError instanceof Error ? promotionError.message : "Instagram visual could not be prepared for publishing.");
    }
  }

  await appendAuditEvent(supabase, {
    workspaceId: workspace.id,
    batchId: content.batch_id,
    contentId: content.id,
    eventType: "content_approved",
    actorId: user.id,
    details: { approved_at: approvedAt, visual_review_required: content.channel === "instagram" },
  });

  let ready = false;
  try {
    ready = await upsertPublication(supabase, workspace.id, user.id, content);
  } catch (queueError) {
    fail(queueError instanceof Error ? queueError.message : "Publishing queue could not be prepared.");
  }
  succeed(ready ? "Approved and added to the publishing queue." : "Approved. The item is safely blocked until its publishing rail is ready.");
}

export async function rejectContentItem(formData: FormData) {
  const parsed = z.object({ id: idSchema, reason: z.string().max(1000) }).safeParse({
    id: text(formData, "id"),
    reason: text(formData, "reason"),
  });
  if (!parsed.success) fail("Invalid content rejection.");

  const { supabase, workspace, user } = await requireContentAdmin();
  const reason = parsed.data.reason || "Rejected during daily founder review.";
  const { data: content, error: contentError } = await supabase
    .from("content_drafts")
    .select("batch_id,status")
    .eq("id", parsed.data.id)
    .eq("workspace_id", workspace.id)
    .maybeSingle();
  if (contentError || !content) fail("Content item was not found.");
  if (!isReviewState(content.status)) fail("Only content awaiting review can be rejected.");

  const { data: rejected, error } = await supabase
    .from("content_drafts")
    .update({ status: "rejected", rejection_reason: reason, approved_at: null, approved_by: null })
    .eq("id", parsed.data.id)
    .eq("workspace_id", workspace.id)
    .in("status", ["review", "draft"])
    .select("id")
    .maybeSingle();
  if (error || !rejected) fail("Content item changed during review. Reload it before rejecting.");

  await supabase
    .from("content_publications")
    .update({ status: "cancelled", last_error: "Content was rejected after review." })
    .eq("workspace_id", workspace.id)
    .eq("content_id", parsed.data.id);
  await appendAuditEvent(supabase, {
    workspaceId: workspace.id,
    batchId: content.batch_id,
    contentId: parsed.data.id,
    eventType: "content_rejected",
    actorId: user.id,
    details: { reason },
  });
  succeed("Content rejected. It will not enter the publishing queue.");
}

export async function updateContentItem(formData: FormData) {
  const parsed = z
    .object({
      id: idSchema,
      title: z.string().min(2).max(180),
      hook: z.string().max(500),
      body: z.string().min(10).max(8000),
      cta: z.string().max(500),
      mediaBrief: z.string().max(1500),
    })
    .safeParse({
      id: text(formData, "id"),
      title: text(formData, "title"),
      hook: text(formData, "hook"),
      body: text(formData, "body"),
      cta: text(formData, "cta"),
      mediaBrief: text(formData, "mediaBrief"),
    });
  if (!parsed.success) fail("Check the content edits and try again.");

  const { supabase, workspace, user } = await requireContentAdmin();
  const { data: content, error: contentError } = await supabase
    .from("content_drafts")
    .select("batch_id,status")
    .eq("id", parsed.data.id)
    .eq("workspace_id", workspace.id)
    .maybeSingle();
  if (contentError || !content) fail("Content item was not found.");
  if (!isReviewState(content.status)) fail("Approved or published content cannot be edited in place. Create a new revision instead.");

  try {
    await archiveGeneratedVisuals(supabase, workspace.id, parsed.data.id);
  } catch (archiveError) {
    fail(archiveError instanceof Error ? archiveError.message : "The old generated visual could not be invalidated safely.");
  }

  const { data: updated, error } = await supabase
    .from("content_drafts")
    .update({
      title: parsed.data.title,
      hook: parsed.data.hook || null,
      body: parsed.data.body,
      cta: parsed.data.cta || null,
      media_brief: parsed.data.mediaBrief || null,
      status: "review",
      approved_at: null,
      approved_by: null,
    })
    .eq("id", parsed.data.id)
    .eq("workspace_id", workspace.id)
    .in("status", ["review", "draft"])
    .select("id")
    .maybeSingle();
  if (error || !updated) fail("Content item changed while you were editing it. Reload before trying again.");

  await supabase
    .from("content_publications")
    .update({ status: "cancelled", last_error: "Content changed before approval." })
    .eq("workspace_id", workspace.id)
    .eq("content_id", parsed.data.id);
  await appendAuditEvent(supabase, {
    workspaceId: workspace.id,
    batchId: content.batch_id,
    contentId: parsed.data.id,
    eventType: "content_edited",
    actorId: user.id,
    details: { approval_reset: true, generated_visual_invalidated: true },
  });
  succeed("Edits saved. The item and its generated visual require review again.");
}

export async function approveDailyBatch(formData: FormData) {
  const parsed = idSchema.safeParse(text(formData, "batchId"));
  if (!parsed.success) fail("Invalid daily batch.");

  const { supabase, user, workspace } = await requireContentAdmin();
  const { data: items, error: itemError } = await supabase
    .from("content_drafts")
    .select("id,channel,scheduled_for,status,batch_id")
    .eq("workspace_id", workspace.id)
    .eq("batch_id", parsed.data)
    .in("status", ["review", "draft"])
    .order("sort_order", { ascending: true });
  if (itemError) fail("Today’s batch could not be loaded.");
  if (!items?.length) fail("There are no pending items left to approve.");

  const instagramIds = items.filter((item) => item.channel === "instagram").map((item) => item.id);
  if (instagramIds.length) {
    try {
      const readyIds = await readyGeneratedImageIds(supabase, workspace.id, instagramIds);
      const missing = instagramIds.filter((id) => !readyIds.has(id));
      if (missing.length) {
        fail(`${missing.length} Instagram visual${missing.length === 1 ? " is" : "s are"} still being prepared. Review every visual before approving the day.`);
      }
    } catch (assetError) {
      fail(assetError instanceof Error ? assetError.message : "Instagram visual readiness could not be verified.");
    }
  }

  const ids = items.map((item) => item.id);
  const approvedAt = new Date().toISOString();
  const { data: approvedRows, error: approvalError } = await supabase
    .from("content_drafts")
    .update({ status: "approved", approved_at: approvedAt, approved_by: user.id, rejection_reason: null })
    .in("id", ids)
    .eq("workspace_id", workspace.id)
    .in("status", ["review", "draft"])
    .select("id");
  if (approvalError) fail("The batch could not be approved.");
  if ((approvedRows?.length ?? 0) !== ids.length) {
    fail("One or more content items changed during review. Reload the batch before approving the day.");
  }

  try {
    for (const contentId of instagramIds) {
      await promoteApprovedAssetForPublishing(workspace.id, contentId);
    }
  } catch (promotionError) {
    await supabase
      .from("content_drafts")
      .update({ status: "review", approved_at: null, approved_by: null })
      .in("id", ids)
      .eq("workspace_id", workspace.id)
      .eq("status", "approved");
    fail(promotionError instanceof Error ? promotionError.message : "One or more Instagram visuals could not be prepared for publishing.");
  }

  const { error: eventError } = await supabase.from("content_review_events").insert(
    items.map((item) => ({
      workspace_id: workspace.id,
      batch_id: parsed.data,
      content_id: item.id,
      event_type: "content_approved",
      actor_id: user.id,
      details: { approved_at: approvedAt, approval_mode: "batch", visual_review_required: item.channel === "instagram" },
    })),
  );
  if (eventError) console.error("Batch approval events could not be appended", eventError);

  let queueReady = 0;
  let queueBlocked = 0;
  for (const item of items) {
    try {
      if (await upsertPublication(supabase, workspace.id, user.id, item)) queueReady += 1;
      else queueBlocked += 1;
    } catch (error) {
      console.error("Content Engine could not prepare a batch publication", { contentId: item.id, error });
      queueBlocked += 1;
      await appendAuditEvent(supabase, {
        workspaceId: workspace.id,
        batchId: parsed.data,
        contentId: item.id,
        eventType: "publication_blocked",
        actorId: user.id,
        details: { reason: error instanceof Error ? error.message : "Publishing queue preparation failed." },
      });
    }
  }

  const batchStatus = queueReady === items.length ? "scheduled" : "approved";
  await supabase
    .from("content_batches")
    .update({ status: batchStatus, approved_at: approvedAt, approved_by: user.id })
    .eq("workspace_id", workspace.id)
    .eq("id", parsed.data);
  await appendAuditEvent(supabase, {
    workspaceId: workspace.id,
    batchId: parsed.data,
    eventType: "batch_approved",
    actorId: user.id,
    details: {
      approved_at: approvedAt,
      item_count: items.length,
      queue_ready: queueReady,
      queue_blocked: queueBlocked,
      batch_status: batchStatus,
      instagram_visuals_reviewed: instagramIds.length,
    },
  });

  succeed(
    queueBlocked
      ? `Daily batch approved. ${queueBlocked} item${queueBlocked === 1 ? " is" : "s are"} safely blocked until its publishing rail is ready.`
      : "Daily batch approved and queued for automatic publishing.",
  );
}
