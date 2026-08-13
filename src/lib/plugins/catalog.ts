import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  safeParsePluginManifest,
  type OrbitPluginManifestV1,
  type PluginCatalogRecord,
  type PluginEventRecord,
  type PluginInstallationRecord,
} from "@/lib/plugins/contracts";

export type PluginMarketplaceItem = {
  catalog: PluginCatalogRecord;
  manifest: OrbitPluginManifestV1;
  installation: PluginInstallationRecord | null;
};

function normalizeCatalogRow(row: Record<string, unknown>): PluginCatalogRecord | null {
  const parsed = safeParsePluginManifest(row.manifest);
  if (!parsed.success) return null;
  if (
    typeof row.id !== "string" ||
    typeof row.slug !== "string" ||
    typeof row.name !== "string" ||
    typeof row.short_description !== "string" ||
    typeof row.developer_name !== "string" ||
    typeof row.current_version !== "string" ||
    (row.status !== "published" && row.status !== "deprecated")
  ) {
    return null;
  }

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    short_description: row.short_description,
    developer_name: row.developer_name,
    developer_url: typeof row.developer_url === "string" ? row.developer_url : null,
    current_version: row.current_version,
    status: row.status,
    verified: row.verified === true,
    first_party: row.first_party === true,
    manifest: parsed.data,
  };
}

function normalizeInstallationRow(row: Record<string, unknown>): PluginInstallationRecord | null {
  if (
    typeof row.id !== "string" ||
    typeof row.workspace_id !== "string" ||
    typeof row.plugin_id !== "string" ||
    typeof row.version !== "string" ||
    !["installed", "disabled", "pending_connections", "revoked"].includes(String(row.status)) ||
    !Array.isArray(row.granted_permissions) ||
    typeof row.installed_at !== "string" ||
    typeof row.updated_at !== "string"
  ) {
    return null;
  }

  return {
    id: row.id,
    workspace_id: row.workspace_id,
    plugin_id: row.plugin_id,
    version: row.version,
    status: row.status as PluginInstallationRecord["status"],
    granted_permissions: row.granted_permissions.filter((value): value is string => typeof value === "string"),
    configuration:
      row.configuration && typeof row.configuration === "object" && !Array.isArray(row.configuration)
        ? (row.configuration as Record<string, unknown>)
        : {},
    installed_by: typeof row.installed_by === "string" ? row.installed_by : null,
    installed_at: row.installed_at,
    updated_at: row.updated_at,
  };
}

export async function getPluginMarketplace(supabase: SupabaseClient, workspaceId: string) {
  const [catalogResult, installationsResult] = await Promise.all([
    supabase
      .from("plugin_catalog")
      .select("id,slug,name,short_description,developer_name,developer_url,current_version,status,verified,first_party,manifest")
      .order("first_party", { ascending: false })
      .order("name", { ascending: true }),
    supabase
      .from("plugin_installations")
      .select("id,workspace_id,plugin_id,version,status,granted_permissions,configuration,installed_by,installed_at,updated_at")
      .eq("workspace_id", workspaceId),
  ]);

  if (catalogResult.error) {
    throw new Error(`Plugin catalog failed to load: ${catalogResult.error.message}`);
  }
  if (installationsResult.error) {
    throw new Error(`Plugin installations failed to load: ${installationsResult.error.message}`);
  }

  const installations = new Map<string, PluginInstallationRecord>();
  for (const raw of installationsResult.data ?? []) {
    const normalized = normalizeInstallationRow(raw as Record<string, unknown>);
    if (normalized) installations.set(normalized.plugin_id, normalized);
  }

  const items: PluginMarketplaceItem[] = [];
  for (const raw of catalogResult.data ?? []) {
    const catalog = normalizeCatalogRow(raw as Record<string, unknown>);
    if (!catalog) continue;
    const parsed = safeParsePluginManifest(catalog.manifest);
    if (!parsed.success) continue;
    if (parsed.data.id !== catalog.slug || parsed.data.version !== catalog.current_version) continue;
    items.push({ catalog, manifest: parsed.data, installation: installations.get(catalog.id) ?? null });
  }

  return items;
}

export async function getPluginBySlug(
  supabase: SupabaseClient,
  workspaceId: string,
  slug: string,
): Promise<PluginMarketplaceItem | null> {
  const { data: catalogRow, error: catalogError } = await supabase
    .from("plugin_catalog")
    .select("id,slug,name,short_description,developer_name,developer_url,current_version,status,verified,first_party,manifest")
    .eq("slug", slug)
    .maybeSingle();

  if (catalogError) throw new Error(`Plugin failed to load: ${catalogError.message}`);
  if (!catalogRow) return null;

  const catalog = normalizeCatalogRow(catalogRow as Record<string, unknown>);
  if (!catalog) return null;
  const parsed = safeParsePluginManifest(catalog.manifest);
  if (!parsed.success || parsed.data.id !== catalog.slug || parsed.data.version !== catalog.current_version) {
    return null;
  }

  const { data: installRow, error: installError } = await supabase
    .from("plugin_installations")
    .select("id,workspace_id,plugin_id,version,status,granted_permissions,configuration,installed_by,installed_at,updated_at")
    .eq("workspace_id", workspaceId)
    .eq("plugin_id", catalog.id)
    .maybeSingle();

  if (installError) throw new Error(`Plugin installation failed to load: ${installError.message}`);

  return {
    catalog,
    manifest: parsed.data,
    installation: installRow ? normalizeInstallationRow(installRow as Record<string, unknown>) : null,
  };
}

export async function getPluginEvents(
  supabase: SupabaseClient,
  workspaceId: string,
  pluginId: string,
  limit = 20,
) {
  const { data, error } = await supabase
    .from("plugin_installation_events")
    .select("id,workspace_id,plugin_id,installation_id,event_type,actor_user_id,payload,occurred_at")
    .eq("workspace_id", workspaceId)
    .eq("plugin_id", pluginId)
    .order("occurred_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 50));

  if (error) throw new Error(`Plugin activity failed to load: ${error.message}`);

  return (data ?? []).map((row) => row as PluginEventRecord);
}
