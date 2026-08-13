import "server-only";

import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export const ORBIT_ACTION_SCOPES = [
  "foundry.read",
  "students.read",
  "students.write",
  "tasks.write",
  "submissions.write",
  "integrations.write",
  "audit.read",
  "plugins.read",
  "plugins.invoke",
] as const;

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
  is_active: boolean;
};

export class OrbitActionError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "OrbitActionError";
  }
}

function hashToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function withActivity(
  key: Omit<OrbitActionKeyRecord, "is_active">,
  now: number,
): OrbitActionKeyRecord {
  return {
    ...key,
    is_active:
      !key.revoked_at &&
      (!key.expires_at || new Date(key.expires_at).getTime() > now),
  };
}

export async function createOrbitActionKey(input: {
  supabase: SupabaseClient;
  workspaceId: string;
  name: string;
  expiresAt: string;
}) {
  const token = `orb_live_${randomBytes(32).toString("base64url")}`;
  const tokenHash = hashToken(token);
  const tokenPrefix = token.slice(0, 17);

  const { data, error } = await input.supabase.rpc("create_orbit_action_key", {
    target_workspace_id: input.workspaceId,
    target_name: input.name,
    target_token_prefix: tokenPrefix,
    target_token_hash: tokenHash,
    target_scopes: [...ORBIT_ACTION_SCOPES],
    target_expires_at: input.expiresAt,
  });

  const key = Array.isArray(data) ? data[0] : data;
  if (error || !key) {
    throw new OrbitActionError(
      "Orbit action key could not be created.",
      "key_creation_failed",
    );
  }

  return {
    token,
    key: withActivity(
      key as Omit<OrbitActionKeyRecord, "is_active">,
      Date.now(),
    ),
  };
}

export async function listOrbitActionKeys(
  supabase: SupabaseClient,
  workspaceId: string,
) {
  const { data, error } = await supabase.rpc("list_orbit_action_keys", {
    target_workspace_id: workspaceId,
  });

  if (error) {
    throw new OrbitActionError(
      "Orbit action keys could not be loaded.",
      "key_list_failed",
    );
  }

  const now = Date.now();
  return ((data ?? []) as Array<Omit<OrbitActionKeyRecord, "is_active">>).map(
    (key) => withActivity(key, now),
  );
}

export async function revokeOrbitActionKey(input: {
  supabase: SupabaseClient;
  workspaceId: string;
  keyId: string;
}) {
  const { data, error } = await input.supabase.rpc("revoke_orbit_action_key", {
    target_workspace_id: input.workspaceId,
    target_key_id: input.keyId,
  });

  if (error || data !== true) {
    throw new OrbitActionError(
      "Orbit action key could not be revoked.",
      "key_not_found",
    );
  }
}
