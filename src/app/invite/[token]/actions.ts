"use server";

import { redirect } from "next/navigation";
import { getOrbitAccess, orbitHomePath } from "@/lib/access";
import { isOrbitInvitationToken } from "@/lib/auth-return-path";
import { createClient } from "@/lib/supabase/server";

function invitePath(token: string) {
  return `/invite/${token}`;
}

function inviteMessagePath(token: string, type: "error" | "notice", message: string) {
  return `${invitePath(token)}?${type}=${encodeURIComponent(message)}`;
}

function safeInvitationError(message: string | undefined) {
  const normalized = message?.toLowerCase() ?? "";

  if (normalized.includes("email address that received")) {
    return "Sign in with the email address that received this invitation.";
  }
  if (normalized.includes("verified email")) {
    return "Verify your email before accepting this invitation.";
  }
  if (normalized.includes("non-founder orbit account")) {
    return "This Orbit account already operates a workspace. Use the invited non-founder account instead.";
  }
  if (normalized.includes("expired")) {
    return "This invitation has expired. Ask the organisation to send a new one.";
  }
  return "This invitation is no longer available. Ask the organisation to send a new one.";
}

export async function acceptOrbitInvitation(formData: FormData) {
  const token = String(formData.get("token") ?? "").trim();
  if (!isOrbitInvitationToken(token)) redirect("/login");

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect(`/login?next=${encodeURIComponent(invitePath(token))}`);
  }

  const { error } = await supabase.rpc("accept_orbit_invitation", {
    invitation_token: token,
  });

  if (error) {
    redirect(inviteMessagePath(token, "error", safeInvitationError(error.message)));
  }

  const context = await getOrbitAccess();
  if (!context) {
    redirect(
      inviteMessagePath(
        token,
        "notice",
        "Invitation accepted. Sign in again to open your authorised workspace.",
      ),
    );
  }

  redirect(orbitHomePath(context.access));
}
