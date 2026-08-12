import { NextResponse } from "next/server";
import { requireFounderFoundry } from "@/lib/foundry";
import {
  issueIntegrationState,
  vercelInstallUrl,
  vercelIntegrationReady,
} from "@/lib/integration-connections";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { workspace, user } = await requireFounderFoundry();
  const fallback = new URL("/dashboard/connect?integration=vercel", request.url);
  fallback.hash = "integrations";

  if (!vercelIntegrationReady()) {
    fallback.searchParams.set("error", "vercel_platform_setup");
    return NextResponse.redirect(fallback);
  }

  const state = issueIntegrationState({
    workspaceId: workspace.id,
    userId: user.id,
    provider: "vercel",
  });

  return NextResponse.redirect(vercelInstallUrl(state));
}
