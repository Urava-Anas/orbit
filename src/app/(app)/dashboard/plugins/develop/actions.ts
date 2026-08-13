"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireWorkspace } from "@/lib/workspace";
import { parsePluginManifest } from "@/lib/plugins/contracts";

const slugSchema = z.string().min(2).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const websiteSchema = z.string().url().startsWith("https://").max(400).or(z.literal(""));

function requireAdmin(role: string) {
  if (role !== "owner" && role !== "admin") throw new Error("Only organisation owners and admins can publish plugins.");
}

function placeholderHash(manifest: unknown) {
  // The database trigger replaces this with its canonical JSONB digest before storage.
  return createHash("sha256").update(JSON.stringify(manifest), "utf8").digest("hex");
}

export async function createPluginPublisher(formData: FormData) {
  const { supabase, workspace, user, role } = await requireWorkspace();
  requireAdmin(role);
  const slug = slugSchema.parse(String(formData.get("publisherSlug") ?? "").trim().toLowerCase());
  const displayName = z.string().min(2).max(100).parse(String(formData.get("displayName") ?? "").trim());
  const rawWebsite = websiteSchema.parse(String(formData.get("website") ?? "").trim());

  const { error } = await supabase.from("plugin_publishers").insert({
    workspace_id: workspace.id,
    slug,
    display_name: displayName,
    website: rawWebsite || null,
    status: "active",
    verified: false,
    created_by: user.id,
  });
  if (error) {
    if (error.code === "23505") throw new Error("That publisher slug is already registered.");
    throw new Error(`Publisher could not be registered: ${error.message}`);
  }
  revalidatePath("/dashboard/plugins/develop");
}

export async function submitPluginManifest(formData: FormData) {
  const { supabase, workspace, user, role } = await requireWorkspace();
  requireAdmin(role);
  const publisherId = z.string().uuid().parse(String(formData.get("publisherId") ?? ""));
  const rawManifest = z.string().min(2).max(160_000).parse(String(formData.get("manifest") ?? ""));

  let candidate: unknown;
  try {
    candidate = JSON.parse(rawManifest);
  } catch {
    throw new Error("Plugin manifest must be valid JSON.");
  }
  const manifest = parsePluginManifest(candidate);

  const { data: publisher, error: publisherError } = await supabase
    .from("plugin_publishers")
    .select("id,status")
    .eq("id", publisherId)
    .eq("workspace_id", workspace.id)
    .maybeSingle();
  if (publisherError || !publisher) throw new Error("Publisher was not found in this organisation.");
  if (publisher.status !== "active") throw new Error("This publisher is suspended.");

  const { error } = await supabase.from("plugin_submissions").insert({
    workspace_id: workspace.id,
    publisher_id: publisherId,
    proposed_slug: manifest.id,
    proposed_version: manifest.version,
    manifest,
    manifest_hash: placeholderHash(manifest),
    review_status: "submitted",
    submitted_by: user.id,
  });
  if (error) {
    if (error.code === "23505") throw new Error("This publisher has already submitted that plugin version.");
    throw new Error(`Plugin could not be submitted: ${error.message}`);
  }
  revalidatePath("/dashboard/plugins/develop");
  revalidatePath("/dashboard/plugins/review");
}
