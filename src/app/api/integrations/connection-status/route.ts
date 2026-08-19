import { NextResponse } from "next/server";
import { getGeoapifyRuntimeStatus } from "@/lib/geoapify";
import {
  githubAppReady,
  oauthProviderReady,
  vercelIntegrationReady,
  type OAuthProvider,
} from "@/lib/integration-connections";
import { requireWorkspace } from "@/lib/workspace";

const supported = new Set([
  "github",
  "vercel",
  "google_search_console",
  "google_analytics",
  "meta",
  "linkedin",
  "geoapify",
]);

function platformReady(provider: string) {
  if (provider === "github") return githubAppReady();
  if (provider === "vercel") return vercelIntegrationReady();
  if (
    provider === "google_search_console" ||
    provider === "google_analytics" ||
    provider === "meta" ||
    provider === "linkedin"
  ) {
    return oauthProviderReady(provider as Exclude<OAuthProvider, "github" | "vercel">);
  }
  return false;
}

function verifiedCapabilities(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return [];
  const raw = (metadata as Record<string, unknown>).verifiedCapabilities;
  return Array.isArray(raw) ? raw.filter((item): item is string => typeof item === "string" && item.length > 0) : [];
}

export async function GET(request: Request) {
  const provider = new URL(request.url).searchParams.get("provider") ?? "";
  if (!supported.has(provider)) {
    return NextResponse.json({ error: "Unsupported provider." }, { status: 400 });
  }

  const { supabase, workspace } = await requireWorkspace();

  if (provider === "geoapify") {
    const runtime = await getGeoapifyRuntimeStatus(workspace.id);
    return NextResponse.json(
      {
        provider,
        installed: runtime.installed,
        connected: runtime.connected,
        status: runtime.connected ? "connected" : runtime.installed ? "disconnected" : "not_installed",
        accountName: runtime.accountName,
        accountType: runtime.connected ? "Encrypted API key" : null,
        assetCount: runtime.connected ? 3 : 0,
        platformReady: runtime.installed,
        updatedAt: null,
      },
      { headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } },
    );
  }

  const { data, error } = await supabase
    .from("integration_connections")
    .select("status,provider_account_name,provider_account_type,selected_assets,metadata,token_expires_at,updated_at")
    .eq("workspace_id", workspace.id)
    .eq("provider", provider)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Connection status could not be loaded." }, { status: 500 });
  }

  const selectedAssets = Array.isArray(data?.selected_assets) ? data.selected_assets : [];
  const capabilities = verifiedCapabilities(data?.metadata);
  const expiresAt = data?.token_expires_at ? Date.parse(data.token_expires_at) : null;
  const expired = expiresAt !== null && Number.isFinite(expiresAt) && expiresAt <= Date.now() + 60_000;
  const capabilityVerified = capabilities.length > 0;
  const storedConnected = data?.status === "connected";
  const connected = storedConnected && capabilityVerified && !expired;
  const status = expired
    ? "reauthorization_required"
    : storedConnected && !capabilityVerified
      ? "verification_required"
      : data?.status ?? "disconnected";

  return NextResponse.json(
    {
      provider,
      connected,
      status: connected ? "connected" : status,
      accountName: data?.provider_account_name ?? null,
      accountType: data?.provider_account_type ?? null,
      assetCount: selectedAssets.length,
      platformReady: platformReady(provider),
      verifiedCapabilities: capabilities,
      tokenExpiresAt: data?.token_expires_at ?? null,
      updatedAt: data?.updated_at ?? null,
    },
    { headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } },
  );
}
