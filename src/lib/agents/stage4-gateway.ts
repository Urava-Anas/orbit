import { createHmac, timingSafeEqual } from "node:crypto";

export type StageFourGatewayEnvelope = {
  requestId: string;
  workspaceId: string;
  actionRequestId: string;
  capabilityKey: string;
  channel: string;
  destination: string | null;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  requestedAt: string;
};

export type StageFourGatewayResult = {
  ok: boolean;
  provider: string;
  providerRequestId: string | null;
  responseSummary: Record<string, unknown>;
  errorCode: string | null;
};

function automaticGatewayUrl() {
  const host =
    process.env.VERCEL_URL?.trim() ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  return host ? `https://${host}/api/internal/external-action-gateway` : null;
}

export function stageFourGatewayUrl() {
  return process.env.ORBIT_EXTERNAL_ACTION_GATEWAY_URL?.trim() || automaticGatewayUrl();
}

export function stageFourGatewaySecret() {
  return (
    process.env.ORBIT_EXTERNAL_ACTION_GATEWAY_SECRET?.trim() ||
    process.env.ORBIT_AUTOPILOT_WORKER_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    null
  );
}

export function isStageFourGatewayConfigured() {
  return Boolean(
    process.env.ORBIT_EXTERNAL_ACTIONS_ENABLED === "true" &&
      stageFourGatewayUrl() &&
      stageFourGatewaySecret(),
  );
}

export function signStageFourGatewayBody(body: string, secret: string) {
  return createHmac("sha256", secret).update(body).digest("hex");
}

export function verifyStageFourGatewaySignature(
  body: string,
  signature: string,
  secret: string,
) {
  const expected = signStageFourGatewayBody(body, secret);
  const actualBuffer = Buffer.from(signature, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  if (actualBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(actualBuffer, expectedBuffer);
}

function validateGatewayUrl(raw: string) {
  const url = new URL(raw);
  if (url.protocol !== "https:") {
    throw new Error("Stage 4 external action gateway must use HTTPS.");
  }
  if (url.username || url.password) {
    throw new Error("Stage 4 gateway URL must not contain embedded credentials.");
  }
  return url;
}

export async function dispatchStageFourGateway(
  envelope: StageFourGatewayEnvelope,
): Promise<StageFourGatewayResult> {
  if (process.env.ORBIT_EXTERNAL_ACTIONS_ENABLED !== "true") {
    return {
      ok: false,
      provider: "orbit_gateway",
      providerRequestId: null,
      responseSummary: { blocked: true, reason: "ORBIT_EXTERNAL_ACTIONS_ENABLED is not true." },
      errorCode: "external_actions_disabled",
    };
  }

  const rawUrl = stageFourGatewayUrl();
  const secret = stageFourGatewaySecret();
  if (!rawUrl || !secret) {
    return {
      ok: false,
      provider: "orbit_gateway",
      providerRequestId: null,
      responseSummary: { blocked: true, reason: "External gateway URL or secret is missing." },
      errorCode: "gateway_not_configured",
    };
  }

  let url: URL;
  try {
    url = validateGatewayUrl(rawUrl);
  } catch (error) {
    return {
      ok: false,
      provider: "orbit_gateway",
      providerRequestId: null,
      responseSummary: {
        blocked: true,
        reason: error instanceof Error ? error.message : "Invalid external gateway URL.",
      },
      errorCode: "invalid_gateway_url",
    };
  }

  const body = JSON.stringify(envelope);
  const signature = signStageFourGatewayBody(body, secret);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Orbit-Stage4/1.0",
        "X-Orbit-Signature": signature,
        "X-Orbit-Signature-Version": "v1",
        "X-Orbit-Request-Id": envelope.requestId,
        "Idempotency-Key": envelope.idempotencyKey,
      },
      body,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });

    let responsePayload: Record<string, unknown> = {};
    try {
      const parsed = (await response.json()) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        responsePayload = parsed as Record<string, unknown>;
      }
    } catch {
      responsePayload = { status: response.status, statusText: response.statusText };
    }

    const provider =
      typeof responsePayload.provider === "string"
        ? responsePayload.provider.slice(0, 120)
        : "orbit_gateway";
    const providerRequestId =
      typeof responsePayload.providerRequestId === "string"
        ? responsePayload.providerRequestId.slice(0, 500)
        : null;

    if (!response.ok || responsePayload.ok === false) {
      return {
        ok: false,
        provider,
        providerRequestId,
        responseSummary: {
          status: response.status,
          ...responsePayload,
        },
        errorCode:
          typeof responsePayload.errorCode === "string"
            ? responsePayload.errorCode.slice(0, 120)
            : `gateway_http_${response.status}`,
      };
    }

    return {
      ok: true,
      provider,
      providerRequestId,
      responseSummary: {
        status: response.status,
        ...responsePayload,
      },
      errorCode: null,
    };
  } catch (error) {
    return {
      ok: false,
      provider: "orbit_gateway",
      providerRequestId: null,
      responseSummary: {
        exception: error instanceof Error ? error.message : "Unknown gateway failure",
      },
      errorCode: "gateway_transport_error",
    };
  }
}
