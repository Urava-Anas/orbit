import "server-only";

import { getStageFourExecutionClient } from "@/lib/agents/stage4-execution-context";
import type { StageFourGatewayEnvelope, StageFourGatewayResult } from "@/lib/agents/stage4-gateway";

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const META_GRAPH_HOST = "https://graph.facebook.com";

type ProviderReadiness = {
  email: { configured: boolean; provider: "resend"; reason: string };
  whatsapp: { configured: boolean; provider: "meta_whatsapp_cloud"; reason: string };
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function safeJson(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function platformCredentialMode() {
  return process.env.ORBIT_PROVIDER_CREDENTIAL_MODE?.trim().toLowerCase() === "platform";
}

const templateKeys: Record<string, { vault: string; env: string }> = {
  "growth.outreach_send": {
    vault: "whatsapp_template_outreach",
    env: "ORBIT_WHATSAPP_TEMPLATE_OUTREACH",
  },
  "growth.followup_send": {
    vault: "whatsapp_template_followup",
    env: "ORBIT_WHATSAPP_TEMPLATE_FOLLOWUP",
  },
  "growth.proposal_send": {
    vault: "whatsapp_template_proposal",
    env: "ORBIT_WHATSAPP_TEMPLATE_PROPOSAL",
  },
  "cash.payment_request": {
    vault: "whatsapp_template_payment_request",
    env: "ORBIT_WHATSAPP_TEMPLATE_PAYMENT_REQUEST",
  },
  "growth.referral_send": {
    vault: "whatsapp_template_referral",
    env: "ORBIT_WHATSAPP_TEMPLATE_REFERRAL",
  },
};

async function vaultSecret(workspaceId: string, key: string) {
  const client = getStageFourExecutionClient();
  if (!client) return null;
  const result = await client.rpc("get_stage4_provider_secret", {
    p_workspace_id: workspaceId,
    p_key: key,
  });
  if (result.error) {
    console.error(`Stage 4 Vault provider lookup failed for ${key}`, result.error);
    return null;
  }
  return text(result.data) || null;
}

async function providerSetting(
  workspaceId: string,
  vaultKey: string,
  envKey: string,
) {
  const workspaceValue = await vaultSecret(workspaceId, vaultKey);
  if (workspaceValue) return workspaceValue;

  // Shared Urava/platform credentials are opt-in. A tenant that has not configured
  // its own provider must never silently send through another organisation's identity.
  if (!platformCredentialMode()) return null;
  return process.env[envKey]?.trim() || null;
}

async function whatsappTemplateName(workspaceId: string, capabilityKey: string) {
  const mapping = templateKeys[capabilityKey];
  if (!mapping) return null;
  return providerSetting(workspaceId, mapping.vault, mapping.env);
}

export function stageFourProviderReadiness(): ProviderReadiness {
  if (!platformCredentialMode()) {
    return {
      email: {
        configured: false,
        provider: "resend",
        reason: "Platform provider credentials are disabled; each workspace must use its own Vault credentials.",
      },
      whatsapp: {
        configured: false,
        provider: "meta_whatsapp_cloud",
        reason: "Platform provider credentials are disabled; each workspace must use its own Vault credentials.",
      },
    };
  }

  const emailConfigured = Boolean(
    process.env.RESEND_API_KEY?.trim() && process.env.ORBIT_EMAIL_FROM?.trim(),
  );
  const whatsappCore = Boolean(
    process.env.WHATSAPP_CLOUD_ACCESS_TOKEN?.trim() &&
      process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() &&
      process.env.WHATSAPP_GRAPH_API_VERSION?.trim(),
  );
  const whatsappHasTemplate = Object.values(templateKeys).some(
    ({ env }) => Boolean(process.env[env]?.trim()),
  );

  return {
    email: {
      configured: emailConfigured,
      provider: "resend",
      reason: emailConfigured
        ? "Explicit platform Resend credentials are configured."
        : "Platform Resend credentials are incomplete.",
    },
    whatsapp: {
      configured: whatsappCore && whatsappHasTemplate,
      provider: "meta_whatsapp_cloud",
      reason:
        whatsappCore && whatsappHasTemplate
          ? "Explicit platform WhatsApp credentials and a capability template are configured."
          : "Platform WhatsApp credentials are incomplete.",
    },
  };
}

export async function stageFourProviderReadinessForWorkspace(
  workspaceId: string,
): Promise<ProviderReadiness> {
  const [
    resendApiKey,
    emailFrom,
    whatsappToken,
    whatsappPhoneNumberId,
    whatsappGraphVersion,
    ...templates
  ] = await Promise.all([
    providerSetting(workspaceId, "resend_api_key", "RESEND_API_KEY"),
    providerSetting(workspaceId, "email_from", "ORBIT_EMAIL_FROM"),
    providerSetting(workspaceId, "whatsapp_access_token", "WHATSAPP_CLOUD_ACCESS_TOKEN"),
    providerSetting(workspaceId, "whatsapp_phone_number_id", "WHATSAPP_PHONE_NUMBER_ID"),
    providerSetting(workspaceId, "whatsapp_graph_api_version", "WHATSAPP_GRAPH_API_VERSION"),
    ...Object.entries(templateKeys).map(([capabilityKey]) =>
      whatsappTemplateName(workspaceId, capabilityKey),
    ),
  ]);
  const emailConfigured = Boolean(resendApiKey && emailFrom);
  const whatsappConfigured = Boolean(
    whatsappToken &&
      whatsappPhoneNumberId &&
      whatsappGraphVersion &&
      templates.some(Boolean),
  );
  return {
    email: {
      configured: emailConfigured,
      provider: "resend",
      reason: emailConfigured
        ? "A verified sender is available for this workspace."
        : platformCredentialMode()
          ? "Neither workspace Vault nor explicit platform Resend credentials are complete."
          : "Workspace Resend credentials are not configured.",
    },
    whatsapp: {
      configured: whatsappConfigured,
      provider: "meta_whatsapp_cloud",
      reason: whatsappConfigured
        ? "WhatsApp Cloud credentials and an approved capability template are available for this workspace."
        : platformCredentialMode()
          ? "Neither workspace Vault nor explicit platform WhatsApp credentials are complete."
          : "Workspace WhatsApp Cloud credentials and approved templates are required.",
    },
  };
}

function emailSubject(envelope: StageFourGatewayEnvelope) {
  const supplied = text(envelope.payload.subject);
  if (supplied) return supplied.slice(0, 240);
  const fallback: Record<string, string> = {
    "growth.outreach_send": "A short idea for your business",
    "growth.followup_send": "Following up",
    "growth.proposal_send": "Your proposal",
    "cash.payment_request": "Payment details for the agreed next step",
    "growth.referral_send": "A quick referral request",
  };
  return fallback[envelope.capabilityKey] ?? "Orbit message";
}

async function sendEmail(envelope: StageFourGatewayEnvelope): Promise<StageFourGatewayResult> {
  const [apiKey, from] = await Promise.all([
    providerSetting(envelope.workspaceId, "resend_api_key", "RESEND_API_KEY"),
    providerSetting(envelope.workspaceId, "email_from", "ORBIT_EMAIL_FROM"),
  ]);
  if (!apiKey || !from) {
    return {
      ok: false,
      provider: "resend",
      providerRequestId: null,
      responseSummary: { blocked: true, reason: "Resend is not configured for this workspace." },
      errorCode: "email_provider_not_configured",
    };
  }
  if (!envelope.destination) {
    return {
      ok: false,
      provider: "resend",
      providerRequestId: null,
      responseSummary: { blocked: true, reason: "Email destination is missing." },
      errorCode: "email_destination_missing",
    };
  }

  const body = text(envelope.payload.body);
  if (!body) {
    return {
      ok: false,
      provider: "resend",
      providerRequestId: null,
      responseSummary: { blocked: true, reason: "Email body is empty." },
      errorCode: "email_body_missing",
    };
  }

  const response = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": envelope.idempotencyKey,
    },
    body: JSON.stringify({
      from,
      to: [envelope.destination],
      subject: emailSubject(envelope),
      text: body,
      headers: {
        "X-Orbit-Request-Id": envelope.requestId,
        "X-Orbit-Action-Request-Id": envelope.actionRequestId,
      },
    }),
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });

  const payload = safeJson(await response.json().catch(() => ({})));
  const providerRequestId = text(payload.id) || null;
  if (!response.ok || !providerRequestId) {
    return {
      ok: false,
      provider: "resend",
      providerRequestId,
      responseSummary: { status: response.status, ...payload },
      errorCode: `resend_http_${response.status}`,
    };
  }

  return {
    ok: true,
    provider: "resend",
    providerRequestId,
    responseSummary: { status: response.status, accepted: true },
    errorCode: null,
  };
}

