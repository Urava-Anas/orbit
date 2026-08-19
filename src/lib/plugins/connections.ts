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
  metadata: unknown;
  token_expires_at: string | null;
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

function verifiedCapabilities(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return [];
  const value = (metadata as Record<string, unknown>).verifiedCapabilities;
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.length > 0)
    : [];
}

function isReadyConnection(connection: ConnectionRow | undefined) {
  if (!connection || connection.status !== "connected") return false;
  if (connection.provider === "geoapify") return true;
  if (verifiedCapabilities(connection.metadata).length === 0) return false;
  if (!connection.token_expires_at) return true;
  const expiresAt = Date.parse(connection.token_expires_at);
  return Number.isFinite(expiresAt) && expiresAt > Date.now() + 60_000;
}

export async function getWorkspacePluginConnections(
  supabase: SupabaseClient,
  workspaceId: string,
) {
  const { data, error } = await supabase
    .from("integration_connections")
    .select("provider,status,provider_account_name,provider_account_type,selected_assets,metadata,token_expires_at")
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
    const connected = isReadyConnection(connection);
    const status = connected
      ? "connected"
      : connection?.status === "connected"
        ? "attention"
        : connection?.status ?? "missing";
    return {
      provider: app.provider,
      required: app.required,
      connected,
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
