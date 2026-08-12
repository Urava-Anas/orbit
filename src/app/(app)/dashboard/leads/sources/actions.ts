"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireWorkspace } from "@/lib/workspace";

const sourceSlugs = ["website", "google", "instagram", "linkedin", "facebook", "youtube", "referrals", "cold-list"] as const;
const assetTypes = ["website", "account", "profile", "page", "business_profile", "list", "referral_program", "link"] as const;
const statuses = ["active", "paused", "disconnected"] as const;
const trackingStatuses = ["connected", "manual", "unverified", "error"] as const;
const idSchema = z.string().uuid();

const assetSchema = z.object({
  source: z.enum(sourceSlugs),
  name: z.string().min(2).max(160),
  assetType: z.enum(assetTypes),
  url: z.string().url().max(1000).or(z.literal("")),
  handle: z.string().max(160),
  externalId: z.string().max(300),
  status: z.enum(statuses),
  trackingStatus: z.enum(trackingStatuses),
  notes: z.string().max(2000),
  isPrimary: z.boolean(),
});

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function optional(input: string) {
  return input || null;
}

function sourcePath(source: string) {
  return `/dashboard/leads/sources/${encodeURIComponent(source)}`;
}

function fail(source: string, message: string): never {
  redirect(`${sourcePath(source)}?error=${encodeURIComponent(message)}`);
}

function succeed(source: string, message: string): never {
  revalidatePath("/dashboard/leads");
  revalidatePath(sourcePath(source));
  redirect(`${sourcePath(source)}?notice=${encodeURIComponent(message)}`);
}

function parseAsset(formData: FormData) {
  return assetSchema.safeParse({
    source: value(formData, "source"),
    name: value(formData, "name"),
    assetType: value(formData, "assetType"),
    url: value(formData, "url"),
    handle: value(formData, "handle"),
    externalId: value(formData, "externalId"),
    status: value(formData, "status") || "active",
    trackingStatus: value(formData, "trackingStatus") || "manual",
    notes: value(formData, "notes"),
    isPrimary: formData.get("isPrimary") === "on",
  });
}

function payload(data: z.infer<typeof assetSchema>) {
  return {
    source_slug: data.source,
    asset_type: data.assetType,
    name: data.name,
    url: optional(data.url),
    handle: optional(data.handle),
    external_id: optional(data.externalId),
    status: data.status,
    tracking_status: data.trackingStatus,
    is_primary: data.isPrimary,
    notes: optional(data.notes),
  };
}

async function clearPrimary(supabase: Awaited<ReturnType<typeof requireWorkspace>>["supabase"], workspaceId: string, source: string) {
  const { error } = await supabase
    .from("lead_source_assets")
    .update({ is_primary: false })
    .eq("workspace_id", workspaceId)
    .eq("source_slug", source)
    .eq("is_primary", true);
  return error;
}

export async function createLeadSourceAsset(formData: FormData) {
  const parsed = parseAsset(formData);
  const source = value(formData, "source");
  if (!parsed.success) fail(source || "website", "Check the source details and try again.");

  const { supabase, user, workspace } = await requireWorkspace();
  if (parsed.data.isPrimary) {
    const error = await clearPrimary(supabase, workspace.id, parsed.data.source);
    if (error) fail(parsed.data.source, "Orbit could not update the primary source.");
  }

  const { error } = await supabase.from("lead_source_assets").insert({
    workspace_id: workspace.id,
    ...payload(parsed.data),
    created_by: user.id,
  });
  if (error) fail(parsed.data.source, error.code === "23505" ? "That source link is already managed here." : "Orbit could not add this source.");
  succeed(parsed.data.source, "Source account added.");
}

export async function updateLeadSourceAsset(formData: FormData) {
  const parsed = parseAsset(formData);
  const id = idSchema.safeParse(value(formData, "id"));
  const source = value(formData, "source");
  if (!parsed.success || !id.success) fail(source || "website", "Check the source details and try again.");

  const { supabase, workspace } = await requireWorkspace();
  if (parsed.data.isPrimary) {
    const error = await clearPrimary(supabase, workspace.id, parsed.data.source);
    if (error) fail(parsed.data.source, "Orbit could not update the primary source.");
  }

  const { error } = await supabase
    .from("lead_source_assets")
    .update(payload(parsed.data))
    .eq("workspace_id", workspace.id)
    .eq("id", id.data);
  if (error) fail(parsed.data.source, error.code === "23505" ? "That source link is already managed here." : "Orbit could not update this source.");
  succeed(parsed.data.source, "Source account updated.");
}

export async function setLeadSourceAssetStatus(formData: FormData) {
  const source = value(formData, "source");
  const parsed = z.object({ id: idSchema, source: z.enum(sourceSlugs), status: z.enum(statuses) }).safeParse({
    id: value(formData, "id"),
    source,
    status: value(formData, "status"),
  });
  if (!parsed.success) fail(source || "website", "Invalid source status update.");

  const { supabase, workspace } = await requireWorkspace();
  const { error } = await supabase
    .from("lead_source_assets")
    .update({ status: parsed.data.status })
    .eq("workspace_id", workspace.id)
    .eq("id", parsed.data.id);
  if (error) fail(parsed.data.source, "Orbit could not update this source status.");
  succeed(parsed.data.source, parsed.data.status === "active" ? "Source activated." : parsed.data.status === "paused" ? "Source paused." : "Source disconnected from acquisition.");
}

export async function deleteLeadSourceAsset(formData: FormData) {
  const source = value(formData, "source");
  const parsed = z.object({ id: idSchema, source: z.enum(sourceSlugs) }).safeParse({ id: value(formData, "id"), source });
  if (!parsed.success) fail(source || "website", "Invalid source removal.");

  const { supabase, workspace } = await requireWorkspace();
  const { error } = await supabase
    .from("lead_source_assets")
    .delete()
    .eq("workspace_id", workspace.id)
    .eq("id", parsed.data.id);
  if (error) fail(parsed.data.source, "Only an authorised workspace admin can remove this source.");
  succeed(parsed.data.source, "Source removed.");
}
