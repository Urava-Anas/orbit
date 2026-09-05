import "server-only";

import { isOrbitInvitationToken } from "@/lib/auth-return-path";
import { createClient } from "@/lib/supabase/server";

export type OrbitInvitationStatus =
  | "valid"
  | "accepted"
  | "expired"
  | "revoked"
  | "invalid";

export type OrbitInvitationSnapshot = {
  status: OrbitInvitationStatus;
  kind: "foundry_student" | null;
  workspaceName: string | null;
  emailHint: string | null;
  expiresAt: string | null;
};

const INVALID_INVITATION: OrbitInvitationSnapshot = {
  status: "invalid",
  kind: null,
  workspaceName: null,
  emailHint: null,
  expiresAt: null,
};

function normalizeInvitationRow(value: unknown): OrbitInvitationSnapshot {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || typeof raw !== "object") return INVALID_INVITATION;

  const row = raw as Record<string, unknown>;
  const status = row.invitation_status;
  if (
    status !== "valid" &&
    status !== "accepted" &&
    status !== "expired" &&
    status !== "revoked" &&
    status !== "invalid"
  ) {
    return INVALID_INVITATION;
  }

  return {
    status,
    kind: row.invitation_kind === "foundry_student" ? "foundry_student" : null,
    workspaceName:
      typeof row.workspace_name === "string" ? row.workspace_name : null,
    emailHint:
      typeof row.invited_email_hint === "string"
        ? row.invited_email_hint
        : null,
    expiresAt:
      typeof row.invitation_expires_at === "string"
        ? row.invitation_expires_at
        : null,
  };
}

export async function inspectOrbitInvitation(token: string) {
  if (!isOrbitInvitationToken(token)) return INVALID_INVITATION;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("inspect_orbit_invitation", {
    invitation_token: token,
  });

  if (error) {
    console.error("Orbit invitation inspection failed", {
      code: error.code,
    });
    return INVALID_INVITATION;
  }

  return normalizeInvitationRow(data);
}
