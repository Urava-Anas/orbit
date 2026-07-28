"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireFounderFoundry } from "@/lib/foundry";
import { requireWorkspace } from "@/lib/workspace";

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

  const { supabase, user, workspace } = await requireFounderFoundry();
  const { error } = await supabase.from("foundry_classes").insert({
    workspace_id: workspace.id,
    title: parsed.data.title,
    instructor_name: parsed.data.instructorName,
    department: optional(parsed.data.department),
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    mode: parsed.data.mode,
    join_url: optional(parsed.data.joinUrl),
    status: "scheduled",
    notes: optional(parsed.data.notes),
    created_by: user.id,
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
  const { error } = await supabase.from("foundry_attendance").upsert(
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
  );

  if (error) {
    fail("/dashboard/foundry/attendance", "Attendance save nahi ho saki.");
  }

  succeed("/dashboard/foundry/attendance", "Attendance update ho gayi.");
}

export async function createFoundryTask(formData: FormData) {
  const parsed = z
    .object({
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

  const { supabase, user, workspace } = await requireFounderFoundry();
  const { data: student } = await supabase
    .from("foundry_students")
    .select("id")
    .eq("workspace_id", workspace.id)
    .eq("id", parsed.data.studentId)
    .maybeSingle();

  if (!student) {
    fail("/dashboard/foundry/tasks", "Student is organisation mein nahi mila.");
  }

  const { data: task, error: taskError } = await supabase
    .from("foundry_tasks")
    .insert({
      workspace_id: workspace.id,
      title: parsed.data.title,
      instructions_roman_urdu: parsed.data.instructions,
      department: parsed.data.department,
      difficulty: parsed.data.difficulty,
      skill_dimension: optional(parsed.data.skillDimension),
      points: parsed.data.points,
      status: "published",
      created_by: user.id,
    })
    .select("id")
    .single();

  if (taskError || !task) {
    fail("/dashboard/foundry/tasks", "Task save nahi ho saka.");
  }

  const { error: assignmentError } = await supabase
    .from("foundry_task_assignments")
    .insert({
      workspace_id: workspace.id,
      task_id: task.id,
      student_id: parsed.data.studentId,
      status: "assigned",
      due_at: dueAt.toISOString(),
      assigned_by: user.id,
    });

  if (assignmentError) {
    fail("/dashboard/foundry/tasks", "Task bana, lekin student ko assign nahi ho saka.");
  }

  succeed("/dashboard/foundry/tasks", "Task publish aur assign ho gaya.");
}

export async function reviewFoundrySubmission(formData: FormData) {
  const parsed = z
    .object({
      submissionId: idSchema,
      status: z.enum(["accepted", "revision_required"]),
      feedback: z.string().min(3).max(8000),
      score: z.coerce.number().int().min(0).max(100),
    })
    .safeParse({
      submissionId: value(formData, "submissionId"),
      status: value(formData, "status"),
      feedback: value(formData, "feedback"),
      score: value(formData, "score"),
    });

  if (!parsed.success) {
    fail("/dashboard/foundry/submissions", "Feedback aur score dobara check karein.");
  }

  const { supabase, user, workspace } = await requireFounderFoundry();
  const { error } = await supabase
    .from("foundry_submissions")
    .update({
      status: parsed.data.status,
      feedback: parsed.data.feedback,
      score: parsed.data.score,
      reviewed_at: new Date().toISOString(),
      reviewed_by: user.id,
    })
    .eq("workspace_id", workspace.id)
    .eq("id", parsed.data.submissionId);

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
      nextAction: z.string().max(500),
      learningDifficulty: z.string().max(500),
    })
    .safeParse({
      studentId: value(formData, "studentId"),
      department: value(formData, "department"),
      healthStatus: value(formData, "healthStatus"),
      progressPercent: value(formData, "progressPercent"),
      nextAction: value(formData, "nextAction"),
      learningDifficulty: value(formData, "learningDifficulty"),
    });

  if (!parsed.success) {
    const studentId = encodeURIComponent(value(formData, "studentId"));
    fail(`/dashboard/foundry/students/${studentId}`, "Student update valid nahi hai.");
  }

  const path = `/dashboard/foundry/students/${parsed.data.studentId}`;
  const { supabase, workspace } = await requireFounderFoundry();
  const { error } = await supabase
    .from("foundry_students")
    .update({
      department: parsed.data.department,
      health_status: parsed.data.healthStatus,
      progress_percent: parsed.data.progressPercent,
      next_action: optional(parsed.data.nextAction),
      learning_difficulty: optional(parsed.data.learningDifficulty),
    })
    .eq("workspace_id", workspace.id)
    .eq("id", parsed.data.studentId);

  if (error) {
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
  const { error } = await supabase.from("foundry_skill_scores").upsert(
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
  );

  if (error) {
    fail("/dashboard/foundry/progress", "Skill score save nahi hua.");
  }

  succeed("/dashboard/foundry/progress", "Skill score aur readiness update ho gayi.");
}

async function insertSubmission({
  assignmentId,
  studentId,
  submissionUrl,
  studentNote,
  path,
  founderPreview,
}: {
  assignmentId: string;
  studentId: string;
  submissionUrl: string;
  studentNote: string;
  path: string;
  founderPreview: boolean;
}) {
  const context = founderPreview
    ? await requireFounderFoundry()
    : await requireWorkspace();
  const { supabase, workspace, user } = context;

  if (!founderPreview) {
    const { data: ownStudent } = await supabase
      .from("foundry_students")
      .select("id")
      .eq("workspace_id", workspace.id)
      .eq("id", studentId)
      .eq("auth_user_id", user.id)
      .maybeSingle();
    if (!ownStudent) fail(path, "Yeh task aap ke account se linked nahi hai.");
  }

  const { data: assignment } = await supabase
    .from("foundry_task_assignments")
    .select("id")
    .eq("workspace_id", workspace.id)
    .eq("id", assignmentId)
    .eq("student_id", studentId)
    .maybeSingle();
  if (!assignment) fail(path, "Assigned task nahi mila.");

  const { error } = await supabase.from("foundry_submissions").insert({
    workspace_id: workspace.id,
    assignment_id: assignmentId,
    student_id: studentId,
    submission_url: optional(submissionUrl),
    student_note: optional(studentNote),
    status: "submitted",
    submitted_at: new Date().toISOString(),
  });

  if (error) {
    fail(path, "Work submit nahi ho saka. Link aur note dobara check karein.");
  }

  succeed(path, "Shabash — work teacher review ke liye submit ho gaya.");
}

const submissionSchema = z.object({
  assignmentId: idSchema,
  studentId: idSchema,
  submissionUrl: z.string().url().max(1000).or(z.literal("")),
  studentNote: z.string().max(4000),
});

export async function submitFoundryPreviewWork(formData: FormData) {
  const parsed = submissionSchema.safeParse({
    assignmentId: value(formData, "assignmentId"),
    studentId: value(formData, "studentId"),
    submissionUrl: value(formData, "submissionUrl"),
    studentNote: value(formData, "studentNote"),
  });
  const studentId = value(formData, "studentId");
  const path = `/dashboard/foundry/students/${encodeURIComponent(studentId)}/portal`;
  if (!parsed.success) fail(path, "Submission details dobara check karein.");
  await insertSubmission({ ...parsed.data, path, founderPreview: true });
}

export async function submitCurrentStudentWork(formData: FormData) {
  const parsed = submissionSchema.safeParse({
    assignmentId: value(formData, "assignmentId"),
    studentId: value(formData, "studentId"),
    submissionUrl: value(formData, "submissionUrl"),
    studentNote: value(formData, "studentNote"),
  });
  if (!parsed.success) fail("/learn/submit", "Link ya note dobara check karein.");
  await insertSubmission({
    ...parsed.data,
    path: "/learn/submit",
    founderPreview: false,
  });
}
