import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const authorization = req.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) {
    return json({ error: "Authentication required" }, 401);
  }

  const body = await req.json().catch(() => ({}));
  const inviteToken = String(body?.token || "").trim();
  if (!/^[a-f0-9]{64}$/i.test(inviteToken)) {
    return json({ error: "Valid invitation token required" }, 400);
  }

  // Resolve identity from the caller's JWT. The browser never supplies a user
  // or workspace ID to the claim RPC.
  const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: ANON_KEY,
      Authorization: authorization,
      Accept: "application/json",
    },
  });

  if (!userResponse.ok) {
    return json({ error: "Invalid session" }, 401);
  }

  const user = await userResponse.json();
  if (!user?.id) {
    return json({ error: "Invalid session" }, 401);
  }

  const serviceHeaders = new Headers({
    apikey: SERVICE_KEY,
    "Content-Type": "application/json",
    Accept: "application/json",
  });
  if (!SERVICE_KEY.startsWith("sb_")) {
    serviceHeaders.set("Authorization", `Bearer ${SERVICE_KEY}`);
  }

  const claimResponse = await fetch(
    `${SUPABASE_URL}/rest/v1/rpc/foundry_claim_invitation`,
    {
      method: "POST",
      headers: serviceHeaders,
      body: JSON.stringify({
        p_invite_token: inviteToken,
        p_user_id: user.id,
        p_evidence:
          "Invitation claimed by authenticated user through Orbit foundry-invite-claim",
      }),
    },
  );

  if (!claimResponse.ok) {
    const detail = await claimResponse.json().catch(() => ({}));
    console.error(
      "Foundry invite claim failed",
      detail?.code || claimResponse.status,
      detail?.message || "unknown",
    );
    return json(
      { error: "Invitation could not be claimed" },
      claimResponse.status === 404 ? 404 : 400,
    );
  }

  const result = await claimResponse.json();
  const row = Array.isArray(result) ? result[0] : result;

  if (!row?.enrolment_id || !row?.student_id || !row?.workspace_id) {
    console.error("Foundry invite claim returned an invalid enrolment result");
    return json({ error: "Invitation claim result was incomplete" }, 500);
  }

  return json(
    {
      ok: true,
      enrolmentId: row.enrolment_id,
      studentId: row.student_id,
      stage: "enrolled",
    },
    200,
  );
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...cors,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}
