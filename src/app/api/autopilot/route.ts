import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { advanceStageThreeOpportunity } from "@/lib/agents/stage3-runtime";
import {
  configureStageFourAutopilot,
  controlStageFourAutopilot,
  decideStageFourAction,
  executeStageFourAction,
  requestStageFourAction,
  runStageFourPreflight,
  setStageFourPolicyGrant,
} from "@/lib/agents/stage4-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const workspaceSchema = z.string().uuid();
const postSchema = z.object({
  workspaceId: workspaceSchema,
  operation: z.enum([
    "configure",
    "preflight",
    "control",
    "set_policy",
    "request_action",
    "decide_action",
    "execute_action",
    "advance_sales",
  ]),
  input: z.unknown().optional(),
});

async function authenticatedContext() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return { error: NextResponse.json({ error: "Authentication required." }, { status: 401 }) } as const;
  }
  return { supabase, userId: data.user.id } as const;
}

export async function GET(request: Request) {
  const context = await authenticatedContext();
  if ("error" in context) return context.error;

  const url = new URL(request.url);
  const parsedWorkspace = workspaceSchema.safeParse(url.searchParams.get("workspaceId"));
  if (!parsedWorkspace.success) {
    return NextResponse.json({ error: "A valid workspaceId is required." }, { status: 400 });
  }
  const workspaceId = parsedWorkspace.data;

  const membership = await context.supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", context.userId)
    .maybeSingle();
  if (membership.error || !membership.data) {
    return NextResponse.json({ error: "Workspace access denied." }, { status: 403 });
  }

  const [config, policies, actions, incidents, approvals] = await Promise.all([
    context.supabase
      .from("orbit_autopilot_configs")
      .select("state,mode,external_actions_enabled,kill_switch_engaged,timezone,working_hours_start,working_hours_end,working_days,max_daily_outbound,min_seconds_between_outbound,max_open_opportunities,max_active_projects,max_consecutive_failures,consecutive_failures,last_external_action_at,last_preflight_at,last_preflight_result,blocked_reason,updated_at")
      .eq("workspace_id", workspaceId)
      .maybeSingle(),
    context.supabase
      .from("orbit_autopilot_policy_grants")
      .select("id,capability_key,enabled,approval_mode,constraints,approved_at,valid_from,valid_until,updated_at")
      .eq("workspace_id", workspaceId)
      .order("capability_key"),
    context.supabase
      .from("orbit_external_action_requests")
      .select("id,request_id,opportunity_id,capability_key,channel,destination,status,approval_source,attempts,max_attempts,scheduled_at,provider,provider_request_id,error,created_at,updated_at,completed_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(50),
    context.supabase
      .from("orbit_autopilot_incidents")
      .select("id,action_request_id,severity,incident_code,summary,status,created_at,resolved_at")
      .eq("workspace_id", workspaceId)
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(50),
    context.supabase
      .from("orbit_agent_approvals")
      .select("id,run_id,task_id,authority_level,proposed_action,proposed_payload,approval_route,status,expires_at,created_at")
      .eq("workspace_id", workspaceId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const firstError = [config.error, policies.error, actions.error, incidents.error, approvals.error].find(Boolean);
  if (firstError) {
    return NextResponse.json({ error: "Unable to load Autopilot state." }, { status: 500 });
  }

  return NextResponse.json(
    {
      workspaceId,
      config: config.data,
      policies: policies.data ?? [],
      actions: actions.data ?? [],
      incidents: incidents.data ?? [],
      pendingApprovals: approvals.data ?? [],
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const context = await authenticatedContext();
  if ("error" in context) return context.error;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = postSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid Autopilot request.", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { workspaceId, operation, input } = parsed.data;
  try {
    let result: unknown;
    switch (operation) {
      case "configure":
        result = await configureStageFourAutopilot(
          context.supabase,
          workspaceId,
          context.userId,
          input ?? {},
        );
        break;
      case "preflight":
        result = await runStageFourPreflight(
          context.supabase,
          workspaceId,
          context.userId,
        );
        break;
      case "control":
        result = await controlStageFourAutopilot(
          context.supabase,
          workspaceId,
          context.userId,
          input ?? {},
        );
        break;
      case "set_policy":
        result = await setStageFourPolicyGrant(
          context.supabase,
          workspaceId,
          context.userId,
          input ?? {},
        );
        break;
      case "request_action":
        result = await requestStageFourAction(
          context.supabase,
          workspaceId,
          context.userId,
          input ?? {},
        );
        break;
      case "decide_action":
        result = await decideStageFourAction(
          context.supabase,
          workspaceId,
          context.userId,
          input ?? {},
        );
        break;
      case "execute_action":
        result = await executeStageFourAction(
          context.supabase,
          workspaceId,
          context.userId,
          input ?? {},
        );
        break;
      case "advance_sales":
        result = await advanceStageThreeOpportunity(
          context.supabase,
          workspaceId,
          context.userId,
          input ?? {},
        );
        break;
    }

    return NextResponse.json({ ok: true, operation, result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Stage 4 Autopilot error.";
    const forbidden = /authority|access denied|permission/i.test(message);
    return NextResponse.json(
      { error: message },
      { status: forbidden ? 403 : 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
