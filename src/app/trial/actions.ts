"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ACTIVE_WORKSPACE_COOKIE } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";

const workspaceNameSchema = z.string().trim().min(2).max(80);

export async function startOrbitTrial(formData: FormData) {
  const parsed = workspaceNameSchema.safeParse(
    String(formData.get("workspace_name") ?? ""),
  );

  if (!parsed.success) {
    redirect("/trial?error=Use%20a%20workspace%20name%20between%202%20and%2080%20characters.");
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/login?next=/trial");
  }

  const { data, error } = await supabase.rpc("start_orbit_trial", {
    workspace_name: parsed.data,
  });

  const row = Array.isArray(data) ? data[0] : data;
  const workspaceId =
    row && typeof row === "object" && "workspace_id" in row
      ? String(row.workspace_id)
      : null;

  if (error || !workspaceId) {
    console.error("Orbit trial creation failed", {
      userId: user.id,
      code: error?.code,
      message: error?.message,
    });

    const message =
      error?.code === "23505"
        ? "This account already has a founder workspace."
        : error?.code === "42501"
          ? "This account cannot create a founder trial workspace."
          : "Orbit could not create the trial workspace. Try again.";

    redirect(`/trial?error=${encodeURIComponent(message)}`);
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_WORKSPACE_COOKIE, workspaceId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });

  redirect("/dashboard/billing?notice=Your%2015-day%20Business%20trial%20is%20active.");
}
