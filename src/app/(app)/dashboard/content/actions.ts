"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  contentGenerationConfigured,
  generateDailyContentBatch,
  providerForChannel,
} from "@/lib/content-engine";
import { requireWorkspace } from "@/lib/workspace";

const contentPath = "/dashboard/content";
const idSchema = z.string().uuid();
type WorkspaceSupabase = Awaited<ReturnType<typeof requireWorkspace>>["supabase"];

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

function succeed(message: string): never {
  revalidatePath(contentPath);
  redirect(`${contentPath}?notice=${encodeURIComponent(message)}`);
}

async function requireContentAdmin() {
  const context = await requireWorkspace();
  if (context.role !== "owner" && context.role !== "admin") {
    fail("Founder or admin access is required for Content Engine approvals.");
  }
  return context;
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

export async function generateTodayBatch() {
  const { supabase, user, workspace } = await requireContentAdmin();
  if (!contentGenerationConfigured()) {
    fail("AI generation is not configured on the server yet. Add OPENAI_API_KEY to enable daily generation.");
  }

  try {
    const result = await generateDailyContentBatch({
      supabase,
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      actorId: user.id,
    });
    succeed(result.reused ? "Today’s batch already exists." : "Today’s content batch is ready for review.");
  } catch (error) {
    fail(error instanceof Error ? error.message : "Orbit could not generate today’s batch.");
  }
}

async function publicationReadiness(supabase: WorkspaceSupabase, workspaceId: string, channel: string) {
  const provider = providerForChannel(channel);
  if (provider === "manual" || provider === "website") {
    return { provider, ready: false, reason: "This channel needs a publishing adapter before automatic delivery." };
  }

  const { data: connection } = await supabase
    .from("integration_connections")
    .select("status")
    .eq("workspace_id", workspaceId)
    .eq("provider", provider)
    .maybeSingle();

  if (connection?.status !== "connected") {
    const label = provider === "meta" ? "Meta" : provider === "linkedin" ? "LinkedIn" : "TikTok";
    return { provider, ready: false, reason: `Connect ${label} in Plugins before auto-posting.` };
  }

  if (process.env.CONTENT_PUBLISHING_ENABLED !== "true") {
    return { provider, ready: false, reason: "Provider is connected, but the production publishing worker is not enabled." };
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
  const status = readiness.ready ? "queued" : "blocked";
  const { error } = await supabase.from("content_publications").upsert(
    {
      workspace_id: workspaceId,
      content_id: content.id,
      provider: readiness.provider,
      status,
      scheduled_for: content.scheduled_for,
      last_error: readiness.reason,
      idempotency_key: `${content.id}:${readiness.provider}`,
    },
    { onConflict: "workspace_id,content_id" },
  );
  if (error) throw new Error("Publishing queue could not be prepared.");

  await appendAuditEvent(supabase, {
    workspaceId,
    batchId: content.batch_id ?? null,
    contentId: content.id,
    eventType: readiness.ready ? "publication_queued" : "publication_blocked",
    actorId,
    details: {
      provider: readiness.provider,
      scheduled_for: content.scheduled_for,
      reason: readiness.reason,
    },
  });
  return readiness.ready;
}

export async function approveContentItem(formData: FormData) {
  const parsed = idSchema.safeParse(text(formData, "id"));
  if (!parsed.success) fail("Invalid content item.");

  const { supabase, user, workspace } = await requireContentAdmin();
  const { data: content, error: contentError } = await supabase
    .from("content_drafts")
    .select("id,channel,scheduled_for,batch_id")
    .eq("id", parsed.data)
    .eq("workspace_id", workspace.id)
    .single();

  if (contentError || !content) fail("Content item was not found.");
  const approvedAt = new Date().toISOString();
  const { error } = await supabase
    .from("content_drafts")
    .update({
      status: "approved",
      approved_at: approvedAt,
      approved_by: user.id,
      rejection_reason: null,
    })
    .eq("id", content.id)
    .eq("workspace_id", workspace.id);
  if (error) fail("Content item could not be approved.");

  await appendAuditEvent(supabase, {
    workspaceId: workspace.id,
    batchId: content.batch_id,
    contentId: content.id,
    eventType: "content_approved",
    actorId: user.id,
    details: { approved_at: approvedAt },
  });

  try {
    const ready = await upsertPublication(supabase, workspace.id, user.id, content);
    succeed(ready ? "Approved and added to the publishing queue." : "Approved. Auto-posting is blocked until its provider is ready.");
  } catch (queueError) {
    fail(queueError instanceof Error ? queueError.message : "Publishing queue could not be prepared.");
  }
}

export async function rejectContentItem(formData: FormData) {
  const parsed = z.object({ id: idSchema, reason: z.string().max(1000) }).safeParse({
    id: text(formData, "id"),
    reason: text(formData, "reason"),
  });
  if (!parsed.success) fail("Invalid content rejection.");

  const { supabase, workspace, user } = await requireContentAdmin();
  const reason = parsed.data.reason || "Rejected during daily founder review.";
  const { data: content } = await supabase
    .from("content_drafts")
    .select("batch_id")
    .eq("id", parsed.data.id)
    .eq("workspace_id", workspace.id)
    .maybeSingle();
  const { error } = await supabase
    .from("content_drafts")
    .update({
      status: "rejected",
      rejection_reason: reason,
      approved_at: null,
      approved_by: null,
    })
    .eq("id", parsed.data.id)
    .eq("workspace_id", workspace.id);
  if (error) fail("Content item could not be rejected.");

  await supabase
    .from("content_publications")
    .update({ status: "cancelled", last_error: "Content was rejected after review." })
    .eq("workspace_id", workspace.id)
    .eq("content_id", parsed.data.id);
  await appendAuditEvent(supabase, {
    workspaceId: workspace.id,
    batchId: content?.batch_id ?? null,
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
  const { data: content } = await supabase
    .from("content_drafts")
    .select("batch_id")
    .eq("id", parsed.data.id)
    .eq("workspace_id", workspace.id)
    .maybeSingle();
  const { error } = await supabase
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
    .eq("workspace_id", workspace.id);
  if (error) fail("Content edits could not be saved.");

  await supabase
    .from("content_publications")
    .update({ status: "cancelled", last_error: "Content changed after approval and requires re-approval." })
    .eq("workspace_id", workspace.id)
    .eq("content_id", parsed.data.id);
  await appendAuditEvent(supabase, {
    workspaceId: workspace.id,
    batchId: content?.batch_id ?? null,
    contentId: parsed.data.id,
    eventType: "content_edited",
    actorId: user.id,
    details: { approval_reset: true },
  });

  succeed("Edits saved. The item requires approval again.");
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

  const ids = items.map((item) => item.id);
  const approvedAt = new Date().toISOString();
  const { error: approvalError } = await supabase
    .from("content_drafts")
    .update({ status: "approved", approved_at: approvedAt, approved_by: user.id, rejection_reason: null })
    .in("id", ids)
    .eq("workspace_id", workspace.id);
  if (approvalError) fail("The batch could not be approved.");

  await supabase.from("content_review_events").insert(
    items.map((item) => ({
      workspace_id: workspace.id,
      batch_id: parsed.data,
      content_id: item.id,
      event_type: "content_approved",
      actor_id: user.id,
      details: { approved_at: approvedAt, approval_mode: "batch" },
    })),
  );

  let queueReady = 0;
  let queueBlocked = 0;
  for (const item of items) {
    try {
      if (await upsertPublication(supabase, workspace.id, user.id, item)) queueReady += 1;
      else queueBlocked += 1;
    } catch {
      queueBlocked += 1;
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
    },
  });

  succeed(
    queueBlocked
      ? `Daily batch approved. ${queueBlocked} item${queueBlocked === 1 ? " is" : "s are"} blocked until publishing connections are ready.`
      : "Daily batch approved and queued for automatic publishing.",
  );
}
