import { NextResponse } from "next/server";
import {
  consumeIntegrationState,
  encryptIntegrationSecret,
  orbitBaseUrl,
  verifyIntegrationState,
  type OAuthProvider,
} from "@/lib/integration-connections";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ provider: string }> };
type SupportedProvider = Exclude<OAuthProvider, "github" | "vercel">;

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  refresh_expires_in?: number;
  scope?: string;
  token_type?: string;
  open_id?: string;
};

type AssetCredential = {
  assetId: string;
  assetKind: "facebook_page";
  credential: string;
  metadata: Record<string, unknown>;
};

type ProviderIdentity = {
  accountName: string;
  accountId: string | null;
  accountType: string;
  assets: Array<Record<string, unknown>>;
  assetCredentials?: AssetCredential[];
  verifiedCapabilities: string[];
  connectionReady?: boolean;
  connectionIssue?: string | null;
};

type MetaInstagramAccount = {
  id?: string;
  username?: string;
  name?: string;
  profile_picture_url?: string;
};

type MetaPage = {
  id?: string;
  name?: string;
  access_token?: string;
  tasks?: string[];
  instagram_business_account?: MetaInstagramAccount;
};

const supported = new Set<SupportedProvider>([
  "google_search_console",
  "google_analytics",
  "meta",
  "linkedin",
  "tiktok",
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

function metaGraphVersion() {
  return process.env.META_GRAPH_API_VERSION?.trim() || "v25.0";
}

function metaGraphUrl(path: string) {
  return `https://graph.facebook.com/${metaGraphVersion()}/${path.replace(/^\//, "")}`;
}

async function providerFetch(url: string, init: RequestInit = {}) {
  return fetch(url, {
    ...init,
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(12_000),
  });
}

async function exchangeMetaLongLivedToken(shortLivedToken: TokenResponse) {
  const clientId = process.env.META_APP_ID;
  const clientSecret = process.env.META_APP_SECRET;
  if (!clientId || !clientSecret || !shortLivedToken.access_token) {
    throw new Error("Meta OAuth credentials are missing.");
  }

  const url = new URL(metaGraphUrl("oauth/access_token"));
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("client_secret", clientSecret);
  url.searchParams.set("fb_exchange_token", shortLivedToken.access_token);
  const response = await providerFetch(url.toString());
  if (!response.ok) throw new Error("Meta long-lived token exchange failed.");
  const longLived = (await response.json()) as TokenResponse;
  if (!longLived.access_token) throw new Error("Meta long-lived token response was incomplete.");
  return {
    ...shortLivedToken,
    ...longLived,
    scope: longLived.scope ?? shortLivedToken.scope,
  } satisfies TokenResponse;
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
    const response = await providerFetch(metaGraphUrl("oauth/access_token"), {
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
    return exchangeMetaLongLivedToken((await response.json()) as TokenResponse);
  }

  if (provider === "linkedin") {
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

  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
  if (!clientKey || !clientSecret) throw new Error("TikTok OAuth credentials are missing.");
  const response = await providerFetch("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });
  if (!response.ok) throw new Error("TikTok token exchange failed.");
  return (await response.json()) as TokenResponse;
}

async function grantedScopes(provider: SupportedProvider, token: TokenResponse) {
  if (provider !== "meta" || !token.access_token) {
    return (token.scope ?? "").split(/[ ,]+/).filter(Boolean);
  }

  const response = await providerFetch(metaGraphUrl("me/permissions"), {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  if (!response.ok) return (token.scope ?? "").split(/[ ,]+/).filter(Boolean);
  const payload = (await response.json()) as {
    data?: Array<{ permission?: string; status?: string }>;
  };
  return (payload.data ?? [])
    .filter((item) => item.status === "granted" && item.permission)
    .map((item) => String(item.permission));
}

async function providerIdentity(
  provider: SupportedProvider,
  token: string,
  scopes: string[],
): Promise<ProviderIdentity> {
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
        kind: "search_console_property",
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
        kind: "google_analytics_property",
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
      providerFetch(`${metaGraphUrl("me")}?fields=id,name`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      providerFetch(
        `${metaGraphUrl("me/accounts")}?fields=id,name,access_token,tasks,instagram_business_account{id,username,name,profile_picture_url}&limit=100`,
        { headers: { Authorization: `Bearer ${token}` } },
      ),
    ]);
    if (!profileResponse.ok || !pagesResponse.ok) {
      throw new Error("Meta Page or Instagram capability verification failed.");
    }
    const profile = (await profileResponse.json()) as Record<string, unknown>;
    const pages = (await pagesResponse.json()) as { data?: MetaPage[] };
    const accountId = typeof profile.id === "string" ? profile.id : null;
    if (!accountId) throw new Error("Meta account identity is incomplete.");

    const pageRows = pages.data ?? [];
    const instagramRows = pageRows
      .filter((page) => page.instagram_business_account?.id)
      .map((page) => ({ page, instagram: page.instagram_business_account as MetaInstagramAccount }));
    const assets: Array<Record<string, unknown>> = [];
    const assetCredentials: AssetCredential[] = [];

    for (const page of pageRows) {
      assets.push({
        kind: "facebook_page",
        id: page.id ?? "page",
        name: page.name ?? "Facebook Page",
        tasks: page.tasks ?? [],
        instagram_business_account_id: page.instagram_business_account?.id ?? null,
      });
      if (page.id && page.access_token) {
        assetCredentials.push({
          assetId: page.id,
          assetKind: "facebook_page",
          credential: page.access_token,
          metadata: {
            name: page.name ?? null,
            instagram_business_account_id: page.instagram_business_account?.id ?? null,
          },
        });
      }
    }
    for (const item of instagramRows) {
      assets.push({
        kind: "instagram_account",
        id: item.instagram.id,
        username: item.instagram.username ?? null,
        name: item.instagram.name ?? null,
        profile_picture_url: item.instagram.profile_picture_url ?? null,
        page_id: item.page.id ?? null,
        page_name: item.page.name ?? null,
      });
    }

    const hasInstagramPublishScope = scopes.includes("instagram_content_publish");
    const hasInstagramInsightsScope = scopes.includes("instagram_manage_insights");
    const hasFacebookPublishScope = scopes.includes("pages_manage_posts");
    const publishableInstagramRows = instagramRows.filter((item) => item.page.id && item.page.access_token);
    const verifiedCapabilities = ["identity", "pages.list", "pages.engagement.read"];
    if (instagramRows.length) verifiedCapabilities.push("instagram.account.linked");
    if (publishableInstagramRows.length && hasInstagramPublishScope) verifiedCapabilities.push("instagram.publish");
    if (instagramRows.length && hasInstagramInsightsScope) verifiedCapabilities.push("instagram.insights.read");
    if (pageRows.length && hasFacebookPublishScope) verifiedCapabilities.push("facebook.publish");

    const instagramReady = publishableInstagramRows.length > 0 && hasInstagramPublishScope;
    const facebookReady = pageRows.length > 0 && hasFacebookPublishScope;
    const connectionReady = instagramReady || facebookReady;
    const connectionIssue = connectionReady
      ? null
      : !pageRows.length
        ? "No approved Facebook Page is available for publishing."
        : !hasFacebookPublishScope && !hasInstagramPublishScope
          ? "Meta publishing permissions were not granted."
          : !instagramRows.length
            ? "Facebook is visible but no Professional Instagram account is linked to an approved Page."
            : !publishableInstagramRows.length
              ? "The linked Instagram account does not have a usable Page publishing credential."
              : "No verified Meta publishing rail is ready.";

    return {
      accountName: String(profile.name ?? "Meta account"),
      accountId,
      accountType: "meta_business",
      assets,
      assetCredentials,
      verifiedCapabilities,
      connectionReady,
      connectionIssue,
    };
  }

  if (provider === "linkedin") {
    const response = await providerFetch("https://api.linkedin.com/v2/userinfo", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error("LinkedIn identity verification failed.");
    const profile = (await response.json()) as Record<string, unknown>;
    const accountId = typeof profile.sub === "string" ? profile.sub : null;
    if (!accountId) throw new Error("LinkedIn account identity is incomplete.");
    const accountName = String(profile.name ?? profile.email ?? "LinkedIn account");
    const canPublishMember = scopes.includes("w_member_social");
    return {
      accountName,
      accountId,
      accountType: "linkedin_member",
      assets: [{
        kind: "linkedin_member",
        id: accountId,
        urn: `urn:li:person:${accountId}`,
        name: accountName,
      }],
      verifiedCapabilities: canPublishMember ? ["identity", "linkedin.publish.member"] : ["identity"],
      connectionReady: canPublishMember,
      connectionIssue: canPublishMember ? null : "Share on LinkedIn permission was not granted.",
    };
  }

  const response = await providerFetch(
    "https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name",
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok) throw new Error("TikTok identity verification failed.");
  const payload = (await response.json()) as {
    data?: { user?: { open_id?: string; union_id?: string; avatar_url?: string; display_name?: string } };
    error?: { code?: string; message?: string };
  };
  if (payload.error?.code && payload.error.code !== "ok") throw new Error("TikTok identity verification failed.");
  const user = payload.data?.user;
  const accountId = user?.open_id ?? null;
  if (!accountId) throw new Error("TikTok account identity is incomplete.");
  const accountName = user?.display_name || "TikTok account";
  const verifiedCapabilities = ["identity"];
  if (scopes.includes("video.publish")) verifiedCapabilities.push("tiktok.publish");
  if (scopes.includes("video.upload")) verifiedCapabilities.push("tiktok.upload");
  const connectionReady = verifiedCapabilities.includes("tiktok.publish") || verifiedCapabilities.includes("tiktok.upload");
  return {
    accountName,
    accountId,
    accountType: "tiktok_creator",
    assets: [{
      kind: "tiktok_account",
      id: accountId,
      union_id: user?.union_id ?? null,
      name: accountName,
      avatar_url: user?.avatar_url ?? null,
    }],
    verifiedCapabilities,
    connectionReady,
    connectionIssue: connectionReady ? null : "TikTok Content Posting permissions were not granted.",
  };
}

async function persistMetaAssetCredentials(
  workspaceId: string,
  userId: string,
  credentials: AssetCredential[],
) {
  const admin = createAdminClient();
  if (!admin) throw new Error("Orbit provider credential vault is unavailable.");

  const { error: deleteError } = await admin
    .from("integration_asset_credentials")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("provider", "meta");
  if (deleteError) throw new Error("Existing Meta asset credentials could not be rotated.");

  if (!credentials.length) return;
  const { error: insertError } = await admin.from("integration_asset_credentials").insert(
    credentials.map((credential) => ({
      workspace_id: workspaceId,
      provider: "meta",
      asset_id: credential.assetId,
      asset_kind: credential.assetKind,
      credential_ciphertext: encryptIntegrationSecret(credential.credential),
      metadata: credential.metadata,
      connected_by: userId,
    })),
  );
  if (insertError) throw new Error("Meta asset credentials could not be stored securely.");
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

    const scopes = await grantedScopes(provider, token);
    let identity: ProviderIdentity;
    try {
      identity = await providerIdentity(provider, token.access_token, scopes);
    } catch {
      return back(request, provider, "error", "oauth_capability_verification_failed");
    }

    if (provider === "meta") {
      try {
        await persistMetaAssetCredentials(workspace.id, user.id, identity.assetCredentials ?? []);
      } catch (error) {
        console.error("Meta asset credential persistence failed", error);
        return back(request, provider, "error", "oauth_asset_credential_save_failed");
      }
    }

    const now = new Date().toISOString();
    const expiresAt = token.expires_in ? new Date(Date.now() + token.expires_in * 1000).toISOString() : null;
    const status = identity.connectionReady === false ? "attention" : "connected";
    const instagramAssets = identity.assets.filter((asset) => asset.kind === "instagram_account");
    const facebookAssets = identity.assets.filter((asset) => asset.kind === "facebook_page");

    const { error } = await supabase.from("integration_connections").upsert(
      {
        workspace_id: workspace.id,
        provider,
        status,
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
          credentialModel: provider === "meta" ? "oauth2_long_lived_user_plus_page_tokens" : "oauth2_authorization_code",
          verifiedCapabilities: identity.verifiedCapabilities,
          capabilitiesVerifiedAt: now,
          connectionIssue: identity.connectionIssue ?? null,
          metaGraphVersion: provider === "meta" ? metaGraphVersion() : null,
          linkedInstagramAccounts: provider === "meta" ? instagramAssets.length : null,
          facebookPages: provider === "meta" ? facebookAssets.length : null,
          tiktokAuditRequired: provider === "tiktok" && identity.verifiedCapabilities.includes("tiktok.publish") ? true : null,
        },
        connected_by: user.id,
        connected_at: now,
        disconnected_at: null,
        updated_at: now,
      },
      { onConflict: "workspace_id,provider" },
    );
    if (error) return back(request, provider, "error", "oauth_save_failed");

    return back(
      request,
      provider,
      "notice",
      status === "attention" ? `${provider}_connected_attention` : `${provider}_connected`,
    );
  } catch (error) {
    console.error("OAuth provider callback failed", provider, error);
    return back(request, provider, "error", "oauth_callback_failed");
  }
}
