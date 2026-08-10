import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const DEFAULT_WORKER_URL =
  "https://orbit-git-agent-stage4-controlled-autopilot-urava-pros.vercel.app/api/internal/autopilot-worker";

function toHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function serviceAuth(secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode("orbit-stage4-worker:v1"),
  );
  return toHex(signature);
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (!serviceRole) {
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
    const auth = await serviceAuth(serviceRole);
    const response = await fetch(workerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Orbit-Service-Auth": auth,
        "User-Agent": "Orbit-Supabase-Stage4-Scheduler/1.0",
      },
      body: JSON.stringify({ source: "supabase_scheduler", version: 1 }),
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
