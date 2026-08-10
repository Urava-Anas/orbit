import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { executeStageFourAction } from "@/lib/agents/stage4-runtime";

type WorkerResult = {
  configured: boolean;
  claimed: number;
  succeeded: number;
  failed: number;
  blocked: number;
  results: Array<Record<string, unknown>>;
};

export async function runStageFourAutopilotWorker(limit = 8): Promise<WorkerResult> {
  const admin = createAdminClient();
  if (!admin) {
    return {
      configured: false,
      claimed: 0,
      succeeded: 0,
      failed: 0,
      blocked: 0,
      results: [],
    };
  }

  const boundedLimit = Math.max(1, Math.min(20, limit));
  const result: WorkerResult = {
    configured: true,
    claimed: 0,
    succeeded: 0,
    failed: 0,
    blocked: 0,
    results: [],
  };

  for (let index = 0; index < boundedLimit; index += 1) {
    const claim = await admin.rpc("claim_stage4_external_action");
    if (claim.error) {
      throw new Error(`Claim Stage 4 action: ${claim.error.message}`);
    }
    const actionRequestId = claim.data as string | null;
    if (!actionRequestId) break;
    result.claimed += 1;

    const action = await admin
      .from("orbit_external_action_requests")
      .select("id,workspace_id")
      .eq("id", actionRequestId)
      .single();
    if (action.error || !action.data) {
      result.failed += 1;
      result.results.push({
        actionRequestId,
        status: "failed_to_load",
      });
      continue;
    }

    const workspace = await admin
      .from("workspaces")
      .select("owner_id")
      .eq("id", action.data.workspace_id)
      .single();
    if (workspace.error || !workspace.data?.owner_id) {
      result.failed += 1;
      result.results.push({
        actionRequestId,
        workspaceId: action.data.workspace_id,
        status: "workspace_owner_missing",
      });
      continue;
    }

    try {
      const execution = await executeStageFourAction(
        admin,
        action.data.workspace_id,
        workspace.data.owner_id,
        { actionRequestId },
      );
      const status = String(execution.status);
      if (status === "succeeded") result.succeeded += 1;
      else if (status === "blocked") result.blocked += 1;
      else result.failed += 1;
      result.results.push({
        actionRequestId,
        workspaceId: action.data.workspace_id,
        ...execution,
      });
    } catch (error) {
      result.failed += 1;
      result.results.push({
        actionRequestId,
        workspaceId: action.data.workspace_id,
        status: "worker_exception",
        error: error instanceof Error ? error.message : "Unknown Stage 4 worker error",
      });
    }
  }

  return result;
}
