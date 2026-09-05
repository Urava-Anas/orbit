"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { orbitBaseUrl } from "@/lib/integration-connections";
import { requireFounderFoundry } from "@/lib/foundry";

export type FoundryInvitationActionState = {
  status: "idle" | "success" | "error";
  message: string | null;
  invitationUrl: string | null;
  expiresAt: string | null;
};

const inputSchema = z.object({
  studentId: z.string().uuid(),
});

function safeInvitationFailure(message: string | undefined) {
  const normalized = message?.toLowerCase() ?? "";

  if (normalized.includes("accepted or enrolled")) {
    return "Accept or enrol this Foundry learner before creating Orbit access.";
  }
  if (normalized.includes("student email is required")) {
    return "Add the learner's email before creating an Orbit invitation.";
  }
  if (normalized.includes("already has orbit access")) {
    return "This learner is already connected to an Orbit identity.";
  }
  if (normalized.includes("workspace admin")) {
    return "Only a Foundry workspace owner or admin can create invitations.";
  }
  if (normalized.includes("not found")) {
    return "This learner is no longer available in the active Foundry workspace.";
  }
  return "Orbit could not create the invitation. Refresh the learner record and try again.";
}

export async function createFoundryOrbitInvitation(
  _previousState: FoundryInvitationActionState,
  formData: FormData,
): Promise<FoundryInvitationActionState> {
  const parsed = inputSchema.safeParse({
    studentId: String(formData.get("studentId") ?? "").trim(),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "The invitation request is invalid.",
      invitationUrl: null,
      expiresAt: null,
    };
  }

  const { supabase, workspace } = await requireFounderFoundry();
  const { data: student, error: studentError } = await supabase
    .from("foundry_students")
    .select("id, workspace_id, full_name, email, lifecycle_status, auth_user_id")
    .eq("id", parsed.data.studentId)
    .eq("workspace_id", workspace.id)
    .maybeSingle();

  if (studentError || !student) {
    return {
      status: "error",
      message: "This learner is no longer available in the active Foundry workspace.",
      invitationUrl: null,
      expiresAt: null,
    };
  }

  if (student.auth_user_id) {
    return {
      status: "error",
      message: `${student.full_name} is already connected to Orbit.`,
      invitationUrl: null,
      expiresAt: null,
    };
  }

  if (!student.email?.trim()) {
    return {
      status: "error",
      message: "Add the learner's email before creating an Orbit invitation.",
      invitationUrl: null,
      expiresAt: null,
    };
  }

  if (!["accepted", "enrolled"].includes(student.lifecycle_status)) {
    return {
      status: "error",
      message: "Accept or enrol this Foundry learner before creating Orbit access.",
      invitationUrl: null,
      expiresAt: null,
    };
  }

  const { data, error } = await supabase.rpc("create_foundry_invitation", {
    target_student_id: student.id,
    expires_in_hours: 168,
  });

  const row = Array.isArray(data) ? data[0] : data;
  const token = row?.invitation_token;
  const expiresAt = row?.invitation_expires_at;

  if (error || typeof token !== "string" || typeof expiresAt !== "string") {
    console.error("Orbit invitation issuance failed", {
      code: error?.code,
      studentId: student.id,
      workspaceId: workspace.id,
    });
    return {
      status: "error",
      message: safeInvitationFailure(error?.message),
      invitationUrl: null,
      expiresAt: null,
    };
  }

  revalidatePath(`/dashboard/foundry/students/${student.id}`);

  return {
    status: "success",
    message:
      "Invitation created. Copy it now—the bearer token is shown only in this browser state and is not stored in Orbit.",
    invitationUrl: `${orbitBaseUrl()}/invite/${token}`,
    expiresAt,
  };
}
