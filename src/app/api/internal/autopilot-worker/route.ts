import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runStageFourCompletionPlanner } from "@/lib/agents/stage4-completion-planner";
import { runWithStageFourExecutionClient } from "@/lib/agents/stage4-execution-context";
import { isStageFourGatewayConfigured } from "@/lib/agents/stage4-gateway";
import { stageFourProviderReadinessForWorkspace } from "@/lib/agents/stage4-providers";
import { runStageFourAutopilotWorker } from "@/lib/agents/stage4-worker";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

type AuthorisedContext = {
  authorised: boolean;
  admin: SupabaseClient | null;
};

function safeMatch(received: string, expected: string) {
  const actual = Buffer.from(received);
  const target = Buffer.from(expected);
  return actual.length === target.length && timingSafeEqual(actual, target);
}

function schedulerInvocationHeaders(request: Request) {
  if (request.method !== "POST") return null;
  const invocationId = request.headers.get("x-orbit-scheduler-invocation")?.trim();
  const token = request.headers.get("x-orbit-scheduler-token")?.trim();
  if (
    !invocationId ||
    !token ||
    !/^[0-9a-f-]{36}$/i.test(invocationId) ||
    !/^[0-9a-f]{64}$/i.test(token)
  ) {
    return null;
  }
  return { invocationId, token };
}

async function consumeSchedulerInvocation(
  admin: SupabaseClient,
  invocationId: string,
  token: string,
) {
  try {
    const { data, error } = await admin.rpc("consume_stage4_scheduler_invocation", {
      p_id: invocationId,
      p_token: token,
    });
    return !error && data === true;
  } catch {
    return false;
  }
}

async function authorisedContext(request: Request): Promise<AuthorisedContext> {
  const admin = createAdminClient();
  if (!admin) return { authorised: false, admin: null };

  const received = request.headers.get("authorization");
  if (received) {
    const secrets = [
      process.env.CRON_SECRET,
      process.env.ORBIT_AUTOPILOT_WORKER_SECRET,
    ].filter((secret): secret is string => Boolean(secret?.trim()));
    if (secrets.some((secret) => safeMatch(received, `Bearer ${secret.trim()}`))) {
      return { authorised: true, admin };
    }
  }

  const scheduler = schedulerInvocationHeaders(request);
  if (!scheduler) return { authorised: false, admin: null };
  const consumed = await consumeSchedulerInvocation(
    admin,
    scheduler.invocationId,
    scheduler.token,
  );
  return consumed
    ? { authorised: true, admin }
    : { authorised: false, admin: null };
}

async function handle(request: Request) {
  const context = await authorisedContext(request);
  if (!context.authorised || !context.admin) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const runWorker = async () => {
    try {
      const completionPlanner = await runStageFourCompletionPlanner(context.admin ?? undefined);
      const result = await runStageFourAutopilotWorker(8, context.admin ?? undefined);
      let workspaceReadiness: Array<Record<string, unknown>> = [];
      if (context.admin) {
        const configs = await context.admin
          .from("orbit_autopilot_configs")
          .select("workspace_id,state,mode,external_actions_enabled,kill_switch_engaged,payment_instructions")
          .order("created_at", { ascending: true });
        if (!configs.error) {
          workspaceReadiness = await Promise.all(
            (configs.data ?? []).map(async (config) => ({
              workspaceId: config.workspace_id,
              state: config.state,
              mode: config.mode,
              externalActionsEnabled: config.external_actions_enabled,
              killSwitchEngaged: config.kill_switch_engaged,
              gatewayConfigured: isStageFourGatewayConfigured(),
              providers: await stageFourProviderReadinessForWorkspace(config.workspace_id),
              paymentInstructionsConfigured: Boolean(
                typeof config.payment_instructions === "string" && config.payment_instructions.trim(),
              ),
            })),
          );
        }
      }
      console.info("Stage 4 Autopilot worker completed", {
        completionPlanned: completionPlanner.planned,
        completionErrors: completionPlanner.errors,
        planned: result.planned,
        claimed: result.claimed,
        succeeded: result.succeeded,
        failed: result.failed,
        blocked: result.blocked,
        workspaceReadiness,
      });
      return NextResponse.json(
        { ...result, completionPlanner, workspaceReadiness },
        {
          status: result.configured && completionPlanner.configured ? 200 : 503,
          headers: { "Cache-Control": "no-store" },
        },
      );
    } catch (error) {
      console.error("Stage 4 Autopilot worker failed safely", error);
      return NextResponse.json(
        { error: "Autopilot worker failed safely; governed actions remain retryable or blocked." },
        { status: 500, headers: { "Cache-Control": "no-store" } },
      );
    }
  };

  return runWithStageFourExecutionClient(context.admin, runWorker);
}

export const GET = handle;
export const POST = handle;
