import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Workspace } from "@/lib/types";

export async function requireWorkspace() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/login");
  }

  const { data: membership, error: membershipError } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  if (membershipError || !membership) {
    redirect("/login?error=Workspace%20setup%20failed");
  }

  const { data: workspace, error: workspaceError } = await supabase
    .from("workspaces")
    .select("id, name, slug")
    .eq("id", membership.workspace_id)
    .single();

  if (workspaceError || !workspace) {
    redirect("/login?error=Workspace%20not%20found");
  }

  return {
    supabase,
    user,
    role: membership.role as "owner" | "admin" | "member",
    workspace: workspace as Workspace,
  };
}

