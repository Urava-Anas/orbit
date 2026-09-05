"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ACTIVE_WORKSPACE_COOKIE, getOrbitAccess, orbitHomePath } from "@/lib/access";

const workspaceNameSchema = z.string().trim().min(2).max(80);
const prioritySchema = z.enum([
  "growth",
  "delivery",
  "cash",
  "people",
  "approvals",
  "overview",
]);
const operatingModeSchema = z.enum(["recommend", "prepare", "governed"]);

export async function completeFounderOnboarding(formData: FormData) {
  const context = await getOrbitAccess();
  if (!context) redirect("/signup?notice=Create%20your%20Orbit%20account%20first.");

  if (context.access.accountRole === "student") {
    redirect(orbitHomePath(context.access));
  }

  if (context.access.accountRole === "founder" && context.access.workspace) {
    redirect("/dashboard");
  }

  const workspaceName = workspaceNameSchema.safeParse(
    String(formData.get("workspace_name") ?? ""),
  );
  const operatingMode = operatingModeSchema.safeParse(
    String(formData.get("operating_mode") ?? ""),
  );
  const priorities = formData
    .getAll("priorities")
    .map(String)
    .filter((item): item is z.infer<typeof prioritySchema> => prioritySchema.safeParse(item).success);

  const uniquePriorities = [...new Set(priorities)];

  if (!workspaceName.success) {
    redirect("/onboarding?error=Use%20an%20organisation%20name%20between%202%20and%2080%20characters.");
  }
  if (!operatingMode.success) {
    redirect("/onboarding?error=Choose%20how%20Orbit%20should%20work%20with%20you.");
  }
  if (uniquePriorities.length < 1 || uniquePriorities.length > 4) {
    redirect("/onboarding?error=Choose%20between%201%20and%204%20starting%20priorities.");
  }

  const { data, error } = await context.supabase.rpc("start_orbit_trial", {
    workspace_name: workspaceName.data,
  });

  const row = Array.isArray(data) ? data[0] : data;
  const workspaceId =
    row && typeof row === "object" && "workspace_id" in row
      ? String(row.workspace_id)
      : null;

  if (error || !workspaceId) {
    console.error("Orbit onboarding activation failed", {
      userId: context.user.id,
      code: error?.code,
      message: error?.message,
    });

    const message =
      error?.code === "23505"
        ? "This account already has a founder workspace. Sign in and continue there."
        : error?.code === "42501"
          ? "This account is not eligible to create a founder trial workspace."
          : "Orbit could not activate the workspace. Your account is safe; try again.";

    redirect(`/onboarding?error=${encodeURIComponent(message)}`);
  }

  const { error: metadataError } = await context.supabase.auth.updateUser({
    data: {
      ...context.user.user_metadata,
      orbit_signup_intent: "founder_trial",
      orbit_onboarding_version: "v1",
      orbit_onboarding_completed_at: new Date().toISOString(),
      orbit_starting_priorities: uniquePriorities,
      orbit_operating_mode: operatingMode.data,
      orbit_workspace_name: workspaceName.data,
    },
  });

  if (metadataError) {
    console.error("Orbit onboarding metadata save failed", {
      userId: context.user.id,
      code: metadataError.code,
      message: metadataError.message,
    });
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_WORKSPACE_COOKIE, workspaceId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });

  redirect("/dashboard?notice=Your%2015-day%20Business%20trial%20is%20active.");
}
