import { NextResponse } from "next/server";
import {
  consumeIntegrationState,
  encryptIntegrationSecret,
  orbitBaseUrl,
  verifyIntegrationState,
  type OAuthProvider,
} from "@/lib/integration-connections";
import { requireWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ provider: string }> };
type SupportedProvider = Exclude<OAuthProvider, "github" | "vercel">;

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
};

type ProviderIdentity = {
  accountName: string;
  accountId: string | null;
  accountType: string;
  assets: Array<Record<string, unknown>>;
  verifiedCapabilities: string[];
};

const supported = new Set<SupportedProvider>([
  "google_search_console",
  "google_analytics",
  "meta",
  "linkedin",
]);

function isSupported(value: string): value is SupportedProvider {
  return supported.has(value as SupportedProvider);
}

function back(request: Request, provider: string, key: "error" | "notice", value: string) {
  const url = new URL("/dashboard/plugins", request.url);
  url.searchParams.set("plugin", `app:${provider}`);
  url.searchParams.set("connect", provider);
  url.searchParams.set(key, value);
  return NextResponse.redirect(url);
}

function callbackUrl(provider: SupportedProvider) {
  return `${orbitBaseUrl()}/api/integrations/oauth/${provider}/callback`;
}

async function providerFetch(url: string, init: RequestInit = {}) {
  return fetch(url, {
    ...init,
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(12_000),
  });
}

async function exchangeCode(provider: SupportedProvider, code: string) {
  const redirectUri = callbackUrl(provider);

  if (provider === "google_search_console" || provider === "google_analytics") {
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID ?? process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) throw new Error("Google OAuth credentials are missing.");
    const response = await providerFetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
      }),
    });
    if (!response.ok) throw new Error("Google token exchange failed.");
    return (await response.json()) as TokenResponse;
  }

  if (provider === "meta") {
    const clientId = process.env.META_APP_ID;
    const clientSecret = process.env.META_APP_SECRET;
    if (!clientId || !clientSecret) throw new Error("Meta OAuth credentials are missing.");
    const response = await providerFetch("https://graph.facebook.com/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code,
      }),
    });
    if (!response.ok) throw new Error("Meta token exchange failed.");
    return (await response.json()) as TokenResponse;
  }

  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("LinkedIn OAuth credentials are missing.");
  const response = await providerFetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    }),
  });
  if (!response.ok) throw new Error("LinkedIn token exchange failed.");
  return (await response.json()) as TokenResponse;
}

