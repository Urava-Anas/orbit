"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireWorkspace } from "@/lib/workspace";
import { parsePluginManifest } from "@/lib/plugins/contracts";

const slugSchema = z.string().min(2).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

function requirePluginAdmin(role: string) {
  if (role !== "owner" && role !== "admin") {
    throw new Error("Only organisation owners and admins can change plugins.");
  }
}

function pluginSlug(formData: FormData) {
  return slugSchema.parse(String(formData.get("pluginSlug") ?? ""));
}

async function loadPluginForWrite(
  supabase: Awaited<ReturnType<typeof requireWorkspace>>["supabase"],
  slug: string,
) {
  const { data, error } = await supabase
    .from("plugin_catalog")
    .select("id,slug,current_version,status,manifest")
    .eq("slug", slug)
    .single();

  if (error || !data) throw new Error("Plugin was not found.");
  if (data.status !== "published") throw new Error("This plugin is not currently installable.");

  const manifest = parsePluginManifest(data.manifest);
  if (manifest.id !== data.slug || manifest.version !== data.current_version) {
    throw new Error("Plugin manifest integrity check failed.");
  }

  return { data, manifest };
}

async function logPluginEvent(input: {
  supabase: Awaited<ReturnType<typeof requireWorkspace>>["supabase"];
  workspaceId: string;
  pluginId: string;
  installationId: string | null;
  eventType: string;
  actorUserId: string;
  payload?: Record<string, unknown>;
}) {
  const { error } = await input.supabase.from("plugin_installation_events").insert({
    workspace_id: input.workspaceId,
    plugin_id: input.pluginId,
    installation_id: input.installationId,
    event_type: input.eventType,
    actor_user_id: input.actorUserId,
    payload: input.payload ?? {},
  });
  if (error) throw new Error(`Plugin audit event failed: ${error.message}`);
}

function revalidatePlugins(slug?: string) {
  revalidatePath("/dashboard/plugins");
  if (slug) revalidatePath(`/dashboard/plugins/${slug}`);
}

