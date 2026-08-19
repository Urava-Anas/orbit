import { NextResponse } from "next/server";
import { requireFounderFoundry } from "@/lib/foundry";
import {
  issueIntegrationState,
  registerIntegrationState,
  vercelInstallUrl,
  vercelIntegrationReady,
} from "@/lib/integration-connections";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { workspace, user } = await requireFounderFoundry();
  const fallback = new URL("/dashboard/plugins", request.url);
  fallback.searchParams.set("plugin", "app:vercel");
  fallback.searchParams.set("connect", "vercel");

  if (!vercelIntegrationReady()) {
    fallback.searchParams.set("error", "vercel_platform_setup");
    return NextResponse.redirect(fallback);
  }

  try {
    const state = issueIntegrationState({
      workspaceId: workspace.id,
      userId: user.id,
      provider: "vercel",
    });
    await registerIntegrationState(state, {
      workspaceId: workspace.id,
      userId: user.id,
      provider: "vercel",
    });
    return NextResponse.redirect(vercelInstallUrl(state));
  } catch (error) {
    console.error("Vercel integration state issuance failed", error);
    fallback.searchParams.set("error", "vercel_state_failed");
    return NextResponse.redirect(fallback);
  }
}
