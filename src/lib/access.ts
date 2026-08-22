import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Workspace } from "@/lib/types";
import { getWorkspaceProfile } from "@/lib/workspace-profile";

export const ACTIVE_WORKSPACE_COOKIE = "orbit-active-workspace";

export type OrbitAccountRole = "founder" | "student" | "pending";
export type OrbitMembershipRole = "owner" | "admin" | "member" | null;

export type OrbitAccess = {
  accountRole: OrbitAccountRole;
  membershipRole: OrbitMembershipRole;
  workspace: Workspace | null;
  studentId: string | null;
  foundryId: string | null;
};

type OrbitAccessRow = {
  account_role: OrbitAccountRole;
  membership_role: OrbitMembershipRole;
  workspace_id: string | null;
  workspace_name: string | null;
  workspace_slug: string | null;
  student_id: string | null;
  foundry_id: string | null;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeAccessRow(value: unknown): OrbitAccessRow | null {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object") return null;

  const candidate = row as Partial<OrbitAccessRow>;
  if (
    !candidate.account_role ||
    !["founder", "student", "pending"].includes(candidate.account_role)
  ) {
    return null;
  }

  return {
    account_role: candidate.account_role,
    membership_role:
      candidate.membership_role &&
      ["owner", "admin", "member"].includes(candidate.membership_role)
        ? candidate.membership_role
        : null,
    workspace_id: candidate.workspace_id ?? null,
    workspace_name: candidate.workspace_name ?? null,
    workspace_slug: candidate.workspace_slug ?? null,
    student_id: candidate.student_id ?? null,
    foundry_id: candidate.foundry_id ?? null,
  };
}

export function orbitHomePath(access: OrbitAccess) {
  if (access.accountRole === "founder") {
    if (
      access.workspace &&
      getWorkspaceProfile(access.workspace).experience === "apex"
    ) {
      return "/dashboard";
    }
    return "/dashboard/foundry";
  }
  if (access.accountRole === "student") return "/learn";
  return "/access-pending";
}

async function resolveSelectedFounderWorkspace(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  fallbackWorkspace: Workspace | null,
  fallbackRole: OrbitMembershipRole,
) {
  const cookieStore = await cookies();
  const selectedWorkspaceId = cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value;

  if (
    !selectedWorkspaceId ||
    !UUID_PATTERN.test(selectedWorkspaceId) ||
    selectedWorkspaceId === fallbackWorkspace?.id
  ) {
    return { workspace: fallbackWorkspace, role: fallbackRole };
  }

  const { data: membership, error: membershipError } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("workspace_id", selectedWorkspaceId)
    .eq("user_id", userId)
    .in("role", ["owner", "admin"])
    .maybeSingle();

  if (membershipError || !membership) {
    return { workspace: fallbackWorkspace, role: fallbackRole };
  }

  const { data: selectedWorkspace, error: workspaceError } = await supabase
    .from("workspaces")
    .select("id, name, slug")
    .eq("id", selectedWorkspaceId)
    .maybeSingle();

  if (workspaceError || !selectedWorkspace) {
    return { workspace: fallbackWorkspace, role: fallbackRole };
  }

  return {
    workspace: selectedWorkspace as Workspace,
    role: membership.role as OrbitMembershipRole,
  };
}

export const getOrbitAccess = cache(async function getOrbitAccess() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) return null;

  const { data, error } = await supabase.rpc("claim_orbit_access");
  if (error) {
    throw new Error(`Orbit access resolution failed: ${error.message}`);
  }

  const row = normalizeAccessRow(data);
  if (!row) {
    throw new Error("Orbit access resolution returned an invalid result.");
  }

  const fallbackWorkspace =
    row.workspace_id && row.workspace_name && row.workspace_slug
      ? {
          id: row.workspace_id,
          name: row.workspace_name,
          slug: row.workspace_slug,
        }
      : null;

  const selected =
    row.account_role === "founder"
      ? await resolveSelectedFounderWorkspace(
          supabase,
          user.id,
          fallbackWorkspace,
          row.membership_role,
        )
      : { workspace: fallbackWorkspace, role: row.membership_role };

  return {
    supabase,
    user,
    access: {
      accountRole: row.account_role,
      membershipRole: selected.role,
      workspace: selected.workspace,
      studentId: row.student_id,
      foundryId: row.foundry_id,
    } satisfies OrbitAccess,
  };
});

export async function requireOrbitAccess() {
  const context = await getOrbitAccess();
  if (!context) redirect("/login");
  return context;
}

export async function requireStudentAccess() {
  const context = await requireOrbitAccess();
  const { access } = context;

  if (access.accountRole === "founder") {
    redirect(orbitHomePath(access));
  }

  if (
    access.accountRole !== "student" ||
    !access.workspace ||
    !access.studentId
  ) {
    redirect("/access-pending");
  }

  return {
    supabase: context.supabase,
    user: context.user,
    role: "student" as const,
    workspace: access.workspace,
    studentId: access.studentId,
    foundryId: access.foundryId,
  };
}
