import "server-only";

import type { AiGatewayRequest, AiUsage } from "@/lib/ai/types";

type AdapterInput = {
  baseUrl: string;
  apiKey: string | null;
  model: string;
  request: AiGatewayRequest;
  timeoutMs: number;
};

type AdapterResult = {
  content: string;
  usage: AiUsage;
  raw: unknown;
};

function completionUrl(baseUrl: string) {
  const normalized = baseUrl.replace(/\/+$/, "");
  return normalized.endsWith("/v1")
    ? `${normalized}/chat/completions`
    : `${normalized}/v1/chat/completions`;
}

function numeric(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export async function invokeOpenAiCompatible(
  input: AdapterInput,
): Promise<AdapterResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs);

  try {
    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    if (input.apiKey) headers.authorization = `Bearer ${input.apiKey}`;

    const body: Record<string, unknown> = {
      model: input.model,
      messages: input.request.messages,
    };

    if (input.request.maxOutputTokens) {
      body.max_tokens = input.request.maxOutputTokens;
    }
    if (typeof input.request.temperature === "number") {
      body.temperature = input.request.temperature;
    }

    const response = await fetch(completionUrl(input.baseUrl), {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
    });

    const payload = (await response.json().catch(() => null)) as
      | Record<string, unknown>
      | null;

    if (!response.ok) {
      const providerMessage =
        payload &&
        typeof payload.error === "object" &&
        payload.error &&
        "message" in payload.error &&
        typeof payload.error.message === "string"
          ? payload.error.message
          : `Provider returned HTTP ${response.status}`;
      throw new Error(providerMessage);
    }

    const choices = Array.isArray(payload?.choices) ? payload.choices : [];
    const first = choices[0] as
      | { message?: { content?: unknown }; finish_reason?: unknown }
      | undefined;
    const content =
      first?.message && typeof first.message.content === "string"
        ? first.message.content
        : "";

    const usageObject =
      payload?.usage && typeof payload.usage === "object"
        ? (payload.usage as Record<string, unknown>)
        : {};

    const inputTokens = numeric(
      usageObject.prompt_tokens ?? usageObject.input_tokens,
    );
    const outputTokens = numeric(
      usageObject.completion_tokens ?? usageObject.output_tokens,
    );
    const totalTokens =
      numeric(usageObject.total_tokens) || inputTokens + outputTokens;

    return {
      content,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens,
      },
      raw: payload,
    };
  } finally {
    clearTimeout(timeout);
  }
}
