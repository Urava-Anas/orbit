import { NextResponse } from "next/server";
import {
  issueIntegrationState,
  oauthProviderReady,
  orbitBaseUrl,
  registerIntegrationState,
  type OAuthProvider,
} from "@/lib/integration-connections";
import { consumeRateLimit } from "@/lib/rate-limit";
import { requireWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ provider: string }> };
type SupportedProvider = Exclude<OAuthProvider, "github" | "vercel">;

const supported = new Set<SupportedProvider>([
  "google_search_console",
  "google_analytics",
  "meta",
  "linkedin",
]);

function isSupported(value: string): value is SupportedProvider {
  return supported.has(value as SupportedProvider);
}

function back(request: Request, provider: string, error: string) {
  const url = new URL("/dashboard/plugins", request.url);
  url.searchParams.set("plugin", `app:${provider}`);
  url.searchParams.set("connect", provider);
  url.searchParams.set("error", error);
  return NextResponse.redirect(url);
}

function callbackUrl(provider: SupportedProvider) {
  return `${orbitBaseUrl()}/api/integrations/oauth/${provider}/callback`;
}

function recoverMisroutedOAuthResponse(request: Request, provider: SupportedProvider) {
  const incoming = new URL(request.url);
  const hasOAuthResponse =
    incoming.searchParams.has("code") ||
    incoming.searchParams.has("state") ||
    incoming.searchParams.has("error") ||
    incoming.searchParams.has("error_code") ||
    incoming.searchParams.has("error_reason");

  if (!hasOAuthResponse) return null;

  const callback = new URL(`/api/integrations/oauth/${provider}/callback`, request.url);
  incoming.searchParams.forEach((value, key) => callback.searchParams.append(key, value));
  return NextResponse.redirect(callback, 307);
}

function metaGraphVersion() {
  return process.env.META_GRAPH_API_VERSION?.trim() || "v25.0";
}

function authorizationUrl(provider: SupportedProvider, state: string) {
  const redirectUri = callbackUrl(provider);

  if (provider === "google_search_console" || provider === "google_analytics") {
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID ?? process.env.GOOGLE_CLIENT_ID;
    if (!clientId) throw new Error("Google OAuth client ID is not configured.");
    const scopes = provider === "google_search_console"
      ? ["openid", "email", "profile", "https://www.googleapis.com/auth/webmasters.readonly"]
      : ["openid", "email", "profile", "https://www.googleapis.com/auth/analytics.readonly"];
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", scopes.join(" "));
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("include_granted_scopes", "true");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("state", state);
    return url;
  }

  if (provider === "meta") {
    const clientId = process.env.META_APP_ID;
    if (!clientId) throw new Error("Meta App ID is not configured.");
    const url = new URL(`https://www.facebook.com/${metaGraphVersion()}/dialog/oauth`);
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set(
      "scope",
      [
        "public_profile",
        "pages_show_list",
        "pages_read_engagement",
        "pages_manage_posts",
        "instagram_basic",
        "instagram_content_publish",
        "instagram_manage_insights",
      ].join(","),
    );
    url.searchParams.set("auth_type", "rerequest");
    url.searchParams.set("state", state);
    return url;
  }

  const clientId = process.env.LINKEDIN_CLIENT_ID;
  if (!clientId) throw new Error("LinkedIn Client ID is not configured.");
  const url = new URL("https://www.linkedin.com/oauth/v2/authorization");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  // Identity only. Organisation/publishing permissions are not claimed until separately reviewed.
  url.searchParams.set("scope", "openid profile email");
  url.searchParams.set("state", state);
  return url;
}

export async function GET(request: Request, { params }: RouteContext) {
  const { provider } = await params;
  if (!isSupported(provider)) return back(request, provider, "unsupported_integration");

  const recoveredResponse = recoverMisroutedOAuthResponse(request, provider);
  if (recoveredResponse) return recoveredResponse;

  const { workspace, user, role } = await requireWorkspace();
  if (role !== "owner" && role !== "admin") return back(request, provider, "integration_permission_required");

  const quota = await consumeRateLimit({
    scope: "integration.oauth.start",
    subject: `${workspace.id}:${user.id}:${provider}`,
    limit: 10,
    windowSeconds: 600,
  });
  if (!quota.allowed) return back(request, provider, "oauth_rate_limited");
  if (!oauthProviderReady(provider)) return back(request, provider, `${provider}_auth_config`);

  try {
    const state = issueIntegrationState({ workspaceId: workspace.id, userId: user.id, provider });
    await registerIntegrationState(state, { workspaceId: workspace.id, userId: user.id, provider });
    return NextResponse.redirect(authorizationUrl(provider, state));
  } catch (error) {
    console.error("OAuth provider start failed", provider, error);
    return back(request, provider, "oauth_state_failed");
  }
}
