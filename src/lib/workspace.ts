import { redirect } from "next/navigation";
import { requireOrbitAccess } from "@/lib/access";
import type { Workspace } from "@/lib/types";

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
