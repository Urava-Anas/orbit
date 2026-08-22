import { redirect } from "next/navigation";
import { requireOrbitAccess } from "@/lib/access";
import type { Workspace } from "@/lib/types";

export type FounderWorkspaceOption = Workspace & {
  role: "owner" | "admin";
};

export async function requireWorkspace() {
  const context = await requireOrbitAccess();
  const { access } = context;

  if (access.accountRole === "student") {
    redirect("/learn");
  }

  if (
    access.accountRole !== "founder" ||
    !access.workspace ||
    !access.membershipRole
  ) {
    redirect("/access-pending");
  }

  return {
    supabase: context.supabase,
    user: context.user,
    role: access.membershipRole,
    workspace: access.workspace as Workspace,
  };
}

export async function listFounderWorkspaces(): Promise<FounderWorkspaceOption[]> {
  const context = await requireOrbitAccess();
  const { access, supabase, user } = context;

  if (access.accountRole !== "founder") return [];

  const { data: memberships, error: membershipError } = await supabase
    .from("workspace_members")
    .select("workspace_id, role, created_at")
    .eq("user_id", user.id)
    .in("role", ["owner", "admin"])
    .order("created_at", { ascending: true });

  if (membershipError) {
    throw new Error(`Workspace list failed: ${membershipError.message}`);
  }

  const membershipRows = memberships ?? [];
  const workspaceIds = membershipRows.map((membership) => membership.workspace_id);
  if (!workspaceIds.length) return [];

  const { data: workspaces, error: workspaceError } = await supabase
    .from("workspaces")
    .select("id, name, slug")
    .in("id", workspaceIds);

  if (workspaceError) {
    throw new Error(`Workspace details failed: ${workspaceError.message}`);
  }

  const workspaceById = new Map(
    (workspaces ?? []).map((workspace) => [workspace.id, workspace as Workspace]),
  );

  return membershipRows.flatMap((membership) => {
    const workspace = workspaceById.get(membership.workspace_id);
    if (!workspace || !["owner", "admin"].includes(membership.role)) return [];

    return [
      {
        ...workspace,
        role: membership.role as "owner" | "admin",
      },
    ];
  });
}
