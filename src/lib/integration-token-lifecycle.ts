import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  decryptIntegrationSecret,
  encryptIntegrationSecret,
  type OAuthProvider,
} from "@/lib/integration-connections";

type RefreshableProvider = "google_search_console" | "google_analytics";

type ConnectionTokenRow = {
  provider: OAuthProvider;
  status: string;
  access_token_ciphertext: string | null;
  refresh_token_ciphertext: string | null;
  token_expires_at: string | null;
  metadata: Record<string, unknown> | null;
};

type RefreshedGoogleToken = {
  accessToken: string;
  expiresIn: number | null;
};

function isRefreshable(provider: OAuthProvider): provider is RefreshableProvider {
  return provider === "google_search_console" || provider === "google_analytics";
}

function expiresSoon(value: string | null) {
  if (!value) return false;
  const expiresAt = Date.parse(value);
  return !Number.isFinite(expiresAt) || expiresAt <= Date.now() + 5 * 60 * 1000;
}

async function refreshGoogleToken(refreshToken: string): Promise<RefreshedGoogleToken> {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID ?? process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Google OAuth refresh credentials are unavailable.");

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(12_000),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!response.ok || !payload.access_token) throw new Error("Google OAuth token refresh failed.");
  return {
    accessToken: payload.access_token,
    expiresIn: typeof payload.expires_in === "number" ? payload.expires_in : null,
  };
}

/**
 * Returns a usable server-side access token for an already-authorised workspace connection.
 * The caller must establish workspace authority before calling this helper.
 */
export async function getFreshIntegrationAccessToken(input: {
  supabase: SupabaseClient;
  workspaceId: string;
  provider: OAuthProvider;
}) {
  const { data, error } = await input.supabase
    .from("integration_connections")
    .select("provider,status,access_token_ciphertext,refresh_token_ciphertext,token_expires_at,metadata")
    .eq("workspace_id", input.workspaceId)
    .eq("provider", input.provider)
    .maybeSingle();
  if (error || !data || data.status !== "connected") return null;

  const row = data as ConnectionTokenRow;
  if (!row.access_token_ciphertext) return null;
  if (!expiresSoon(row.token_expires_at)) return decryptIntegrationSecret(row.access_token_ciphertext);

  if (!isRefreshable(input.provider) || !row.refresh_token_ciphertext) return null;

  try {
    const refreshToken = decryptIntegrationSecret(row.refresh_token_ciphertext);
    const refreshed = await refreshGoogleToken(refreshToken);
    const now = new Date().toISOString();
    const expiresAt = refreshed.expiresIn
      ? new Date(Date.now() + Math.max(60, refreshed.expiresIn) * 1000).toISOString()
      : null;
    const metadata = {
      ...(row.metadata ?? {}),
      tokenRefreshedAt: now,
    };
    const update = await input.supabase
      .from("integration_connections")
      .update({
        access_token_ciphertext: encryptIntegrationSecret(refreshed.accessToken),
        token_expires_at: expiresAt,
        metadata,
        updated_at: now,
      })
      .eq("workspace_id", input.workspaceId)
      .eq("provider", input.provider)
      .eq("status", "connected");
    if (update.error) throw new Error("Refreshed OAuth token could not be persisted.");
    return refreshed.accessToken;
  } catch (error) {
    console.error("OAuth token refresh failed safely", {
      provider: input.provider,
      message: error instanceof Error ? error.message : "unknown_refresh_error",
    });
    return null;
  }
}
