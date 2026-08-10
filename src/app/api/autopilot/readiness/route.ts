import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isStageFourGatewayConfigured } from "@/lib/agents/stage4-gateway";
import { stageFourProviderReadiness } from "@/lib/agents/stage4-providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const workspaceSchema = z.string().uuid();

export async function GET(request: Request) {
  const supabase = await createClient();
  const auth = await supabase.auth.getUser();
  if (auth.error || !auth.data.user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const workspace = workspaceSchema.safeParse(new URL(request.url).searchParams.get("workspaceId"));
  if (!workspace.success) {
    return NextResponse.json({ error: "A valid workspaceId is required." }, { status: 400 });
  }

  const membership = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspace.data)
    .eq("user_id", auth.data.user.id)
    .maybeSingle();
  if (membership.error || !membership.data) {
    return NextResponse.json({ error: "Workspace access denied." }, { status: 403 });
  }

  const config = await supabase
    .from("orbit_autopilot_configs")
    .select("state,mode,external_actions_enabled,kill_switch_engaged,last_preflight_result,last_preflight_at")
    .eq("workspace_id", workspace.data)
    .maybeSingle();
  if (config.error) {
    return NextResponse.json({ error: "Unable to load Autopilot readiness." }, { status: 500 });
  }

  return NextResponse.json(
    {
      workspaceId: workspace.data,
      config: config.data,
      gatewayConfigured: isStageFourGatewayConfigured(),
      providers: stageFourProviderReadiness(),
      paymentInstructionsConfigured: Boolean(process.env.ORBIT_PAYMENT_INSTRUCTIONS?.trim()),
      externalRuntimeEnabled: process.env.ORBIT_EXTERNAL_ACTIONS_ENABLED === "true",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
