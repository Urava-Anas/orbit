import { NextResponse } from "next/server";
import { requireFounderFoundry } from "@/lib/foundry";
import {
  githubAppReady,
  githubInstallUrl,
  issueIntegrationState,
} from "@/lib/integration-connections";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { workspace, user } = await requireFounderFoundry();
  const fallback = new URL("/dashboard/connect?integration=github", request.url);
  fallback.hash = "integrations";

  if (!githubAppReady()) {
    fallback.searchParams.set("error", "github_platform_setup");
    return NextResponse.redirect(fallback);
  }

  const state = issueIntegrationState({
    workspaceId: workspace.id,
    userId: user.id,
    provider: "github",
  });

  return NextResponse.redirect(githubInstallUrl(state));
}