function normalizeWhatsAppDestination(value: string) {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = `92${digits.slice(1)}`;
  return digits;
}

async function sendWhatsApp(envelope: StageFourGatewayEnvelope): Promise<StageFourGatewayResult> {
  const [token, phoneNumberId, version, templateName, configuredLanguage] = await Promise.all([
    providerSetting(envelope.workspaceId, "whatsapp_access_token", "WHATSAPP_CLOUD_ACCESS_TOKEN"),
    providerSetting(envelope.workspaceId, "whatsapp_phone_number_id", "WHATSAPP_PHONE_NUMBER_ID"),
    providerSetting(envelope.workspaceId, "whatsapp_graph_api_version", "WHATSAPP_GRAPH_API_VERSION"),
    whatsappTemplateName(envelope.workspaceId, envelope.capabilityKey),
    providerSetting(envelope.workspaceId, "whatsapp_template_language", "ORBIT_WHATSAPP_TEMPLATE_LANGUAGE"),
  ]);
  const language = configuredLanguage || "en_US";

  if (!token || !phoneNumberId || !version || !templateName) {
    return {
      ok: false,
      provider: "meta_whatsapp_cloud",
      providerRequestId: null,
      responseSummary: {
        blocked: true,
        reason:
          "WhatsApp automation requires workspace Cloud API credentials and an approved template for this capability. Free-form business-initiated messaging is not used by Orbit Stage 4.",
      },
      errorCode: "whatsapp_template_not_configured",
    };
  }
  const destination = envelope.destination
    ? normalizeWhatsAppDestination(envelope.destination)
    : "";
  if (!destination) {
    return {
      ok: false,
      provider: "meta_whatsapp_cloud",
      providerRequestId: null,
      responseSummary: { blocked: true, reason: "WhatsApp destination is missing." },
      errorCode: "whatsapp_destination_missing",
    };
  }

  const body = text(envelope.payload.body);
  if (!body) {
    return {
      ok: false,
      provider: "meta_whatsapp_cloud",
      providerRequestId: null,
      responseSummary: { blocked: true, reason: "WhatsApp template body is empty." },
      errorCode: "whatsapp_body_missing",
    };
  }
  if (body.length > 1024) {
    return {
      ok: false,
      provider: "meta_whatsapp_cloud",
      providerRequestId: null,
      responseSummary: { blocked: true, reason: "WhatsApp template body exceeds the approved 1,024-character variable limit." },
      errorCode: "whatsapp_body_too_long",
    };
  }

  const response = await fetch(`${META_GRAPH_HOST}/${encodeURIComponent(version)}/${encodeURIComponent(phoneNumberId)}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: destination,
      type: "template",
      template: {
        name: templateName,
        language: { code: language },
        components: [
          {
            type: "body",
            parameters: [{ type: "text", text: body }],
          },
        ],
      },
    }),
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });

  const payload = safeJson(await response.json().catch(() => ({})));
  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  const first = safeJson(messages[0]);
  const providerRequestId = text(first.id) || null;
  if (!response.ok || !providerRequestId) {
    return {
      ok: false,
      provider: "meta_whatsapp_cloud",
      providerRequestId,
      responseSummary: { status: response.status, ...payload },
      errorCode: `whatsapp_http_${response.status}`,
    };
  }

  return {
    ok: true,
    provider: "meta_whatsapp_cloud",
    providerRequestId,
    responseSummary: { status: response.status, accepted: true, template: templateName },
    errorCode: null,
  };
}

export async function dispatchStageFourProvider(
  envelope: StageFourGatewayEnvelope,
): Promise<StageFourGatewayResult> {
  if (envelope.channel === "email") return sendEmail(envelope);
  if (envelope.channel === "whatsapp") return sendWhatsApp(envelope);
  return {
    ok: false,
    provider: "orbit_provider_router",
    providerRequestId: null,
    responseSummary: { blocked: true, reason: `Unsupported automated channel: ${envelope.channel}` },
    errorCode: "unsupported_automated_channel",
  };
}
