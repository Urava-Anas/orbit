"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ORBIT_ACTIVE_WORKSPACE_COOKIE } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function selectOrganisation(formData: FormData) {
  const workspaceId = String(formData.get("workspaceId") ?? "").trim();
  if (!uuidPattern.test(workspaceId)) {
    redirect("/organisations/select?error=invalid-workspace");
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) redirect("/login");

  const { data, error } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .in("role", ["owner", "admin"])
    .maybeSingle();

  if (error || !data) {
    redirect("/organisations/select?error=not-authorised");
  }

  const cookieStore = await cookies();
  cookieStore.set(ORBIT_ACTIVE_WORKSPACE_COOKIE, workspaceId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  redirect("/dashboard");
}
