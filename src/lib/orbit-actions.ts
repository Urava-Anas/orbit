import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

export const ORBIT_ACTION_SCOPES = [
  "foundry.read",
  "students.read",
  "students.write",
  "tasks.write",
  "submissions.write",
  "integrations.write",
  "audit.read",
] as const;

export type OrbitActionScope = (typeof ORBIT_ACTION_SCOPES)[number];

export type OrbitActionKeyRecord = {
  id: string;
  workspace_id: string;
  actor_id: string;
  name: string;
  token_prefix: string;
  scopes: string[];
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

export class OrbitActionError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = "OrbitActionError";
  }
}

function hashToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export async function createOrbitActionKey(input: {
  workspaceId: string;
  actorId: string;
  name: string;
  expiresAt?: string | null;
}) {
  const admin = createAdminClient();
  if (!admin) {
    throw new OrbitActionError(
      "Orbit server key is not configured.",
      503,
      "server_not_configured",
    );
  }

  const token = `orb_live_${randomBytes(32).toString("base64url")}`;
  const tokenHash = hashToken(token);
  const tokenPrefix = token.slice(0, 17);

  const { data, error } = await admin
    .from("orbit_action_keys")
    .insert({
      workspace_id: input.workspaceId,
      actor_id: input.actorId,
      name: input.name,
      token_prefix: tokenPrefix,
      token_hash: tokenHash,
      scopes: [...ORBIT_ACTION_SCOPES],
      expires_at: input.expiresAt ?? null,
      created_by: input.actorId,
    })
    .select(
      "id, workspace_id, actor_id, name, token_prefix, scopes, last_used_at, expires_at, revoked_at, created_at",
    )
    .single();

  if (error || !data) {
    throw new OrbitActionError(
      "Orbit action key could not be created.",
      500,
      "key_creation_failed",
    );
  }

  return {
    token,
    key: data as OrbitActionKeyRecord,
  };
}

export async function listOrbitActionKeys(workspaceId: string) {
  const admin = createAdminClient();
  if (!admin) return [] as OrbitActionKeyRecord[];

  const { data, error } = await admin
    .from("orbit_action_keys")
    .select(
      "id, workspace_id, actor_id, name, token_prefix, scopes, last_used_at, expires_at, revoked_at, created_at",
    )
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new OrbitActionError(
      "Orbit action keys could not be loaded.",
      500,
      "key_list_failed",
    );
  }

  return (data ?? []) as OrbitActionKeyRecord[];
}

export async function revokeOrbitActionKey(input: {
  workspaceId: string;
  keyId: string;
}) {
  const admin = createAdminClient();
  if (!admin) {
    throw new OrbitActionError(
      "Orbit server key is not configured.",
      503,
      "server_not_configured",
    );
  }

  const { data, error } = await admin
    .from("orbit_action_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("workspace_id", input.workspaceId)
    .eq("id", input.keyId)
    .is("revoked_at", null)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    throw new OrbitActionError(
      "Orbit action key could not be revoked.",
      404,
      "key_not_found",
    );
  }
}

export async function authenticateOrbitAction(
  request: Request,
  requiredScope: OrbitActionScope,
) {
  const admin = createAdminClient();
  if (!admin) {
    throw new OrbitActionError(
      "Orbit action service is not configured.",
      503,
      "server_not_configured",
    );
  }

  const authorization = request.headers.get("authorization") ?? "";
  const [scheme, token] = authorization.split(/\s+/, 2);
  if (scheme?.toLowerCase() !== "bearer" || !token?.startsWith("orb_live_")) {
    throw new OrbitActionError(
      "A valid Orbit bearer key is required.",
      401,
      "invalid_authorization",
    );
  }

  const { data, error } = await admin
    .from("orbit_action_keys")
    .select(
      "id, workspace_id, actor_id, name, token_prefix, scopes, last_used_at, expires_at, revoked_at, created_at",
    )
    .eq("token_hash", hashToken(token))
    .is("revoked_at", null)
    .maybeSingle();

  const key = data as OrbitActionKeyRecord | null;
  if (error || !key) {
    throw new OrbitActionError(
      "Orbit bearer key is invalid or revoked.",
      401,
      "invalid_key",
    );
  }

  if (key.expires_at && new Date(key.expires_at).getTime() <= Date.now()) {
    throw new OrbitActionError(
      "Orbit bearer key has expired.",
      401,
      "expired_key",
    );
  }

  if (!key.scopes.includes(requiredScope)) {
    throw new OrbitActionError(
      `Orbit key does not include ${requiredScope}.`,
      403,
      "scope_denied",
    );
  }

  await admin
    .from("orbit_action_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", key.id);

  return { admin, key };
}

export async function beginOrbitActionCall(input: {
  admin: ReturnType<typeof createAdminClient>;
  key: OrbitActionKeyRecord;
  operation: string;
  requestId: string;
  requestSummary?: Record<string, unknown>;
}) {
  if (!input.admin) {
    throw new OrbitActionError(
      "Orbit action service is not configured.",
      503,
      "server_not_configured",
    );
  }

  const { data, error } = await input.admin
    .from("orbit_action_calls")
    .insert({
      workspace_id: input.key.workspace_id,
      actor_id: input.key.actor_id,
      action_key_id: input.key.id,
      operation: input.operation,
      request_id: input.requestId,
      request_summary: input.requestSummary ?? {},
      status: "started",
    })
    .select("id")
    .single();

  if (error || !data) {
    if (error?.code === "23505") {
      throw new OrbitActionError(
        "This request ID has already been used.",
        409,
        "duplicate_request",
      );
    }
    throw new OrbitActionError(
      "Orbit could not begin the audited action.",
      500,
      "audit_start_failed",
    );
  }

  return data.id as string;
}

export async function completeOrbitActionCall(input: {
  admin: ReturnType<typeof createAdminClient>;
  callId: string;
  status: "succeeded" | "failed" | "denied";
  responseSummary?: Record<string, unknown>;
  errorCode?: string | null;
}) {
  if (!input.admin) return;

  await input.admin
    .from("orbit_action_calls")
    .update({
      status: input.status,
      response_summary: input.responseSummary ?? {},
      error_code: input.errorCode ?? null,
      completed_at: new Date().toISOString(),
    })
    .eq("id", input.callId);
}
