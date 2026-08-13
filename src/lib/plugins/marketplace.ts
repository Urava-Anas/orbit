import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

export type PluginPublisherRecord = {
  id: string;
  workspace_id: string;
  slug: string;
  display_name: string;
  website: string | null;
  status: "active" | "suspended";
  verified: boolean;
  created_at: string;
  updated_at: string;
};

export type PluginSubmissionRecord = {
  id: string;
  workspace_id: string;
  publisher_id: string;
  proposed_slug: string;
  proposed_version: string;
  manifest: unknown;
  manifest_hash: string;
  review_status: "draft" | "submitted" | "approved" | "rejected";
  submitted_by: string;
  reviewed_by: string | null;
  review_notes: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

export async function getWorkspacePublishers(supabase: SupabaseClient, workspaceId: string) {
  const { data, error } = await supabase
    .from("plugin_publishers")
    .select("id,workspace_id,slug,display_name,website,status,verified,created_at,updated_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Plugin publishers failed to load: ${error.message}`);
  return (data ?? []) as PluginPublisherRecord[];
}

export async function getWorkspacePluginSubmissions(supabase: SupabaseClient, workspaceId: string) {
  const { data, error } = await supabase
    .from("plugin_submissions")
    .select("id,workspace_id,publisher_id,proposed_slug,proposed_version,manifest,manifest_hash,review_status,submitted_by,reviewed_by,review_notes,submitted_at,reviewed_at,created_at,updated_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(`Plugin submissions failed to load: ${error.message}`);
  return (data ?? []) as PluginSubmissionRecord[];
}

export async function isOrbitPlatformAdmin(userId: string) {
  const admin = createAdminClient();
  if (!admin) return false;
  const { data, error } = await admin
    .from("orbit_platform_admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  return !error && Boolean(data);
}

export async function getMarketplaceReviewQueue(userId: string) {
  const admin = createAdminClient();
  if (!admin) throw new Error("Orbit marketplace review service is unavailable.");
  const { data: reviewer, error: reviewerError } = await admin
    .from("orbit_platform_admins")
    .select("user_id,role")
    .eq("user_id", userId)
    .maybeSingle();
  if (reviewerError || !reviewer) throw new Error("Marketplace review access denied.");

  const { data, error } = await admin
    .from("plugin_submissions")
    .select("id,workspace_id,publisher_id,proposed_slug,proposed_version,manifest,manifest_hash,review_status,submitted_by,reviewed_by,review_notes,submitted_at,reviewed_at,created_at,updated_at,plugin_publishers(display_name,slug,website,verified,status)")
    .eq("review_status", "submitted")
    .order("submitted_at", { ascending: true })
    .limit(100);
  if (error) throw new Error(`Marketplace review queue failed to load: ${error.message}`);
  return data ?? [];
}
