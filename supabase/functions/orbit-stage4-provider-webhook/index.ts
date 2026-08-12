import "jsr:@supabase/functions-js/edge-runtime.d.ts";

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

const ORBIT_PROVIDER_REPLY_URL =
  "https://orbit-two-delta.vercel.app/api/internal/provider-reply";

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function toHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function constantTimeBytes(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return toHex(digest);
}

async function hmacSha256(keyBytes: Uint8Array, value: string) {
  const keyMaterial = new Uint8Array(keyBytes.byteLength);
  keyMaterial.set(keyBytes);
  const key = await crypto.subtle.importKey(
    "raw",
    keyMaterial.buffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)),
  );
}

async function providerSecret(
  supabaseUrl: string,
  serviceRole: string,
  workspaceId: string,
  key: string,
) {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/get_stage4_provider_secret`, {
    method: "POST",
    headers: {
      apikey: serviceRole,
      Authorization: `Bearer ${serviceRole}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_workspace_id: workspaceId, p_key: key }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) return null;
  const value = await response.json().catch(() => null);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function mintInvocation(supabaseUrl: string, serviceRole: string) {
  const token = randomToken();
  const tokenHash = await sha256(token);
  const expiresAt = new Date(Date.now() + 2 * 60 * 1000).toISOString();
  const response = await fetch(`${supabaseUrl}/rest/v1/orbit_scheduler_invocations`, {
    method: "POST",
    headers: {
      apikey: serviceRole,
      Authorization: `Bearer ${serviceRole}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({ token_hash: tokenHash, expires_at: expiresAt }),
    signal: AbortSignal.timeout(8_000),
  });
  const rows = (await response.json().catch(() => [])) as Array<{ id?: string }>;
  const id = rows[0]?.id;
  if (!response.ok || !id) throw new Error("Unable to mint one-time provider invocation.");
  return { id, token };
}

async function encryptServiceRole(serviceRole: string, token: string) {
  const keyBytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(serviceRole),
    ),
  );
  return { iv: toBase64(iv), ciphertext: toBase64(encrypted) };
}

async function forwardReply(
  supabaseUrl: string,
  serviceRole: string,
  payload: {
    providerEventId: string;
    channel: "email" | "whatsapp";
    sender: string;
    responseText: string;
    occurredAt?: string;
  },
) {
  const invocation = await mintInvocation(supabaseUrl, serviceRole);
  const encryptedIdentity = await encryptServiceRole(serviceRole, invocation.token);
  const response = await fetch(ORBIT_PROVIDER_REPLY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Orbit-Scheduler-Invocation": invocation.id,
      "X-Orbit-Scheduler-Token": invocation.token,
      "X-Orbit-Supabase-Iv": encryptedIdentity.iv,
      "X-Orbit-Supabase-Ciphertext": encryptedIdentity.ciphertext,
      "User-Agent": "Orbit-Supabase-Stage4-Provider-Webhook/1.0",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Orbit provider reply ingress returned HTTP ${response.status}.`);
  }
  return body;
}

async function verifyMetaSignature(raw: string, supplied: string, appSecret: string) {
  if (!supplied.startsWith("sha256=")) return false;
  const expected = await hmacSha256(new TextEncoder().encode(appSecret), raw);
  let received: Uint8Array;
  try {
    const hex = supplied.slice("sha256=".length);
    if (!/^[0-9a-f]{64}$/i.test(hex)) return false;
    received = Uint8Array.from(hex.match(/.{2}/g) ?? [], (pair) => parseInt(pair, 16));
  } catch {
    return false;
  }
  return constantTimeBytes(received, expected);
}

async function verifySvix(raw: string, request: Request, secret: string) {
  const id = request.headers.get("svix-id")?.trim() ?? "";
  const timestamp = request.headers.get("svix-timestamp")?.trim() ?? "";
  const signatureHeader = request.headers.get("svix-signature")?.trim() ?? "";
  const timestampSeconds = Number(timestamp);
  if (!id || !Number.isFinite(timestampSeconds) || !signatureHeader) return null;
  if (Math.abs(Date.now() / 1000 - timestampSeconds) > 5 * 60) return null;
  if (!secret.startsWith("whsec_")) return null;

  let key: Uint8Array;
  try {
    key = fromBase64(secret.slice("whsec_".length));
  } catch {
    return null;
  }
  const expected = await hmacSha256(key, `${id}.${timestamp}.${raw}`);
  for (const entry of signatureHeader.split(/\s+/)) {
    const [version, signature] = entry.split(",", 2);
    if (version !== "v1" || !signature) continue;
    try {
      if (constantTimeBytes(fromBase64(signature), expected)) return id;
    } catch {
      // Ignore malformed signature entries.
    }
  }
  return null;
}

function whatsappMessageText(message: Record<string, unknown>) {
  const type = typeof message.type === "string" ? message.type : "";
  if (type === "text") return String(record(message.text).body ?? "").trim();
  if (type === "button") return String(record(message.button).text ?? "").trim();
  if (type === "interactive") {
    const interactive = record(message.interactive);
    return String(
      record(interactive.button_reply).title ??
        record(interactive.list_reply).title ??
        "",
    ).trim();
  }
  return "";
}

function plainText(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function validWorkspaceId(value: string | null) {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
}

Deno.serve(async (request: Request) => {
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim();
  if (!serviceRole || !supabaseUrl) return json({ error: "Service identity unavailable." }, 503);

  const url = new URL(request.url);
  const provider = url.searchParams.get("provider")?.trim().toLowerCase() ?? "";
  const workspaceId = url.searchParams.get("workspaceId")?.trim() ?? "";
  if (!validWorkspaceId(workspaceId)) return json({ error: "Valid workspaceId required." }, 400);

  if (provider === "whatsapp" && request.method === "GET") {
    const verifyToken = await providerSecret(
      supabaseUrl,
      serviceRole,
      workspaceId,
      "whatsapp_webhook_verify_token",
    );
    if (!verifyToken) return new Response("Webhook not configured", { status: 503 });
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode !== "subscribe" || token !== verifyToken || !challenge) {
      return new Response("Forbidden", { status: 403 });
    }
    return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }

  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  const raw = await request.text();

  try {
    if (provider === "whatsapp") {
      const appSecret = await providerSecret(
        supabaseUrl,
        serviceRole,
        workspaceId,
        "whatsapp_app_secret",
      );
      if (!appSecret) return json({ error: "WhatsApp webhook not configured." }, 503);
      const supplied = request.headers.get("x-hub-signature-256")?.trim() ?? "";
      if (!(await verifyMetaSignature(raw, supplied, appSecret))) {
        return json({ error: "Invalid webhook signature." }, 401);
      }
      const payload = JSON.parse(raw) as Record<string, unknown>;
      if (payload.object !== "whatsapp_business_account") return json({ ok: true, ignored: true });
      const results: unknown[] = [];
      for (const entryValue of Array.isArray(payload.entry) ? payload.entry : []) {
        const entry = record(entryValue);
        for (const changeValue of Array.isArray(entry.changes) ? entry.changes : []) {
          const change = record(changeValue);
          if (change.field !== "messages") continue;
          const value = record(change.value);
          for (const messageValue of Array.isArray(value.messages) ? value.messages : []) {
            const message = record(messageValue);
            const providerMessageId = typeof message.id === "string" ? message.id : "";
            const sender = typeof message.from === "string" ? message.from : "";
            const responseText = whatsappMessageText(message);
            if (!providerMessageId || !sender || !responseText) continue;
            const timestampSeconds = Number(message.timestamp);
            results.push(
              await forwardReply(supabaseUrl, serviceRole, {
                providerEventId: `whatsapp:${providerMessageId}`,
                channel: "whatsapp",
                sender,
                responseText,
                occurredAt: Number.isFinite(timestampSeconds)
                  ? new Date(timestampSeconds * 1000).toISOString()
                  : undefined,
              }),
            );
          }
        }
      }
      return json({ ok: true, processed: results.length, results });
    }

    if (provider === "resend") {
      const [webhookSecret, apiKey] = await Promise.all([
        providerSecret(supabaseUrl, serviceRole, workspaceId, "resend_webhook_secret"),
        providerSecret(supabaseUrl, serviceRole, workspaceId, "resend_api_key"),
      ]);
      if (!webhookSecret || !apiKey) return json({ error: "Resend webhook not configured." }, 503);
      const deliveryId = await verifySvix(raw, request, webhookSecret);
      if (!deliveryId) return json({ error: "Invalid webhook signature." }, 401);
      const event = JSON.parse(raw) as Record<string, unknown>;
      if (event.type !== "email.received") return json({ ok: true, ignored: true });
      const data = record(event.data);
      const emailId = typeof data.email_id === "string" ? data.email_id : "";
      const sender = typeof data.from === "string" ? data.from : "";
      if (!emailId || !sender) return json({ error: "Incomplete email.received payload." }, 400);
      const emailResponse = await fetch(
        `https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`,
        {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(12_000),
        },
      );
      const email = (await emailResponse.json().catch(() => ({}))) as Record<string, unknown>;
      if (!emailResponse.ok) return json({ error: "Unable to retrieve received email." }, 502);
      const responseText =
        (typeof email.text === "string" && email.text.trim()) ||
        (typeof email.html === "string" ? plainText(email.html) : "");
      if (!responseText) return json({ ok: true, ignored: true, reason: "empty_email_body" });
      const result = await forwardReply(supabaseUrl, serviceRole, {
        providerEventId: `resend:${deliveryId}`,
        channel: "email",
        sender,
        responseText,
        occurredAt: typeof event.created_at === "string" ? event.created_at : undefined,
      });
      return json({ ok: true, processed: 1, result });
    }

    return json({ error: "Unsupported provider." }, 404);
  } catch (error) {
    console.error("Stage 4 provider webhook failed safely", error);
    return json(
      { error: error instanceof Error ? error.message : "Provider webhook failed safely." },
      502,
    );
  }
});