export async function installPlugin(formData: FormData) {
  const slug = pluginSlug(formData);
  const { supabase, workspace, user, role } = await requireWorkspace();
  requirePluginAdmin(role);
  const { data: plugin, manifest } = await loadPluginForWrite(supabase, slug);

  const { data: existing, error: existingError } = await supabase
    .from("plugin_installations")
    .select("id,status")
    .eq("workspace_id", workspace.id)
    .eq("plugin_id", plugin.id)
    .maybeSingle();
  if (existingError) throw new Error(`Plugin installation check failed: ${existingError.message}`);

  let installationId: string;
  if (existing) {
    const { data: updated, error } = await supabase
      .from("plugin_installations")
      .update({
        version: plugin.current_version,
        status: "installed",
        granted_permissions: manifest.permissions,
        installed_by: user.id,
        installed_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .eq("workspace_id", workspace.id)
      .select("id")
      .single();
    if (error || !updated) throw new Error(`Plugin could not be installed: ${error?.message ?? "unknown error"}`);
    installationId = updated.id;
  } else {
    const { data: inserted, error } = await supabase
      .from("plugin_installations")
      .insert({
        workspace_id: workspace.id,
        plugin_id: plugin.id,
        version: plugin.current_version,
        status: "installed",
        granted_permissions: manifest.permissions,
        installed_by: user.id,
      })
      .select("id")
      .single();
    if (error || !inserted) throw new Error(`Plugin could not be installed: ${error?.message ?? "unknown error"}`);
    installationId = inserted.id;
  }

  await logPluginEvent({
    supabase,
    workspaceId: workspace.id,
    pluginId: plugin.id,
    installationId,
    eventType: "installed",
    actorUserId: user.id,
    payload: { version: plugin.current_version, permissions: manifest.permissions },
  });
  revalidatePlugins(slug);
}

export async function approvePluginUpdate(formData: FormData) {
  const slug = pluginSlug(formData);
  const { supabase, workspace, user, role } = await requireWorkspace();
  requirePluginAdmin(role);
  const { data: plugin, manifest } = await loadPluginForWrite(supabase, slug);

  const { data: current, error: currentError } = await supabase
    .from("plugin_installations")
    .select("id,status,version,granted_permissions")
    .eq("workspace_id", workspace.id)
    .eq("plugin_id", plugin.id)
    .maybeSingle();
  if (currentError) throw new Error(`Plugin update check failed: ${currentError.message}`);
  if (!current || current.status !== "pending_review") {
    throw new Error("This plugin does not have an update awaiting approval.");
  }

  const previousVersion = current.version;
  const previousPermissions = Array.isArray(current.granted_permissions) ? current.granted_permissions : [];
  const { data: updated, error } = await supabase
    .from("plugin_installations")
    .update({
      version: plugin.current_version,
      status: "installed",
      granted_permissions: manifest.permissions,
    })
    .eq("id", current.id)
    .eq("workspace_id", workspace.id)
    .eq("status", "pending_review")
    .select("id,status")
    .single();
  if (error || !updated) throw new Error(`Plugin update could not be approved: ${error?.message ?? "unknown error"}`);

  await logPluginEvent({
    supabase,
    workspaceId: workspace.id,
    pluginId: plugin.id,
    installationId: updated.id,
    eventType: "version_changed",
    actorUserId: user.id,
    payload: {
      fromVersion: previousVersion,
      toVersion: plugin.current_version,
      previousPermissions,
      approvedPermissions: manifest.permissions,
    },
  });
  revalidatePlugins(slug);
}

export async function disablePlugin(formData: FormData) {
  const slug = pluginSlug(formData);
  const { supabase, workspace, user, role } = await requireWorkspace();
  requirePluginAdmin(role);
  const { data: plugin } = await loadPluginForWrite(supabase, slug);

  const { data: updated, error } = await supabase
    .from("plugin_installations")
    .update({ status: "disabled" })
    .eq("workspace_id", workspace.id)
    .eq("plugin_id", plugin.id)
    .in("status", ["installed", "pending_connections"])
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`Plugin could not be disabled: ${error.message}`);
  if (!updated) throw new Error("Plugin is not active.");

  await logPluginEvent({ supabase, workspaceId: workspace.id, pluginId: plugin.id, installationId: updated.id, eventType: "disabled", actorUserId: user.id });
  revalidatePlugins(slug);
}

export async function enablePlugin(formData: FormData) {
  const slug = pluginSlug(formData);
  const { supabase, workspace, user, role } = await requireWorkspace();
  requirePluginAdmin(role);
  const { data: plugin } = await loadPluginForWrite(supabase, slug);

  const { data: updated, error } = await supabase
    .from("plugin_installations")
    .update({ status: "installed" })
    .eq("workspace_id", workspace.id)
    .eq("plugin_id", plugin.id)
    .eq("status", "disabled")
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`Plugin could not be enabled: ${error.message}`);
  if (!updated) throw new Error("Plugin is not available to enable.");

  await logPluginEvent({ supabase, workspaceId: workspace.id, pluginId: plugin.id, installationId: updated.id, eventType: "enabled", actorUserId: user.id });
  revalidatePlugins(slug);
}

export async function uninstallPlugin(formData: FormData) {
  const slug = pluginSlug(formData);
  const { supabase, workspace, user, role } = await requireWorkspace();
  requirePluginAdmin(role);
  const { data: plugin } = await loadPluginForWrite(supabase, slug);

  const { data: updated, error } = await supabase
    .from("plugin_installations")
    .update({ status: "revoked", granted_permissions: [] })
    .eq("workspace_id", workspace.id)
    .eq("plugin_id", plugin.id)
    .neq("status", "revoked")
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`Plugin could not be uninstalled: ${error.message}`);
  if (!updated) throw new Error("Plugin is not installed.");

  await logPluginEvent({ supabase, workspaceId: workspace.id, pluginId: plugin.id, installationId: updated.id, eventType: "uninstalled", actorUserId: user.id });
  revalidatePlugins(slug);
}
