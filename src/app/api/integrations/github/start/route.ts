import { NextResponse } from "next/server";
import { requireFounderFoundry } from "@/lib/foundry";
import {
  githubAppReady,
  githubInstallUrl,
  issueIntegrationState,
  registerIntegrationState,
} from "@/lib/integration-connections";
import { consumeRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { workspace, user } = await requireFounderFoundry();
  const fallback = new URL("/dashboard/plugins", request.url);
  fallback.searchParams.set("plugin", "app:github");
  fallback.searchParams.set("connect", "github");

  const quota = await consumeRateLimit({
    scope: "integration.github.start",
    subject: `${workspace.id}:${user.id}`,
    limit: 10,
    windowSeconds: 600,
  });
  if (!quota.allowed) {
    fallback.searchParams.set("error", "github_rate_limited");
    return NextResponse.redirect(fallback);
  }

  if (!githubAppReady()) {
    fallback.searchParams.set("error", "github_platform_setup");
    return NextResponse.redirect(fallback);
  }

  try {
    const state = issueIntegrationState({ workspaceId: workspace.id, userId: user.id, provider: "github" });
    await registerIntegrationState(state, { workspaceId: workspace.id, userId: user.id, provider: "github" });
    return NextResponse.redirect(githubInstallUrl(state));
  } catch (error) {
    console.error("GitHub integration state issuance failed", error);
    fallback.searchParams.set("error", "github_state_failed");
    return NextResponse.redirect(fallback);
  }
}
