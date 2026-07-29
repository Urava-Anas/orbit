"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireStudentAccess } from "@/lib/access";
import { requireFounderFoundry } from "@/lib/foundry";

const idSchema = z.string().uuid();
const departments = [
  "unassigned",
  "creative_ui",
  "web_app",
  "ai_automation",
  "sales_calling",
  "operations",
  "content_media",
] as const;
const healthStates = ["green", "yellow", "red", "gold"] as const;
const attendanceStates = ["present", "late", "absent", "excused"] as const;
const difficultyStates = ["starter", "standard", "stretch", "recovery"] as const;
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

function optional(input: string) {
  return input || null;
}

function fail(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

function succeed(path: string, message: string): never {
  revalidatePath("/dashboard/foundry", "layout");
  revalidatePath(path);
  redirect(`${path}?notice=${encodeURIComponent(message)}`);
}

function pakistanDateTime(input: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input)) return null;
  const parsed = new Date(`${input}:00+05:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function createFoundryClass(formData: FormData) {
  const parsed = z
    .object({
      requestId: idSchema,
      title: z.string().min(2).max(180),
      instructorName: z.string().min(2).max(120),
      department: z.enum(departments).or(z.literal("")),
      startsAt: z.string(),
      endsAt: z.string(),
      mode: z.enum(["online", "onsite", "hybrid"]),
      joinUrl: z.string().url().max(500).or(z.literal("")),
      notes: z.string().max(2000),
    })
    .safeParse({
      requestId: value(formData, "requestId"),
      title: value(formData, "title"),
      instructorName: value(formData, "instructorName"),
      department: value(formData, "department"),
      startsAt: value(formData, "startsAt"),
      endsAt: value(formData, "endsAt"),
      mode: value(formData, "mode"),
      joinUrl: value(formData, "joinUrl"),
      notes: value(formData, "notes"),
    });

  if (!parsed.success) {
    fail("/dashboard/foundry/classes", "Class details dobara check karein.");
  }

  const startsAt = pakistanDateTime(parsed.data.startsAt);
  const endsAt = pakistanDateTime(parsed.data.endsAt);
  if (!startsAt || !endsAt || endsAt <= startsAt) {
    fail("/dashboard/foundry/classes", "Class ka start aur end time valid hona chahiye.");
  }

  const { supabase, workspace } = await requireFounderFoundry();
  const { error } = await supabase.rpc("create_foundry_class_command", {
    target_workspace_id: workspace.id,
    command_request_id: parsed.data.requestId,
    class_title: parsed.data.title,
    class_instructor_name: parsed.data.instructorName,
    class_department: parsed.data.department,
    class_starts_at: startsAt.toISOString(),
    class_ends_at: endsAt.toISOString(),
    class_mode: parsed.data.mode,
    class_join_url: parsed.data.joinUrl,
    class_notes: parsed.data.notes,
  });

  if (error) {
    fail("/dashboard/foundry/classes", "Class save nahi ho saki.");
  }

  succeed("/dashboard/foundry/classes", "Class schedule ho gayi.");
}

export async function markFoundryAttendance(formData: FormData) {
  const parsed = z
    .object({
      classId: idSchema,
      studentId: idSchema,
      status: z.enum(attendanceStates),
      note: z.string().max(500),
    })
    .safeParse({
      classId: value(formData, "classId"),
      studentId: value(formData, "studentId"),
      status: value(formData, "status"),
      note: value(formData, "note"),
    });

  if (!parsed.success) {
    fail("/dashboard/foundry/attendance", "Attendance update valid nahi hai.");
  }

  const { supabase, user, workspace } = await requireFounderFoundry();
  const { data, error } = await supabase
    .from("foundry_attendance")
    .upsert(
      {
        workspace_id: workspace.id,
        class_id: parsed.data.classId,
        student_id: parsed.data.studentId,
        status: parsed.data.status,
        note: optional(parsed.data.note),
        marked_by: user.id,
        marked_at: new Date().toISOString(),
      },
      { onConflict: "workspace_id,class_id,student_id" },
    )
    .select("id")
    .maybeSingle();

  if (error || !data) {
    fail("/dashboard/foundry/attendance", "Attendance save nahi ho saki.");
  }

  succeed("/dashboard/foundry/attendance", "Attendance update ho gayi.");
}

export async function createFoundryTask(formData: FormData) {
  const parsed = z
    .object({
      requestId: idSchema,
      title: z.string().min(2).max(180),
      instructions: z.string().min(10).max(8000),
      department: z.enum(departments),
      difficulty: z.enum(difficultyStates),
      skillDimension: z.enum(skillDimensions).or(z.literal("")),
      points: z.coerce.number().int().min(0).max(100),
      studentId: idSchema,
      dueAt: z.string(),
    })
    .safeParse({
      requestId: value(formData, "requestId"),
      title: value(formData, "title"),
      instructions: value(formData, "instructions"),
      department: value(formData, "department"),
      difficulty: value(formData, "difficulty"),
      skillDimension: value(formData, "skillDimension"),
      points: value(formData, "points") || "10",
      studentId: value(formData, "studentId"),
      dueAt: value(formData, "dueAt"),
    });

  if (!parsed.success) {
    fail("/dashboard/foundry/tasks", "Task details dobara check karein.");
  }

  const dueAt = pakistanDateTime(parsed.data.dueAt);
  if (!dueAt) {
    fail("/dashboard/foundry/tasks", "Task deadline valid nahi hai.");
  }

  const { supabase, workspace } = await requireFounderFoundry();
  const { error } = await supabase.rpc(
    "create_foundry_task_assignment_command",
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
      assignment_due_at: dueAt.toISOString(),
    },
  );

  if (error) {
    fail("/dashboard/foundry/tasks", "Task publish aur assign nahi ho saka.");
  }

  succeed("/dashboard/foundry/tasks", "Task publish aur assign ho gaya.");
}

export async function reviewFoundrySubmission(formData: FormData) {
  const parsed = z
    .object({
      requestId: idSchema,
      submissionId: idSchema,
      status: z.enum(["accepted", "revision_required"]),
      feedback: z.string().min(3).max(8000),
      score: z.coerce.number().int().min(0).max(100),
    })
    .safeParse({
      requestId: value(formData, "requestId"),
      submissionId: value(formData, "submissionId"),
      status: value(formData, "status"),
      feedback: value(formData, "feedback"),
      score: value(formData, "score"),
    });

  if (!parsed.success) {
    fail("/dashboard/foundry/submissions", "Feedback aur score dobara check karein.");
  }

  const { supabase } = await requireFounderFoundry();
  const { error } = await supabase.rpc(
    "review_foundry_submission_command",
    {
      target_submission_id: parsed.data.submissionId,
      command_request_id: parsed.data.requestId,
      review_decision: parsed.data.status,
      review_feedback: parsed.data.feedback,
      review_score: parsed.data.score,
    },
  );

  if (error) {
    fail("/dashboard/foundry/submissions", "Submission review save nahi ho saka.");
  }

  succeed(
    "/dashboard/foundry/submissions",
    parsed.data.status === "accepted"
      ? "Work accept ho gaya aur progress update ho gayi."
      : "Simple revision student ko bhej di gayi.",
  );
}

export async function updateFoundryStudent(formData: FormData) {
  const parsed = z
    .object({
      studentId: idSchema,
      department: z.enum(departments),
      healthStatus: z.enum(healthStates),
      progressPercent: z.coerce.number().int().min(0).max(100),
      email: z.string().trim().email().max(254).or(z.literal("")),
      nextAction: z.string().max(500),
      learningDifficulty: z.string().max(500),
    })
    .safeParse({
      studentId: value(formData, "studentId"),
      department: value(formData, "department"),
      healthStatus: value(formData, "healthStatus"),
      progressPercent: value(formData, "progressPercent"),
      email: value(formData, "email"),
      nextAction: value(formData, "nextAction"),
      learningDifficulty: value(formData, "learningDifficulty"),
    });

  if (!parsed.success) {
    const studentId = encodeURIComponent(value(formData, "studentId"));
    fail(`/dashboard/foundry/students/${studentId}`, "Student update valid nahi hai.");
  }

  const path = `/dashboard/foundry/students/${parsed.data.studentId}`;
  const { supabase, workspace } = await requireFounderFoundry();
  const { data: currentStudent } = await supabase
    .from("foundry_students")
    .select("auth_user_id, email")
    .eq("workspace_id", workspace.id)
    .eq("id", parsed.data.studentId)
    .maybeSingle();

  if (!currentStudent) {
    fail(path, "Student record nahi mila.");
  }

  const nextEmail = parsed.data.email.toLowerCase();
  if (
    currentStudent.auth_user_id &&
    (currentStudent.email ?? "").toLowerCase() !== nextEmail
  ) {
    fail(
      path,
      "Connected sign-in email locked hai. Identity badalne ke liye access review karein.",
    );
  }

  const { data, error } = await supabase
    .from("foundry_students")
    .update({
      department: parsed.data.department,
      health_status: parsed.data.healthStatus,
      progress_percent: parsed.data.progressPercent,
      email: optional(nextEmail),
      next_action: optional(parsed.data.nextAction),
      learning_difficulty: optional(parsed.data.learningDifficulty),
    })
    .eq("workspace_id", workspace.id)
    .eq("id", parsed.data.studentId)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    if (error?.code === "23505") {
      fail(path, "Yeh sign-in email kisi aur active student record par hai.");
    }
    fail(path, "Student record update nahi hua.");
  }

  succeed(path, "Student record update ho gaya.");
}

export async function updateFoundrySkillScore(formData: FormData) {
  const parsed = z
    .object({
      studentId: idSchema,
      dimension: z.enum(skillDimensions),
      score: z.coerce.number().int().min(0).max(100),
      evidenceCount: z.coerce.number().int().min(0).max(10000),
      note: z.string().max(1000),
    })
    .safeParse({
      studentId: value(formData, "studentId"),
      dimension: value(formData, "dimension"),
      score: value(formData, "score"),
      evidenceCount: value(formData, "evidenceCount") || "0",
      note: value(formData, "note"),
    });

  if (!parsed.success) {
    fail("/dashboard/foundry/progress", "Skill score valid nahi hai.");
  }

  const { supabase, user, workspace } = await requireFounderFoundry();
  const { data, error } = await supabase
    .from("foundry_skill_scores")
    .upsert(
      {
        workspace_id: workspace.id,
        student_id: parsed.data.studentId,
        dimension: parsed.data.dimension,
        score: parsed.data.score,
        evidence_count: parsed.data.evidenceCount,
        note: optional(parsed.data.note),
        updated_by: user.id,
      },
      { onConflict: "workspace_id,student_id,dimension" },
    )
    .select("id")
    .maybeSingle();

  if (error || !data) {
    fail("/dashboard/foundry/progress", "Skill score save nahi hua.");
  }

  succeed("/dashboard/foundry/progress", "Skill score aur readiness update ho gayi.");
}

const submissionSchema = z
  .object({
    requestId: idSchema,
    assignmentId: idSchema,
    submissionUrl: z.string().url().max(1000).or(z.literal("")),
    studentNote: z.string().max(4000),
  })
  .refine((submission) => submission.submissionUrl || submission.studentNote, {
    message: "Add a work link or note.",
  });

export async function submitCurrentStudentWork(formData: FormData) {
  const parsed = submissionSchema.safeParse({
    requestId: value(formData, "requestId"),
    assignmentId: value(formData, "assignmentId"),
    submissionUrl: value(formData, "submissionUrl"),
    studentNote: value(formData, "studentNote"),
  });
  if (!parsed.success) fail("/learn/submit", "Link ya note dobara check karein.");

  const { supabase } = await requireStudentAccess();
  const { error } = await supabase.rpc("submit_foundry_assignment_command", {
    target_assignment_id: parsed.data.assignmentId,
    command_request_id: parsed.data.requestId,
    work_url: parsed.data.submissionUrl,
    work_note: parsed.data.studentNote,
  });

  if (error) {
    fail(
      "/learn/submit",
      "Work submit nahi ho saka. Link, task status aur note dobara check karein.",
    );
  }

  succeed(
    "/learn/submit",
    "Shabash — work teacher review ke liye submit ho gaya.",
  );
}
