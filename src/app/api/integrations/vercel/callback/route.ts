import { NextResponse } from "next/server";
import { requireFounderFoundry } from "@/lib/foundry";
import {
  consumeIntegrationState,
  encryptIntegrationSecret,
  vercelCallbackUrl,
  verifyIntegrationState,
} from "@/lib/integration-connections";

export const dynamic = "force-dynamic";

function back(request: Request, key: "error" | "notice", value: string) {
  const url = new URL("/dashboard/plugins", request.url);
  url.searchParams.set("plugin", "app:vercel");
  url.searchParams.set("connect", "vercel");
  url.searchParams.set(key, value);
  return NextResponse.redirect(url);
}

async function vercelFetch(url: string, init: RequestInit = {}) {
  return fetch(url, {
    ...init,
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(12_000),
  });
}

type TokenResponse = {
  access_token?: string;
  team_id?: string | null;
  user_id?: string | null;
  token_type?: string;
  error?: string;
};

type ProjectsResponse = {
  projects?: Array<{
    id: string;
    name: string;
    framework?: string | null;
    accountId?: string;
  }>;
};

export async function GET(request: Request) {
  const callback = new URL(request.url);
  const stateToken = callback.searchParams.get("state") ?? "";
  const code = callback.searchParams.get("code") ?? "";
  const configurationId = callback.searchParams.get("configurationId") ?? "";
  const callbackTeamId = callback.searchParams.get("teamId");

  if (!stateToken || !code || !configurationId) {
    return back(request, "error", "vercel_oauth_incomplete");
  }

  try {
    const state = verifyIntegrationState(stateToken, "vercel");
    const { supabase, workspace, user } = await requireFounderFoundry();
    if (state.workspaceId !== workspace.id || state.userId !== user.id) {
      return back(request, "error", "vercel_state_mismatch");
    }
    await consumeIntegrationState(stateToken, state);

    const clientId = process.env.VERCEL_CLIENT_ID;
    const clientSecret = process.env.VERCEL_CLIENT_SECRET;
    if (!clientId || !clientSecret) return back(request, "error", "vercel_platform_setup");

    const exchange = await vercelFetch("https://api.vercel.com/v2/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: vercelCallbackUrl(),
      }),
    });
    const token = (await exchange.json().catch(() => ({}))) as TokenResponse;
    if (!exchange.ok || !token.access_token) return back(request, "error", "vercel_oauth_exchange");

    const teamId = token.team_id ?? callbackTeamId ?? null;
    const authHeaders = { Authorization: `Bearer ${token.access_token}` };
    const teamQuery = teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";

    const [configurationResponse, projectsResponse, accountResponse] = await Promise.all([
      vercelFetch(`https://api.vercel.com/v1/integrations/configuration/${encodeURIComponent(configurationId)}${teamQuery}`, {
        headers: authHeaders,
      }),
      vercelFetch(`https://api.vercel.com/v9/projects?limit=100${teamId ? `&teamId=${encodeURIComponent(teamId)}` : ""}`, {
        headers: authHeaders,
      }),
      vercelFetch(teamId ? `https://api.vercel.com/v2/teams/${encodeURIComponent(teamId)}` : "https://api.vercel.com/v2/user", {
        headers: authHeaders,
      }),
    ]);

    if (!configurationResponse.ok || !projectsResponse.ok || !accountResponse.ok) {
      return back(request, "error", "vercel_capability_verification_failed");
    }

    const configuration = (await configurationResponse.json()) as Record<string, unknown>;
    const projectsData = (await projectsResponse.json()) as ProjectsResponse;
    const account = (await accountResponse.json()) as Record<string, unknown>;
    const projects = projectsData.projects ?? [];
    const accountName =
      (typeof account.name === "string" && account.name) ||
      (typeof account.username === "string" && account.username) ||
      (typeof account.slug === "string" && account.slug) ||
      (teamId ? "Vercel team" : "Vercel account");
    const now = new Date().toISOString();

    const { error } = await supabase.from("integration_connections").upsert(
      {
        workspace_id: workspace.id,
        provider: "vercel",
        status: "connected",
        provider_installation_id: configurationId,
        provider_account_id: teamId ?? token.user_id ?? null,
        provider_account_name: accountName,
        provider_account_type: teamId ? "team" : "user",
        access_token_ciphertext: encryptIntegrationSecret(token.access_token),
        refresh_token_ciphertext: null,
        token_expires_at: null,
        scopes: [],
        selected_assets: projects.map((project) => ({
          id: project.id,
          name: project.name,
          framework: project.framework ?? null,
          accountId: project.accountId ?? null,
        })),
        metadata: {
          configuration,
          credentialModel: "vercel_external_integration",
          verifiedCapabilities: ["configuration.read", "account.read", "projects.list"],
          capabilitiesVerifiedAt: now,
        },
        connected_by: user.id,
        connected_at: now,
        disconnected_at: null,
        updated_at: now,
      },
      { onConflict: "workspace_id,provider" },
    );
    if (error) return back(request, "error", "vercel_save_failed");

    return back(request, "notice", "vercel_connected");
  } catch (error) {
    console.error("Vercel integration callback failed", error);
    return back(request, "error", "vercel_callback_failed");
  }
}
