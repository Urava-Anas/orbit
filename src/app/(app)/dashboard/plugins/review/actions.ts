"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireWorkspace } from "@/lib/workspace";
import { createAdminClient } from "@/lib/supabase/admin";
import { isOrbitPlatformAdmin } from "@/lib/plugins/marketplace";
import { parsePluginManifest } from "@/lib/plugins/contracts";

const submissionIdSchema = z.string().uuid();

async function requireReviewer() {
  const { user } = await requireWorkspace();
  if (!(await isOrbitPlatformAdmin(user.id))) throw new Error("Marketplace review access denied.");
  const admin = createAdminClient();
  if (!admin) throw new Error("Orbit marketplace review service is unavailable.");
  return { user, admin };
}

async function validateSubmissionBeforeReview(admin: NonNullable<ReturnType<typeof createAdminClient>>, submissionId: string) {
  const { data, error } = await admin
    .from("plugin_submissions")
    .select("id,proposed_slug,proposed_version,manifest,review_status,plugin_publishers(status,website)")
    .eq("id", submissionId)
    .maybeSingle();
  if (error || !data) throw new Error("Plugin submission was not found.");
  if (data.review_status !== "submitted") throw new Error("Plugin submission is no longer awaiting review.");
  const manifest = parsePluginManifest(data.manifest);
  if (manifest.id !== data.proposed_slug || manifest.version !== data.proposed_version) {
    throw new Error("Plugin submission identity validation failed.");
  }
  if (manifest.mcp) {
    const endpoint = new URL(manifest.mcp.url);
    if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || (endpoint.port && endpoint.port !== "443")) {
      throw new Error("Plugin MCP endpoint violates Orbit marketplace network policy.");
    }
  }
  return manifest;
}

export async function approvePluginSubmission(formData: FormData) {
  const submissionId = submissionIdSchema.parse(String(formData.get("submissionId") ?? ""));
  const notes = z.string().max(4000).parse(String(formData.get("reviewNotes") ?? "").trim());
  const { user, admin } = await requireReviewer();
  await validateSubmissionBeforeReview(admin, submissionId);

  const { data, error } = await admin.rpc("promote_plugin_submission", {
    target_submission_id: submissionId,
    target_reviewer_id: user.id,
    target_review_notes: notes || null,
  });
  if (error || !data) throw new Error(`Plugin approval failed: ${error?.message ?? "unknown error"}`);
  revalidatePath("/dashboard/plugins");
  revalidatePath("/dashboard/plugins/develop");
  revalidatePath("/dashboard/plugins/review");
}

export async function rejectPluginSubmission(formData: FormData) {
  const submissionId = submissionIdSchema.parse(String(formData.get("submissionId") ?? ""));
  const notes = z.string().min(3).max(4000).parse(String(formData.get("reviewNotes") ?? "").trim());
  const { user, admin } = await requireReviewer();

  const { data, error } = await admin.rpc("reject_plugin_submission", {
    target_submission_id: submissionId,
    target_reviewer_id: user.id,
    target_review_notes: notes,
  });
  if (error || data !== true) throw new Error(`Plugin rejection failed: ${error?.message ?? "submission already resolved"}`);
  revalidatePath("/dashboard/plugins/develop");
  revalidatePath("/dashboard/plugins/review");
}
