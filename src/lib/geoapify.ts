import "server-only";

import { decryptIntegrationSecret } from "@/lib/integration-connections";
import { createClient } from "@/lib/supabase/server";

export const GEOAPIFY_PROVIDER = "geoapify" as const;
export const GEOAPIFY_PLUGIN_SLUG = "geoapify-lead-discovery" as const;

type GeoapifyRuntimeStatus = {
  installed: boolean;
  connected: boolean;
  ready: boolean;
  accountName: string | null;
};

async function workspaceClient() {
  return createClient();
}

export async function getGeoapifyRuntimeStatus(workspaceId: string): Promise<GeoapifyRuntimeStatus> {
  const supabase = await workspaceClient();
  const { data: catalog, error: catalogError } = await supabase
    .from("plugin_catalog")
    .select("id")
    .eq("slug", GEOAPIFY_PLUGIN_SLUG)
    .eq("status", "published")
    .maybeSingle();

  if (catalogError) {
    return { installed: false, connected: false, ready: false, accountName: null };
  }

  const [installationResult, connectionResult] = await Promise.all([
    catalog
      ? supabase
          .from("plugin_installations")
          .select("status")
          .eq("workspace_id", workspaceId)
          .eq("plugin_id", catalog.id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from("integration_connections")
      .select("status,provider_account_name,access_token_ciphertext")
      .eq("workspace_id", workspaceId)
      .eq("provider", GEOAPIFY_PROVIDER)
      .maybeSingle(),
  ]);

  const installationStatus = installationResult.data?.status ?? null;
  const installed = installationStatus === "installed" || installationStatus === "pending_connections";
  const connected =
    !connectionResult.error &&
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
  const supabase = await workspaceClient();
  const runtime = await getGeoapifyRuntimeStatus(workspaceId);
  if (!runtime.installed) {
    throw new Error("Geoapify Lead Discovery plugin is not installed.");
  }
  if (!runtime.connected) {
    throw new Error("Geoapify is not connected in Plugins.");
  }

  const { data, error } = await supabase
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
