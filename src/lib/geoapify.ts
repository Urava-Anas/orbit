import "server-only";

import { decryptIntegrationSecret } from "@/lib/integration-connections";
import { createAdminClient } from "@/lib/supabase/admin";

export const GEOAPIFY_PROVIDER = "geoapify" as const;
export const GEOAPIFY_PLUGIN_SLUG = "geoapify-lead-discovery" as const;

type GeoapifyRuntimeStatus = {
  installed: boolean;
  connected: boolean;
  ready: boolean;
  accountName: string | null;
};

async function adminClient() {
  const admin = createAdminClient();
  if (!admin) throw new Error("Orbit integration service is unavailable.");
  return admin;
}

export async function getGeoapifyRuntimeStatus(workspaceId: string): Promise<GeoapifyRuntimeStatus> {
  const admin = await adminClient();
  const { data: catalog } = await admin
    .from("plugin_catalog")
    .select("id")
    .eq("slug", GEOAPIFY_PLUGIN_SLUG)
    .eq("status", "published")
    .maybeSingle();

  const [installationResult, connectionResult] = await Promise.all([
    catalog
      ? admin
          .from("plugin_installations")
          .select("status")
          .eq("workspace_id", workspaceId)
          .eq("plugin_id", catalog.id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    admin
      .from("integration_connections")
      .select("status,provider_account_name,access_token_ciphertext")
      .eq("workspace_id", workspaceId)
      .eq("provider", GEOAPIFY_PROVIDER)
      .maybeSingle(),
  ]);

  const installed = installationResult.data?.status === "installed";
  const connected =
    connectionResult.data?.status === "connected" &&
    Boolean(connectionResult.data?.access_token_ciphertext);

  return {
    installed,
    connected,
    ready: installed && connected,
    accountName: connectionResult.data?.provider_account_name ?? null,
  };
}

export async function getGeoapifyApiKey(workspaceId: string) {
  const admin = await adminClient();
  const runtime = await getGeoapifyRuntimeStatus(workspaceId);
  if (!runtime.installed) {
    throw new Error("Geoapify Lead Discovery plugin is not installed.");
  }
  if (!runtime.connected) {
    throw new Error("Geoapify is not connected in Plugins.");
  }

  const { data, error } = await admin
    .from("integration_connections")
    .select("access_token_ciphertext")
    .eq("workspace_id", workspaceId)
    .eq("provider", GEOAPIFY_PROVIDER)
    .eq("status", "connected")
    .single();

  if (error || !data?.access_token_ciphertext) {
    throw new Error("Geoapify credential is unavailable.");
  }
  return decryptIntegrationSecret(data.access_token_ciphertext);
}

export async function validateGeoapifyApiKey(apiKey: string) {
  const url = new URL("https://api.geoapify.com/v1/geocode/search");
  url.searchParams.set("text", "Lahore, Pakistan");
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  url.searchParams.set("apiKey", apiKey);

  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) return false;

  const payload = (await response.json()) as { results?: unknown[] };
  return Array.isArray(payload.results);
}
