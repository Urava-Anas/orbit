export const aiCapabilities = [
  "chat",
  "structured_output",
  "tool_calling",
  "vision",
] as const;

export type AiCapability = (typeof aiCapabilities)[number];

export const aiSensitivities = [
  "public",
  "internal",
  "confidential",
  "restricted",
] as const;

export type AiSensitivity = (typeof aiSensitivities)[number];

export type AiMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type AiGatewayRequest = {
  module: string;
  action: string;
  capability: AiCapability;
  sensitivity: AiSensitivity;
  messages: AiMessage[];
  maxOutputTokens?: number;
  temperature?: number;
  metadata?: Record<string, unknown>;
};

export type AiUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type AiGatewayResponse = {
  requestId: string;
  correlationId: string;
  provider: string;
  model: string;
  content: string;
  usage: AiUsage;
  latencyMs: number;
  costMicrousd: number;
};

export type AiProviderConfig = {
  provider_key: string;
  display_name: string;
  adapter_kind: "openai_compatible";
  base_url: string;
  credential_env: string | null;
  is_local: boolean;
  enabled: boolean;
  capabilities: string[];
};

export type AiModelConfig = {
  id: string;
  provider_key: string;
  model_key: string;
  display_name: string;
  capabilities: string[];
  max_output_tokens: number | null;
  input_cost_microusd_per_million: number;
  output_cost_microusd_per_million: number;
  enabled: boolean;
  priority: number;
};

export type AiWorkspacePolicy = {
  preferred_model_id: string | null;
  fallback_model_ids: string[];
  max_cost_microusd: number | null;
  max_latency_ms: number | null;
  require_local: boolean;
  enabled: boolean;
};
