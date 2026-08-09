"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireFounderFoundry } from "@/lib/foundry";

const departments = [
  "unassigned",
  "creative_ui",
  "web_app",
  "ai_automation",
  "sales_calling",
  "operations",
  "content_media",
] as const;
const difficulties = ["starter", "standard", "stretch", "recovery"] as const;
const skillDimensions = [
  "quality",
  "deadline",
  "communication",
  "revision",
  "teamwork",
  "reliability",
  "client_readiness",
] as const;

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function pakistanDateTime(input: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input)) return null;
  const parsed = new Date(`${input}:00+05:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function pathFor(studentId?: string) {
  return `/dashboard/foundry/tasks${studentId ? `?studentId=${studentId}` : ""}`;
}

function fail(studentId: string | undefined, message: string): never {
  const path = pathFor(studentId);
  redirect(`${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(message)}`);
}

export async function createJourneyTask(formData: FormData) {
  const rawStudentId = value(formData, "studentId");
  const parsed = z
    .object({
      requestId: z.string().uuid(),
      studentId: z.string().uuid(),
      title: z.string().min(2).max(180),
      instructions: z.string().min(10).max(8000),
      department: z.enum(departments),
      difficulty: z.enum(difficulties),
      skillDimension: z.enum(skillDimensions).or(z.literal("")),
      points: z.coerce.number().int().min(0).max(100),
      levelNumber: z.coerce.number().int().min(1).max(100),
      startsAt: z.string(),
      dueAt: z.string(),
    })
    .safeParse({
      requestId: value(formData, "requestId"),
      studentId: rawStudentId,
      title: value(formData, "title"),
      instructions: value(formData, "instructions"),
      department: value(formData, "department"),
      difficulty: value(formData, "difficulty"),
      skillDimension: value(formData, "skillDimension"),
      points: value(formData, "points") || "10",
      levelNumber: value(formData, "levelNumber") || "1",
      startsAt: value(formData, "startsAt"),
      dueAt: value(formData, "dueAt"),
    });

  if (!parsed.success) fail(rawStudentId || undefined, "Task, level aur timing dobara check karein.");

  const startsAt = pakistanDateTime(parsed.data.startsAt);
  const dueAt = pakistanDateTime(parsed.data.dueAt);
  if (!startsAt || !dueAt || dueAt <= startsAt) {
    fail(parsed.data.studentId, "Task ka due time start time ke baad hona chahiye.");
  }
  if (dueAt.getTime() <= Date.now() - 5 * 60 * 1000) {
    fail(parsed.data.studentId, "Task deadline future mein honi chahiye.");
  }

  const { supabase, workspace } = await requireFounderFoundry();
  const { error } = await supabase.rpc(
    "create_foundry_task_assignment_journey_command",
    {
      target_workspace_id: workspace.id,
      target_student_id: parsed.data.studentId,
      command_request_id: parsed.data.requestId,
      task_title: parsed.data.title,
      task_instructions_roman_urdu: parsed.data.instructions,
      task_department: parsed.data.department,
      task_difficulty: parsed.data.difficulty,
      task_skill_dimension: parsed.data.skillDimension,
      task_points: parsed.data.points,
      assignment_starts_at: startsAt.toISOString(),
      assignment_due_at: dueAt.toISOString(),
      task_level_number: parsed.data.levelNumber,
    },
  );

  if (error) fail(parsed.data.studentId, "Task assign nahi ho saka.");

  revalidatePath("/dashboard/foundry/tasks");
  revalidatePath("/dashboard/foundry/map");
  revalidatePath("/learn", "layout");
  revalidatePath("/learn/progress");
  redirect(
    `/dashboard/foundry/tasks?studentId=${parsed.data.studentId}&notice=${encodeURIComponent(
      `Level ${parsed.data.levelNumber} task assign ho gaya.`,
    )}`,
  );
}
