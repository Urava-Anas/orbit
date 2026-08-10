import "server-only";

import { createDecipheriv, createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/config";

export type StageFourOneTimeContext = {
  authorised: boolean;
  admin: SupabaseClient | null;
};

async function consumeInvocation(request: Request) {
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

  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/consume_stage4_scheduler_invocation`, {
      method: "POST",
      headers: {
        apikey: supabasePublishableKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_id: invocationId, p_token: token }),
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return null;
    return (await response.json().catch(() => false)) === true ? token : null;
  } catch {
    return null;
  }
}

function decryptServiceRole(request: Request, token: string) {
  const encodedIv = request.headers.get("x-orbit-supabase-iv")?.trim() ?? "";
  const encodedCiphertext = request.headers.get("x-orbit-supabase-ciphertext")?.trim() ?? "";
  if (!encodedIv || !encodedCiphertext) return null;

  try {
    const iv = Buffer.from(encodedIv, "base64");
    const encrypted = Buffer.from(encodedCiphertext, "base64");
    if (iv.length !== 12 || encrypted.length <= 16) return null;
    const key = createHash("sha256").update(token).digest();
    const ciphertext = encrypted.subarray(0, encrypted.length - 16);
    const authTag = encrypted.subarray(encrypted.length - 16);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8").trim();
    return plaintext.length >= 32 ? plaintext : null;
  } catch {
    return null;
  }
}

function ephemeralAdmin(secret: string) {
  return createClient(supabaseUrl, secret, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function stageFourOneTimeServiceContext(
  request: Request,
): Promise<StageFourOneTimeContext> {
  const token = await consumeInvocation(request);
  if (!token) return { authorised: false, admin: null };
  const serviceRole = decryptServiceRole(request, token);
  if (!serviceRole) return { authorised: false, admin: null };
  return { authorised: true, admin: ephemeralAdmin(serviceRole) };
}
