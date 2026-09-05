import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { invokeOpenAiCompatible } from "@/lib/ai/openai-compatible";
import type {
  AiGatewayRequest,
  AiGatewayResponse,
  AiModelConfig,
  AiProviderConfig,
  AiWorkspacePolicy,
} from "@/lib/ai/types";
import { recordCompanyEvent } from "@/lib/memory/store";
import { createAdminClient } from "@/lib/supabase/admin";

type Candidate = {
  model: AiModelConfig;
  provider: AiProviderConfig;
};

function adminOrThrow() {
  const admin = createAdminClient();
  if (!admin) {
    throw new Error(
      "AI Gateway is unavailable until server-side Supabase credentials are configured.",
    );
  }
  return admin;
}

function digest(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function estimateInputTokens(request: AiGatewayRequest) {
  const chars = request.messages.reduce(
    (total, message) => total + message.content.length,
    0,
  );
  return Math.max(1, Math.ceil(chars / 4));
}

function estimateCostMicrousd(
  model: AiModelConfig,
  request: AiGatewayRequest,
) {
  const inputTokens = estimateInputTokens(request);
  const outputTokens = request.maxOutputTokens ?? model.max_output_tokens ?? 1024;
  return Math.ceil(
    (inputTokens * Number(model.input_cost_microusd_per_million || 0)) /
      1_000_000 +
      (outputTokens * Number(model.output_cost_microusd_per_million || 0)) /
        1_000_000,
  );
}

function actualCostMicrousd(
  model: AiModelConfig,
  inputTokens: number,
  outputTokens: number,
) {
  return Math.ceil(
    (inputTokens * Number(model.input_cost_microusd_per_million || 0)) /
      1_000_000 +
      (outputTokens * Number(model.output_cost_microusd_per_million || 0)) /
        1_000_000,
  );
}

async function loadPolicy(
  workspaceId: string,
  capability: string,
): Promise<AiWorkspacePolicy | null> {
  const admin = adminOrThrow();
  const { data, error } = await admin
    .from("ai_workspace_policies")
    .select(
      "preferred_model_id,fallback_model_ids,max_cost_microusd,max_latency_ms,require_local,enabled",
    )
    .eq("workspace_id", workspaceId)
    .eq("capability", capability)
    .maybeSingle();

  if (error) throw new Error(`AI policy lookup failed: ${error.message}`);
  return (data as AiWorkspacePolicy | null) ?? null;
}

async function loadCandidates(
  workspaceId: string,
  request: AiGatewayRequest,
): Promise<{ policy: AiWorkspacePolicy | null; candidates: Candidate[] }> {
  const admin = adminOrThrow();
  const policy = await loadPolicy(workspaceId, request.capability);

  if (policy && !policy.enabled) {
    throw new Error(`AI capability "${request.capability}" is disabled for this workspace.`);
  }

  let models: AiModelConfig[] = [];

  const orderedIds = policy
    ? [
        policy.preferred_model_id,
        ...(policy.fallback_model_ids ?? []),
      ].filter((id): id is string => Boolean(id))
    : [];

  if (orderedIds.length) {
    const { data, error } = await admin
      .from("ai_model_catalog")
      .select(
        "id,provider_key,model_key,display_name,capabilities,max_output_tokens,input_cost_microusd_per_million,output_cost_microusd_per_million,enabled,priority",
      )
      .in("id", orderedIds);

    if (error) throw new Error(`AI model lookup failed: ${error.message}`);

    const byId = new Map(
      ((data ?? []) as AiModelConfig[]).map((model) => [model.id, model]),
    );
    models = orderedIds.flatMap((id) => {
      const model = byId.get(id);
      return model ? [model] : [];
    });
  } else {
    const { data, error } = await admin
      .from("ai_model_catalog")
      .select(
        "id,provider_key,model_key,display_name,capabilities,max_output_tokens,input_cost_microusd_per_million,output_cost_microusd_per_million,enabled,priority",
      )
      .eq("enabled", true)
      .contains("capabilities", [request.capability])
      .order("priority", { ascending: true })
      .limit(8);

    if (error) throw new Error(`AI model lookup failed: ${error.message}`);
    models = (data ?? []) as AiModelConfig[];
  }

  models = models.filter(
    (model) =>
      model.enabled && model.capabilities.includes(request.capability),
  );

  if (!models.length) return { policy, candidates: [] };

  const providerKeys = [...new Set(models.map((model) => model.provider_key))];
  const { data: providersData, error: providersError } = await admin
    .from("ai_provider_catalog")
    .select(
      "provider_key,display_name,adapter_kind,base_url,credential_env,is_local,enabled,capabilities",
    )
    .in("provider_key", providerKeys);

  if (providersError) {
    throw new Error(`AI provider lookup failed: ${providersError.message}`);
  }

  const providers = new Map(
    ((providersData ?? []) as AiProviderConfig[]).map((provider) => [
      provider.provider_key,
      provider,
    ]),
  );

  const candidates = models.flatMap((model) => {
    const provider = providers.get(model.provider_key);
    if (!provider || !provider.enabled) return [];
    if (!provider.capabilities.includes(request.capability)) return [];
    if (policy?.require_local && !provider.is_local) return [];
    if (
      policy?.max_cost_microusd != null &&
      estimateCostMicrousd(model, request) > policy.max_cost_microusd
    ) {
      return [];
    }
    return [{ model, provider }];
  });

  return { policy, candidates };
}

async function createRun(input: {
  workspaceId: string;
  actorId: string;
  correlationId: string;
  request: AiGatewayRequest;
  candidate: Candidate;
}) {
  const admin = adminOrThrow();
  const { data, error } = await admin
    .from("ai_request_runs")
    .insert({
      workspace_id: input.workspaceId,
      actor_id: input.actorId,
      module: input.request.module,
      action: input.request.action,
      capability: input.request.capability,
      sensitivity: input.request.sensitivity,
      provider_key: input.candidate.provider.provider_key,
      model_key: input.candidate.model.model_key,
      status: "running",
      input_digest: digest(input.request.messages),
      correlation_id: input.correlationId,
      metadata: {
        request_metadata: input.request.metadata ?? {},
        provider_is_local: input.candidate.provider.is_local,
      },
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) throw new Error(`AI telemetry start failed: ${error.message}`);
  return String(data.id);
}

async function finishRun(
  requestId: string,
  patch: Record<string, unknown>,
) {
  const admin = adminOrThrow();
  const { error } = await admin
    .from("ai_request_runs")
    .update({
      ...patch,
      completed_at: new Date().toISOString(),
    })
    .eq("id", requestId);

  if (error) throw new Error(`AI telemetry finish failed: ${error.message}`);
}

export async function runAiGateway(input: {
  workspaceId: string;
  actorId: string;
  request: AiGatewayRequest;
}): Promise<AiGatewayResponse> {
  const { policy, candidates } = await loadCandidates(
    input.workspaceId,
    input.request,
  );

  if (!candidates.length) {
    throw new Error(
      "No enabled AI model satisfies this workspace policy. Configure a model before using the gateway.",
    );
  }

  const correlationId = randomUUID();
  let lastError: Error | null = null;

  for (const candidate of candidates) {
    const requestId = await createRun({
      ...input,
      correlationId,
      candidate,
    });
    const started = Date.now();

    try {
      const apiKey = candidate.provider.credential_env
        ? process.env[candidate.provider.credential_env]?.trim() || null
        : null;

      if (candidate.provider.credential_env && !apiKey) {
        throw new Error(
          `Provider credential ${candidate.provider.credential_env} is not configured.`,
        );
      }

      const timeoutMs = Math.min(
        policy?.max_latency_ms ?? 120_000,
        120_000,
      );

      const result = await invokeOpenAiCompatible({
        baseUrl: candidate.provider.base_url,
        apiKey,
        model: candidate.model.model_key,
        request: input.request,
        timeoutMs,
      });

      const latencyMs = Date.now() - started;
      const costMicrousd = actualCostMicrousd(
        candidate.model,
        result.usage.inputTokens,
        result.usage.outputTokens,
      );

      await finishRun(requestId, {
        status: "succeeded",
        output_digest: digest(result.content),
        input_tokens: result.usage.inputTokens,
        output_tokens: result.usage.outputTokens,
        total_tokens: result.usage.totalTokens,
        cost_microusd: costMicrousd,
        latency_ms: latencyMs,
      });

      await recordCompanyEvent({
        workspaceId: input.workspaceId,
        actorId: input.actorId,
        domain: input.request.module,
        eventType: "ai.request.succeeded",
        entityType: "ai_request",
        entityId: requestId,
        correlationId,
        payload: {
          action: input.request.action,
          capability: input.request.capability,
          sensitivity: input.request.sensitivity,
          provider: candidate.provider.provider_key,
          model: candidate.model.model_key,
          provider_is_local: candidate.provider.is_local,
          usage: result.usage,
          cost_microusd: costMicrousd,
          latency_ms: latencyMs,
        },
      });

      return {
        requestId,
        correlationId,
        provider: candidate.provider.provider_key,
        model: candidate.model.model_key,
        content: result.content,
        usage: result.usage,
        latencyMs,
        costMicrousd,
      };
    } catch (error) {
      const failure = error instanceof Error ? error : new Error("AI provider failed.");
      lastError = failure;
      const latencyMs = Date.now() - started;

      await finishRun(requestId, {
        status: "failed",
        latency_ms: latencyMs,
        error_code: "PROVIDER_FAILURE",
        error_message: failure.message.slice(0, 1000),
      }).catch(() => undefined);

      await recordCompanyEvent({
        workspaceId: input.workspaceId,
        actorId: input.actorId,
        domain: input.request.module,
        eventType: "ai.request.failed",
        entityType: "ai_request",
        entityId: requestId,
        correlationId,
        payload: {
          action: input.request.action,
          capability: input.request.capability,
          provider: candidate.provider.provider_key,
          model: candidate.model.model_key,
          provider_is_local: candidate.provider.is_local,
          latency_ms: latencyMs,
          error_code: "PROVIDER_FAILURE",
        },
      }).catch(() => undefined);
    }
  }

  throw lastError ?? new Error("All eligible AI providers failed.");
}
