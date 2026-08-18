import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrbitPluginManifestV1 } from "@/lib/plugins/contracts";

export type PluginAppConnection = {
  provider: string;
  required: boolean;
  connected: boolean;
  status: "connected" | "attention" | "disconnected" | "missing";
  accountName: string | null;
  accountType: string | null;
  assetCount: number;
  connectHref: string;
};

type ConnectionRow = {
  provider: string;
  status: "connected" | "attention" | "disconnected";
  provider_account_name: string | null;
  provider_account_type: string | null;
  selected_assets: unknown;
};

export const pluginProviderLabels: Record<string, string> = {
  github: "GitHub",
  vercel: "Vercel",
  google_search_console: "Search Console",
  google_analytics: "Google Analytics",
  meta: "Meta",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  geoapify: "Geoapify",
};

export function providerLabel(provider: string) {
  return pluginProviderLabels[provider] ?? provider.replaceAll("_", " ");
}

export function providerConnectHref(provider: string) {
  if (provider === "geoapify") {
    return "/dashboard/plugins/geoapify-lead-discovery#geoapify-connection";
  }
  return `/dashboard/connect?integration=${encodeURIComponent(provider)}#integrations`;
}

function countAssets(value: unknown) {
  return Array.isArray(value) ? value.length : 0;
}

export async function getWorkspacePluginConnections(
  supabase: SupabaseClient,
  workspaceId: string,
) {
  const { data, error } = await supabase
    .from("integration_connections")
    .select("provider,status,provider_account_name,provider_account_type,selected_assets")
    .eq("workspace_id", workspaceId);

  if (error) throw new Error(`Plugin app connections failed to load: ${error.message}`);
  return new Map(
    ((data ?? []) as ConnectionRow[]).map((row) => [row.provider, row]),
  );
}

export function resolvePluginAppConnections(
  manifest: OrbitPluginManifestV1,
  connections: Map<string, ConnectionRow>,
): PluginAppConnection[] {
  return manifest.apps.map((app) => {
    const connection = connections.get(app.provider);
    const status = connection?.status ?? "missing";
    return {
      provider: app.provider,
      required: app.required,
      connected: status === "connected",
      status,
      accountName: connection?.provider_account_name ?? null,
      accountType: connection?.provider_account_type ?? null,
      assetCount: countAssets(connection?.selected_assets),
      connectHref: providerConnectHref(app.provider),
    };
  });
}

export function pluginConnectionsReady(apps: PluginAppConnection[]) {
  return apps.every((app) => !app.required || app.connected);
}
