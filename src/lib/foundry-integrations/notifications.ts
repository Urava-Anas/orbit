import "server-only";

import {
  emailConfig,
  whatsappConfig,
} from "@/lib/foundry-integrations/config";
import type {
  FoundryOutboundNotification,
  FoundrySyncStudent,
} from "@/lib/foundry-integrations/types";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function sendFoundryEmail(
  student: FoundrySyncStudent,
  notification: FoundryOutboundNotification,
  idempotencyKey: string,
) {
  const config = emailConfig();
  if (!student.email) throw new Error("Student email is missing");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({
      from: config.from,
      to: [student.email],
      subject: `[Urava Foundry] ${notification.title}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#18221c">
          <p style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#53705c">Urava Foundry</p>
          <h1 style="font-size:24px">${escapeHtml(notification.title)}</h1>
          <p style="font-size:16px;line-height:1.6">${escapeHtml(notification.body)}</p>
          <p><a href="${config.appUrl}/login" style="display:inline-block;padding:12px 18px;background:#173f2a;color:white;text-decoration:none;border-radius:9px">Open Orbit</a></p>
          <p style="font-size:12px;color:#718077">This update was enabled with your recorded notification consent.</p>
        </div>
      `,
    }),
  });
  const body = (await response.json().catch(() => ({}))) as {
    id?: string;
    message?: string;
  };
  if (!response.ok) {
    throw new Error(
      `Resend ${response.status}: ${body.message ?? "request failed"}`,
    );
  }
  return body.id ?? idempotencyKey;
}

function normalizeWhatsAppNumber(value: string) {
  let digits = value.replaceAll(/\D/g, "");
  if (digits.startsWith("0") && digits.length === 11) {
    digits = `92${digits.slice(1)}`;
  }
  if (digits.length < 10 || digits.length > 15) {
    throw new Error("WhatsApp number is not in international format");
  }
  return digits;
}

export async function sendFoundryWhatsApp(
  number: string,
  notification: FoundryOutboundNotification,
) {
  const config = whatsappConfig();
  const response = await fetch(
    `https://graph.facebook.com/${config.version}/${config.phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: normalizeWhatsAppNumber(number),
        type: "template",
        template: {
          name: config.template,
          language: { code: config.language },
          components: [
            {
              type: "body",
              parameters: [
                { type: "text", text: notification.title.slice(0, 180) },
                { type: "text", text: notification.body.slice(0, 900) },
                { type: "text", text: `${config.appUrl}/login` },
              ],
            },
          ],
        },
      }),
    },
  );
  const body = (await response.json().catch(() => ({}))) as {
    messages?: Array<{ id: string }>;
    error?: { message?: string };
  };
  if (!response.ok) {
    throw new Error(
      `WhatsApp ${response.status}: ${body.error?.message ?? "request failed"}`,
    );
  }
  return body.messages?.[0]?.id ?? "accepted";
}
