import { NextResponse } from "next/server";
import { getGeoapifyRuntimeStatus } from "@/lib/geoapify";
import { githubAppReady, vercelIntegrationReady } from "@/lib/integration-connections";
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
  return false;
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
    .select("status,provider_account_name,provider_account_type,selected_assets,updated_at")
    .eq("workspace_id", workspace.id)
    .eq("provider", provider)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Connection status could not be loaded." }, { status: 500 });
  }

  const selectedAssets = Array.isArray(data?.selected_assets) ? data.selected_assets : [];
  return NextResponse.json(
    {
      provider,
      connected: data?.status === "connected",
      status: data?.status ?? "disconnected",
      accountName: data?.provider_account_name ?? null,
      accountType: data?.provider_account_type ?? null,
      assetCount: selectedAssets.length,
      platformReady: platformReady(provider),
      updatedAt: data?.updated_at ?? null,
    },
    { headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } },
  );
}
