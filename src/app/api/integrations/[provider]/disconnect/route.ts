import { NextResponse } from "next/server";
import { requireFounderFoundry } from "@/lib/foundry";
import {
  createGitHubAppJwt,
  decryptIntegrationSecret,
} from "@/lib/integration-connections";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ provider: string }> };

type Connection = {
  provider: string;
  provider_installation_id: string | null;
  provider_account_id: string | null;
  provider_account_type: string | null;
  access_token_ciphertext: string | null;
};

function back(request: Request, provider: string, key: "error" | "notice", value: string) {
  const url = new URL("/dashboard/plugins", request.url);
  url.searchParams.set("plugin", `app:${provider}`);
  url.searchParams.set("connect", provider);
  url.searchParams.set(key, value);
  return NextResponse.redirect(url, 303);
}

export async function POST(request: Request, { params }: RouteContext) {
  const { provider } = await params;
  if (!new Set(["github", "vercel"]).has(provider)) {
    return back(request, provider, "error", "unsupported_integration");
  }

  const { supabase, workspace } = await requireFounderFoundry();
  const { data, error } = await supabase
    .from("integration_connections")
    .select("provider,provider_installation_id,provider_account_id,provider_account_type,access_token_ciphertext")
    .eq("workspace_id", workspace.id)
    .eq("provider", provider)
    .maybeSingle();
  if (error || !data) return back(request, provider, "error", "integration_not_found");
  const connection = data as Connection;

  try {
    if (provider === "github" && connection.provider_installation_id) {
      const jwt = createGitHubAppJwt();
      const response = await fetch(
        `https://api.github.com/app/installations/${encodeURIComponent(connection.provider_installation_id)}`,
        {
          method: "DELETE",
          headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${jwt}`,
            "X-GitHub-Api-Version": "2026-03-10",
          },
          cache: "no-store",
        },
      );
      if (!response.ok && response.status !== 404) {
        return back(request, provider, "error", "github_disconnect_failed");
      }
    }

    if (provider === "vercel" && connection.provider_installation_id && connection.access_token_ciphertext) {
      const token = decryptIntegrationSecret(connection.access_token_ciphertext);
      const query =
        connection.provider_account_type === "team" && connection.provider_account_id
          ? `?teamId=${encodeURIComponent(connection.provider_account_id)}`
          : "";
      const response = await fetch(
        `https://api.vercel.com/v1/integrations/configuration/${encodeURIComponent(connection.provider_installation_id)}${query}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        },
      );
      if (!response.ok && response.status !== 404) {
        return back(request, provider, "error", "vercel_disconnect_failed");
      }
    }

    const { error: saveError } = await supabase
      .from("integration_connections")
      .update({
        status: "disconnected",
        access_token_ciphertext: null,
        refresh_token_ciphertext: null,
        token_expires_at: null,
        disconnected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("workspace_id", workspace.id)
      .eq("provider", provider);
    if (saveError) return back(request, provider, "error", "disconnect_save_failed");

    return back(request, provider, "notice", `${provider}_disconnected`);
  } catch (disconnectError) {
    console.error("Integration disconnect failed", provider, disconnectError);
    return back(request, provider, "error", "integration_disconnect_failed");
  }
}
