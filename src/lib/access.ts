import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Workspace } from "@/lib/types";

export const ORBIT_ACTIVE_WORKSPACE_COOKIE = "orbit_active_workspace";

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

type FounderMembershipRow = {
  workspace_id: string;
  role: "owner" | "admin";
  workspaces:
    | { id: string; name: string; slug: string }
    | Array<{ id: string; name: string; slug: string }>
    | null;
};

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

function normalizeWorkspace(
  value: FounderMembershipRow["workspaces"],
): Workspace | null {
  const workspace = Array.isArray(value) ? value[0] : value;
  if (!workspace?.id || !workspace.name || !workspace.slug) return null;
  return workspace;
}

async function applySelectedFounderWorkspace(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  row: OrbitAccessRow,
): Promise<OrbitAccessRow> {
  if (row.account_role !== "founder") return row;

  const cookieStore = await cookies();
  const selectedWorkspaceId = cookieStore.get(ORBIT_ACTIVE_WORKSPACE_COOKIE)?.value;
  if (!selectedWorkspaceId || selectedWorkspaceId === row.workspace_id) return row;

  const { data, error } = await supabase
    .from("workspace_members")
    .select("workspace_id, role, workspaces(id, name, slug)")
    .eq("user_id", userId)
    .eq("workspace_id", selectedWorkspaceId)
    .in("role", ["owner", "admin"])
    .maybeSingle();

  if (error || !data) return row;

  const membership = data as unknown as FounderMembershipRow;
  const workspace = normalizeWorkspace(membership.workspaces);
  if (!workspace) return row;

  return {
    account_role: "founder",
    membership_role: membership.role,
    workspace_id: workspace.id,
    workspace_name: workspace.name,
    workspace_slug: workspace.slug,
    student_id: row.workspace_id === workspace.id ? row.student_id : null,
    foundry_id: row.workspace_id === workspace.id ? row.foundry_id : null,
  };
}

export function orbitHomePath(access: OrbitAccess) {
  if (access.accountRole === "founder") return "/dashboard";
  if (access.accountRole === "student") return "/portal";
  return "/access-pending";
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

  const claimedRow = normalizeAccessRow(data);
  if (!claimedRow) {
    throw new Error("Orbit access resolution returned an invalid result.");
  }

  const row = await applySelectedFounderWorkspace(supabase, user.id, claimedRow);
  const workspace =
    row.workspace_id && row.workspace_name && row.workspace_slug
      ? {
          id: row.workspace_id,
          name: row.workspace_name,
          slug: row.workspace_slug,
        }
      : null;

  return {
    supabase,
    user,
    access: {
      accountRole: row.account_role,
      membershipRole: row.membership_role,
      workspace,
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
    redirect("/dashboard");
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
