import { NextResponse } from "next/server";
import { requireFounderFoundry } from "@/lib/foundry";
import {
  consumeIntegrationState,
  createGitHubAppJwt,
  verifyIntegrationState,
} from "@/lib/integration-connections";

export const dynamic = "force-dynamic";

const apiHeaders = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2026-03-10",
};

function back(request: Request, key: "error" | "notice", value: string) {
  const url = new URL("/dashboard/plugins", request.url);
  url.searchParams.set("plugin", "app:github");
  url.searchParams.set("connect", "github");
  url.searchParams.set(key, value);
  return NextResponse.redirect(url);
}

type Installation = {
  id: number;
  repository_selection?: string;
  permissions?: Record<string, string>;
  account?: { id?: number; login?: string; type?: string; avatar_url?: string } | null;
};

type RepositoriesResponse = {
  repositories?: Array<{
    id: number;
    name: string;
    full_name: string;
    private: boolean;
    html_url: string;
  }>;
};

export async function GET(request: Request) {
  const callback = new URL(request.url);
  const stateToken = callback.searchParams.get("state") ?? "";
  const installationId = callback.searchParams.get("installation_id") ?? "";
  if (!stateToken || !installationId) return back(request, "error", "github_oauth_incomplete");

  try {
    const state = verifyIntegrationState(stateToken, "github");
    const { supabase, workspace, user } = await requireFounderFoundry();
    if (state.workspaceId !== workspace.id || state.userId !== user.id) {
      return back(request, "error", "github_state_mismatch");
    }
    await consumeIntegrationState(stateToken, state);

    const jwt = createGitHubAppJwt();
    const installationResponse = await fetch(
      `https://api.github.com/app/installations/${encodeURIComponent(installationId)}`,
      { headers: { ...apiHeaders, Authorization: `Bearer ${jwt}` }, cache: "no-store", redirect: "error" },
    );
    if (!installationResponse.ok) return back(request, "error", "github_installation_unverified");
    const installation = (await installationResponse.json()) as Installation;

    const tokenResponse = await fetch(
      `https://api.github.com/app/installations/${encodeURIComponent(installationId)}/access_tokens`,
      {
        method: "POST",
        headers: { ...apiHeaders, Authorization: `Bearer ${jwt}` },
        cache: "no-store",
        redirect: "error",
      },
    );
    if (!tokenResponse.ok) return back(request, "error", "github_installation_token_failed");
    const tokenData = (await tokenResponse.json()) as { token?: string };
    if (!tokenData.token) return back(request, "error", "github_installation_token_failed");

    const repositoriesResponse = await fetch("https://api.github.com/installation/repositories?per_page=100", {
      headers: { ...apiHeaders, Authorization: `Bearer ${tokenData.token}` },
      cache: "no-store",
      redirect: "error",
    });
    const repositoriesData = repositoriesResponse.ok
      ? ((await repositoriesResponse.json()) as RepositoriesResponse)
      : { repositories: [] };
    const repositories = repositoriesData.repositories ?? [];

    const { error } = await supabase.from("integration_connections").upsert(
      {
        workspace_id: workspace.id,
        provider: "github",
        status: "connected",
        provider_installation_id: String(installation.id),
        provider_account_id: installation.account?.id ? String(installation.account.id) : null,
        provider_account_name: installation.account?.login ?? "GitHub account",
        provider_account_type: installation.account?.type ?? null,
        access_token_ciphertext: null,
        refresh_token_ciphertext: null,
        token_expires_at: null,
        scopes: [],
        selected_assets: repositories.map((repo) => ({
          id: repo.id,
          name: repo.name,
          fullName: repo.full_name,
          private: repo.private,
          url: repo.html_url,
        })),
        metadata: {
          repositorySelection: installation.repository_selection ?? "selected",
          permissions: installation.permissions ?? {},
          avatarUrl: installation.account?.avatar_url ?? null,
          credentialModel: "github_app_installation",
        },
        connected_by: user.id,
        connected_at: new Date().toISOString(),
        disconnected_at: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "workspace_id,provider" },
    );
    if (error) return back(request, "error", "github_save_failed");

    return back(request, "notice", "github_connected");
  } catch (error) {
    console.error("GitHub App callback failed", error);
    return back(request, "error", "github_callback_failed");
  }
}