async function providerIdentity(provider: SupportedProvider, token: string): Promise<ProviderIdentity> {
  if (provider === "google_search_console" || provider === "google_analytics") {
    const response = await providerFetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error("Google identity verification failed.");
    const profile = (await response.json()) as Record<string, unknown>;
    const accountName = String(profile.name ?? profile.email ?? "Google account");
    const accountId = typeof profile.sub === "string" ? profile.sub : null;
    if (!accountId) throw new Error("Google account identity is incomplete.");

    if (provider === "google_search_console") {
      const sitesResponse = await providerFetch("https://www.googleapis.com/webmasters/v3/sites", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!sitesResponse.ok) throw new Error("Search Console capability verification failed.");
      const sitesJson = (await sitesResponse.json()) as { siteEntry?: Array<{ siteUrl?: string; permissionLevel?: string }> };
      const assets = (sitesJson.siteEntry ?? []).map((item) => ({
        id: item.siteUrl ?? "site",
        name: item.siteUrl ?? "Search Console property",
        permission: item.permissionLevel ?? null,
      }));
      return {
        accountName,
        accountId,
        accountType: "google",
        assets,
        verifiedCapabilities: ["identity", "search_console.read"],
      };
    }

    const summariesResponse = await providerFetch("https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!summariesResponse.ok) throw new Error("Google Analytics capability verification failed.");
    const summariesJson = (await summariesResponse.json()) as {
      accountSummaries?: Array<{
        account?: string;
        displayName?: string;
        propertySummaries?: Array<{ property?: string; displayName?: string }>;
      }>;
    };
    const assets = (summariesJson.accountSummaries ?? []).flatMap((account) =>
      (account.propertySummaries ?? []).map((property) => ({
        id: property.property ?? account.account ?? "property",
        name: property.displayName ?? account.displayName ?? "Analytics property",
        account: account.displayName ?? null,
      })),
    );
    return {
      accountName,
      accountId,
      accountType: "google",
      assets,
      verifiedCapabilities: ["identity", "analytics.read"],
    };
  }

  if (provider === "meta") {
    const [profileResponse, pagesResponse] = await Promise.all([
      providerFetch("https://graph.facebook.com/me?fields=id,name", {
        headers: { Authorization: `Bearer ${token}` },
      }),
      providerFetch("https://graph.facebook.com/me/accounts?fields=id,name&limit=100", {
        headers: { Authorization: `Bearer ${token}` },
      }),
    ]);
    if (!profileResponse.ok || !pagesResponse.ok) {
      throw new Error("Meta Page capability verification failed.");
    }
    const profile = (await profileResponse.json()) as Record<string, unknown>;
    const pages = (await pagesResponse.json()) as { data?: Array<{ id?: string; name?: string }> };
    const accountId = typeof profile.id === "string" ? profile.id : null;
    if (!accountId) throw new Error("Meta account identity is incomplete.");
    return {
      accountName: String(profile.name ?? "Meta account"),
      accountId,
      accountType: "meta",
      assets: (pages.data ?? []).map((page) => ({ id: page.id ?? "page", name: page.name ?? "Meta Page" })),
      verifiedCapabilities: ["identity", "pages.list", "pages.engagement.read"],
    };
  }

  const response = await providerFetch("https://api.linkedin.com/v2/userinfo", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error("LinkedIn identity verification failed.");
  const profile = (await response.json()) as Record<string, unknown>;
  const accountId = typeof profile.sub === "string" ? profile.sub : null;
  if (!accountId) throw new Error("LinkedIn account identity is incomplete.");
  return {
    accountName: String(profile.name ?? profile.email ?? "LinkedIn account"),
    accountId,
    accountType: "linkedin",
    assets: [],
    verifiedCapabilities: ["identity"],
  };
}

export async function GET(request: Request, { params }: RouteContext) {
  const { provider } = await params;
  if (!isSupported(provider)) return back(request, provider, "error", "unsupported_integration");

  const callback = new URL(request.url);
  const code = callback.searchParams.get("code") ?? "";
  const stateToken = callback.searchParams.get("state") ?? "";
  if (!code || !stateToken) return back(request, provider, "error", "oauth_incomplete");

  try {
    const state = verifyIntegrationState(stateToken, provider);
    const { supabase, workspace, user, role } = await requireWorkspace();
    if (role !== "owner" && role !== "admin") return back(request, provider, "error", "integration_permission_required");
    if (state.workspaceId !== workspace.id || state.userId !== user.id) {
      return back(request, provider, "error", "oauth_state_mismatch");
    }
    await consumeIntegrationState(stateToken, state);

    let token: TokenResponse;
    try {
      token = await exchangeCode(provider, code);
    } catch {
      return back(request, provider, "error", "oauth_exchange_failed");
    }
    if (!token.access_token) return back(request, provider, "error", "oauth_exchange_failed");

    let identity: ProviderIdentity;
    try {
      identity = await providerIdentity(provider, token.access_token);
    } catch {
      return back(request, provider, "error", "oauth_capability_verification_failed");
    }

    const now = new Date().toISOString();
    const expiresAt = token.expires_in ? new Date(Date.now() + token.expires_in * 1000).toISOString() : null;
    const scopes = (token.scope ?? "").split(/[ ,]+/).filter(Boolean);

    const { error } = await supabase.from("integration_connections").upsert(
      {
        workspace_id: workspace.id,
        provider,
        status: "connected",
        provider_installation_id: null,
        provider_account_id: identity.accountId,
        provider_account_name: identity.accountName,
        provider_account_type: identity.accountType,
        access_token_ciphertext: encryptIntegrationSecret(token.access_token),
        refresh_token_ciphertext: token.refresh_token ? encryptIntegrationSecret(token.refresh_token) : null,
        token_expires_at: expiresAt,
        scopes,
        selected_assets: identity.assets,
        metadata: {
          credentialModel: "oauth2_authorization_code",
          verifiedCapabilities: identity.verifiedCapabilities,
          capabilitiesVerifiedAt: now,
        },
        connected_by: user.id,
        connected_at: now,
        disconnected_at: null,
        updated_at: now,
      },
      { onConflict: "workspace_id,provider" },
    );
    if (error) return back(request, provider, "error", "oauth_save_failed");

    return back(request, provider, "notice", `${provider}_connected`);
  } catch (error) {
    console.error("OAuth provider callback failed", provider, error);
    return back(request, provider, "error", "oauth_callback_failed");
  }
}
