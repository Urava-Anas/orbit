import "jsr:@supabase/functions-js/edge-runtime.d.ts";

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

const DEFAULT_WORKER_URL =
  "https://orbit-git-agent-stage4-controlled-autopilot-urava-pros.vercel.app/api/internal/autopilot-worker";

function toHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
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
    signal: AbortSignal.timeout(10_000),
  });
  const rows = (await response.json().catch(() => [])) as Array<{ id?: string }>;
  const id = rows[0]?.id;
  if (!response.ok || !id) {
    throw new Error(`Scheduler invocation mint failed with HTTP ${response.status}.`);
  }
  return { id, token };
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim();
  if (!serviceRole || !supabaseUrl) {
    return new Response(JSON.stringify({ error: "Scheduler service identity is unavailable." }), {
      status: 503,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }

  const workerUrl = Deno.env.get("ORBIT_STAGE4_WORKER_URL")?.trim() || DEFAULT_WORKER_URL;
  if (!workerUrl.startsWith("https://")) {
    return new Response(JSON.stringify({ error: "Worker URL must use HTTPS." }), {
      status: 503,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }

  try {
    const invocation = await mintInvocation(supabaseUrl, serviceRole);
    const response = await fetch(workerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Orbit-Scheduler-Invocation": invocation.id,
        "X-Orbit-Scheduler-Token": invocation.token,
        "User-Agent": "Orbit-Supabase-Stage4-Scheduler/1.0",
      },
      body: JSON.stringify({ source: "supabase_scheduler", version: 2 }),
      signal: AbortSignal.timeout(55_000),
    });

    const text = await response.text();
    let payload: unknown = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = { upstreamStatus: response.status };
    }

    return new Response(JSON.stringify({
      ok: response.ok,
      workerStatus: response.status,
      worker: payload,
    }), {
      status: response.ok ? 200 : 502,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch (error) {
    return new Response(JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : "Stage 4 scheduler bridge failed.",
    }), {
      status: 502,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }
});
