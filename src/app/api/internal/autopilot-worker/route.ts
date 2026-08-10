import {
  createDecipheriv,
  createHash,
  createHmac,
  timingSafeEqual,
} from "node:crypto";
import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { runStageFourCompletionPlanner } from "@/lib/agents/stage4-completion-planner";
import { runStageFourAutopilotWorker } from "@/lib/agents/stage4-worker";
import { createAdminClient } from "@/lib/supabase/admin";
import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/config";

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

async function consumeSchedulerInvocation(request: Request) {
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
    const consumed = (await response.json().catch(() => false)) === true;
    return consumed ? token : null;
  } catch {
    return null;
  }
}

function decryptSchedulerServiceRole(request: Request, token: string) {
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
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function authorisedContext(request: Request): Promise<AuthorisedContext> {
  const received = request.headers.get("authorization");
  if (received) {
    const secrets = [
      process.env.CRON_SECRET,
      process.env.ORBIT_AUTOPILOT_WORKER_SECRET,
    ].filter((secret): secret is string => Boolean(secret));
    if (secrets.some((secret) => safeMatch(received, `Bearer ${secret}`))) {
      return { authorised: true, admin: createAdminClient() };
    }
  }

  const serviceAuth = request.headers.get("x-orbit-service-auth");
  if (serviceAuth) {
    const serviceIdentities = [
      process.env.SUPABASE_SECRET_KEY,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    ].filter((secret): secret is string => Boolean(secret));
    const matchedSecret = serviceIdentities.find((serviceSecret) => {
      const expected = createHmac("sha256", serviceSecret)
        .update("orbit-stage4-worker:v1")
        .digest("hex");
      return safeMatch(serviceAuth, expected);
    });
    if (matchedSecret) {
      return { authorised: true, admin: createAdminClient() ?? ephemeralAdmin(matchedSecret) };
    }
  }

  const token = await consumeSchedulerInvocation(request);
  if (!token) return { authorised: false, admin: null };
  const encryptedServiceRole = decryptSchedulerServiceRole(request, token);
  if (!encryptedServiceRole) return { authorised: false, admin: null };
  return { authorised: true, admin: ephemeralAdmin(encryptedServiceRole) };
}

async function handle(request: Request) {
  const context = await authorisedContext(request);
  if (!context.authorised) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const completionPlanner = await runStageFourCompletionPlanner(context.admin ?? undefined);
    const result = await runStageFourAutopilotWorker(8, context.admin ?? undefined);
    console.info("Stage 4 Autopilot worker completed", {
      completionPlanned: completionPlanner.planned,
      completionErrors: completionPlanner.errors,
      planned: result.planned,
      claimed: result.claimed,
      succeeded: result.succeeded,
      failed: result.failed,
      blocked: result.blocked,
    });
    return NextResponse.json(
      { ...result, completionPlanner },
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
}

export const GET = handle;
export const POST = handle;
