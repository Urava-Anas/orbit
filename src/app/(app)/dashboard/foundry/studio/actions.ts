"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireFounderFoundry } from "@/lib/foundry";

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function pakistanDateTime(input: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input)) return null;
  const parsed = new Date(`${input}:00+05:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function pathFor(studentId?: string) {
  return `/dashboard/foundry/studio${studentId ? `?studentId=${studentId}` : ""}`;
}

function fail(studentId: string | undefined, message: string): never {
  const path = pathFor(studentId);
  redirect(`${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(message)}`);
}

function refresh() {
  revalidatePath("/dashboard/foundry/studio");
  revalidatePath("/dashboard/foundry/map");
  revalidatePath("/learn");
  revalidatePath("/learn/studio");
  revalidatePath("/learn/progress");
  revalidatePath("/learn/profile");
}

export async function assignStudioWork(formData: FormData) {
  const rawStudentId = value(formData, "studentId");
  const parsed = z
    .object({
      requestId: z.string().uuid(),
      studentId: z.string().uuid(),
      projectId: z.string().uuid(),
      levelNumber: z.coerce.number().int().min(1).max(100),
      roleTitle: z.string().min(2).max(120),
      deliverable: z.string().min(2).max(2000),
      startsAt: z.string(),
      dueAt: z.string(),
    })
    .safeParse({
      requestId: value(formData, "requestId"),
      studentId: rawStudentId,
      projectId: value(formData, "projectId"),
      levelNumber: value(formData, "levelNumber") || "1",
      roleTitle: value(formData, "roleTitle"),
      deliverable: value(formData, "deliverable"),
      startsAt: value(formData, "startsAt"),
      dueAt: value(formData, "dueAt"),
    });

  if (!parsed.success) fail(rawStudentId || undefined, "Project, role, level aur timing dobara check karein.");

  const startsAt = pakistanDateTime(parsed.data.startsAt);
  const dueAt = pakistanDateTime(parsed.data.dueAt);
  if (!startsAt || !dueAt || dueAt <= startsAt) {
    fail(parsed.data.studentId, "Studio due time start time ke baad hona chahiye.");
  }

  const { supabase, user, workspace } = await requireFounderFoundry();
  const [studentResult, projectResult] = await Promise.all([
    supabase
      .from("foundry_students")
      .select("id")
      .eq("workspace_id", workspace.id)
      .eq("id", parsed.data.studentId)
      .maybeSingle(),
    supabase
      .from("projects")
      .select("id, name")
      .eq("workspace_id", workspace.id)
      .eq("id", parsed.data.projectId)
      .maybeSingle(),
  ]);

  if (studentResult.error || !studentResult.data) fail(parsed.data.studentId, "Selected member nahi mila.");
  if (projectResult.error || !projectResult.data) fail(parsed.data.studentId, "Selected Orbit project nahi mila.");

  const status = startsAt.getTime() > Date.now() ? "planned" : "active";
  const { error } = await supabase.from("foundry_studio_assignments").insert({
    workspace_id: workspace.id,
    request_id: parsed.data.requestId,
    student_id: parsed.data.studentId,
    project_id: parsed.data.projectId,
    project_name_snapshot: projectResult.data.name,
    level_number: parsed.data.levelNumber,
    role_title: parsed.data.roleTitle,
    deliverable: parsed.data.deliverable,
    starts_at: startsAt.toISOString(),
    due_at: dueAt.toISOString(),
    status,
    created_by: user.id,
  });

  if (error) fail(parsed.data.studentId, "Studio work assign nahi hua.");

  refresh();
  redirect(
    `/dashboard/foundry/studio?studentId=${parsed.data.studentId}&notice=${encodeURIComponent(
      `Level ${parsed.data.levelNumber} Studio work assigned.`,
    )}`,
  );
}

export async function updateStudioWorkStatus(formData: FormData) {
  const parsed = z
    .object({
      assignmentId: z.string().uuid(),
      studentId: z.string().uuid(),
      status: z.enum(["planned", "active", "completed", "cancelled"]),
    })
    .safeParse({
      assignmentId: value(formData, "assignmentId"),
      studentId: value(formData, "studentId"),
      status: value(formData, "status"),
    });

  if (!parsed.success) fail(undefined, "Studio assignment dobara select karein.");

  const { supabase, workspace } = await requireFounderFoundry();
  const { data, error } = await supabase
    .from("foundry_studio_assignments")
    .update({ status: parsed.data.status })
    .eq("workspace_id", workspace.id)
    .eq("student_id", parsed.data.studentId)
    .eq("id", parsed.data.assignmentId)
    .select("id")
    .maybeSingle();

  if (error || !data) fail(parsed.data.studentId, "Studio status update nahi hua.");
  refresh();
  redirect(
    `/dashboard/foundry/studio?studentId=${parsed.data.studentId}&notice=${encodeURIComponent(
      `Studio work marked ${parsed.data.status}.`,
    )}`,
  );
}
