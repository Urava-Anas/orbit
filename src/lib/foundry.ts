import "server-only";

import { redirect } from "next/navigation";
import { requireStudentAccess } from "@/lib/access";
import { requireWorkspace } from "@/lib/workspace";

export type FoundryHealth = "green" | "yellow" | "red" | "gold";

export type FoundryStudent = {
  id: string;
  foundry_id: string;
  auth_user_id: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  photo_url: string | null;
  department: string;
  level: string;
  lifecycle_status: string;
  health_status: FoundryHealth;
  progress_percent: number;
  device_access: string;
  preferred_language: string;
  learning_difficulty: string | null;
  main_goal: string | null;
  founder_notes: string | null;
  next_action: string | null;
  batch_label: string | null;
  studio_eligible: boolean;
  last_active_at: string | null;
  created_at: string;
  updated_at: string;
};

export type FoundryClass = {
  id: string;
  title: string;
  department: string | null;
  instructor_name: string;
  starts_at: string;
  ends_at: string;
  mode: string;
  join_url: string | null;
  room_label: string | null;
  status: string;
  capacity: number;
  notes: string | null;
};

export type FoundryTask = {
  id: string;
  title: string;
  instructions_roman_urdu: string;
  instructions_english: string | null;
  department: string;
  difficulty: string;
  skill_dimension: string | null;
  points: number;
  status: string;
  created_at: string;
};

export type FoundryAssignment = {
  id: string;
  task_id: string;
  student_id: string;
  status: string;
  due_at: string;
  recovery_for_assignment_id: string | null;
  foundry_tasks: FoundryTask | null;
  foundry_students?: Pick<
    FoundryStudent,
    "id" | "foundry_id" | "full_name" | "health_status"
  > | null;
};

export type FoundrySubmission = {
  id: string;
  assignment_id: string;
  student_id: string;
  submission_url: string | null;
  student_note: string | null;
  status: string;
  feedback: string | null;
  score: number | null;
  submitted_at: string;
  reviewed_at: string | null;
  foundry_students?: Pick<
    FoundryStudent,
    "id" | "foundry_id" | "full_name" | "health_status"
  > | null;
  foundry_task_assignments?: {
    id: string;
    foundry_tasks: Pick<FoundryTask, "id" | "title" | "points"> | null;
  } | null;
};

export type FoundryAttendance = {
  id: string;
  class_id: string;
  student_id: string;
  status: string;
  note: string | null;
  marked_at: string;
  foundry_students?: Pick<
    FoundryStudent,
    "id" | "foundry_id" | "full_name" | "health_status"
  > | null;
  foundry_classes?: Pick<FoundryClass, "id" | "title" | "starts_at"> | null;
};

export type FoundrySkillScore = {
  id: string;
  student_id: string;
  dimension: string;
  score: number;
  evidence_count: number;
  note: string | null;
  updated_at: string;
};

export type FoundryProgressEvent = {
  id: string;
  student_id: string;
  event_type: string;
  title: string;
  detail: string | null;
  points: number;
  evidence_url: string | null;
  occurred_at: string;
};

const studentFields =
  "id, foundry_id, auth_user_id, full_name, email, phone, photo_url, department, level, lifecycle_status, health_status, progress_percent, device_access, preferred_language, learning_difficulty, main_goal, founder_notes, next_action, batch_label, studio_eligible, last_active_at, created_at, updated_at";

function pakistanDateKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function dayBounds(date = new Date()) {
  const day = pakistanDateKey(date);
  return {
    start: `${day}T00:00:00+05:00`,
    end: `${day}T23:59:59.999+05:00`,
  };
}

function dataOrThrow<T>(data: T | null, error: { message: string } | null, label: string): T {
  if (error || data === null) {
    throw new Error(`${label}: ${error?.message ?? "No data returned"}`);
  }
  return data;
}

export async function requireFounderFoundry() {
  const context = await requireWorkspace();
  if (!["owner", "admin"].includes(context.role)) {
    redirect("/learn");
  }
  return context;
}

export async function getFoundryDashboard() {
  const context = await requireFounderFoundry();
  const { supabase, workspace } = context;
  const today = dayBounds();

  const [
    studentsResult,
    classesResult,
    todayClassesResult,
    assignmentsResult,
    submissionsResult,
    moduleResult,
  ] = await Promise.all([
    supabase
      .from("foundry_students")
      .select(studentFields)
      .eq("workspace_id", workspace.id)
      .order("foundry_id"),
    supabase
      .from("foundry_classes")
      .select(
        "id, title, department, instructor_name, starts_at, ends_at, mode, join_url, room_label, status, capacity, notes",
      )
      .eq("workspace_id", workspace.id)
      .gte("ends_at", new Date().toISOString())
      .neq("status", "cancelled")
      .order("starts_at")
      .limit(6),
    supabase
      .from("foundry_classes")
      .select("id")
      .eq("workspace_id", workspace.id)
      .gte("starts_at", today.start)
      .lte("starts_at", today.end),
    supabase
      .from("foundry_task_assignments")
      .select(
        "id, task_id, student_id, status, due_at, recovery_for_assignment_id, foundry_tasks(id, title, instructions_roman_urdu, instructions_english, department, difficulty, skill_dimension, points, status, created_at), foundry_students(id, foundry_id, full_name, health_status)",
      )
      .eq("workspace_id", workspace.id)
      .order("due_at"),
    supabase
      .from("foundry_submissions")
      .select(
        "id, assignment_id, student_id, submission_url, student_note, status, feedback, score, submitted_at, reviewed_at, foundry_students(id, foundry_id, full_name, health_status), foundry_task_assignments(id, foundry_tasks(id, title, points))",
      )
      .eq("workspace_id", workspace.id)
      .in("status", ["submitted", "under_review"])
      .order("submitted_at"),
    supabase
      .from("organisation_modules")
      .select("status, config")
      .eq("workspace_id", workspace.id)
      .eq("module_key", "foundry")
      .maybeSingle(),
  ]);

  const students = dataOrThrow(
    studentsResult.data,
    studentsResult.error,
    "Foundry students",
  ) as unknown as FoundryStudent[];
  const classes = dataOrThrow(
    classesResult.data,
    classesResult.error,
    "Foundry classes",
  ) as unknown as FoundryClass[];
  const assignments = dataOrThrow(
    assignmentsResult.data,
    assignmentsResult.error,
    "Foundry assignments",
  ) as unknown as FoundryAssignment[];
  const submissions = dataOrThrow(
    submissionsResult.data,
    submissionsResult.error,
    "Foundry submissions",
  ) as unknown as FoundrySubmission[];
  const todayClassIds = (todayClassesResult.data ?? []).map((item) => item.id);

  let todayAttendance: Array<{ status: string }> = [];
  if (todayClassIds.length) {
    const attendanceResult = await supabase
      .from("foundry_attendance")
      .select("status")
      .eq("workspace_id", workspace.id)
      .in("class_id", todayClassIds);
    todayAttendance = dataOrThrow(
      attendanceResult.data,
      attendanceResult.error,
      "Today attendance",
    );
  }

  const moduleConfig =
    (moduleResult.data?.config as Record<string, unknown> | null) ?? {};

  return {
    ...context,
    students,
    classes,
    assignments,
    submissions,
    todayAttendance,
    seatCapacity:
      typeof moduleConfig.seat_capacity === "number"
        ? moduleConfig.seat_capacity
        : 20,
  };
}

export async function listFoundryStudents() {
  const context = await requireFounderFoundry();
  const result = await context.supabase
    .from("foundry_students")
    .select(studentFields)
    .eq("workspace_id", context.workspace.id)
    .order("foundry_id");

  return {
    ...context,
    students: dataOrThrow(
      result.data,
      result.error,
      "Foundry students",
    ) as unknown as FoundryStudent[],
  };
}

export async function getFoundryStudent(studentId: string) {
  const context = await requireFounderFoundry();
  const { supabase, workspace } = context;

  const [
    studentResult,
    assignmentsResult,
    submissionsResult,
    attendanceResult,
    skillsResult,
    progressResult,
  ] = await Promise.all([
    supabase
      .from("foundry_students")
      .select(studentFields)
      .eq("workspace_id", workspace.id)
      .eq("id", studentId)
      .maybeSingle(),
    supabase
      .from("foundry_task_assignments")
      .select(
        "id, task_id, student_id, status, due_at, recovery_for_assignment_id, foundry_tasks(id, title, instructions_roman_urdu, instructions_english, department, difficulty, skill_dimension, points, status, created_at)",
      )
      .eq("workspace_id", workspace.id)
      .eq("student_id", studentId)
      .order("due_at", { ascending: false }),
    supabase
      .from("foundry_submissions")
      .select(
        "id, assignment_id, student_id, submission_url, student_note, status, feedback, score, submitted_at, reviewed_at",
      )
      .eq("workspace_id", workspace.id)
      .eq("student_id", studentId)
      .order("submitted_at", { ascending: false }),
    supabase
      .from("foundry_attendance")
      .select(
        "id, class_id, student_id, status, note, marked_at, foundry_classes(id, title, starts_at)",
      )
      .eq("workspace_id", workspace.id)
      .eq("student_id", studentId)
      .order("marked_at", { ascending: false }),
    supabase
      .from("foundry_skill_scores")
      .select(
        "id, student_id, dimension, score, evidence_count, note, updated_at",
      )
      .eq("workspace_id", workspace.id)
      .eq("student_id", studentId)
      .order("dimension"),
    supabase
      .from("foundry_progress_events")
      .select(
        "id, student_id, event_type, title, detail, points, evidence_url, occurred_at",
      )
      .eq("workspace_id", workspace.id)
      .eq("student_id", studentId)
      .order("occurred_at", { ascending: false }),
  ]);

  return {
    ...context,
    student: studentResult.data as unknown as FoundryStudent | null,
    assignments: (assignmentsResult.data ?? []) as unknown as FoundryAssignment[],
    submissions: (submissionsResult.data ?? []) as unknown as FoundrySubmission[],
    attendance: (attendanceResult.data ?? []) as unknown as FoundryAttendance[],
    skills: (skillsResult.data ?? []) as unknown as FoundrySkillScore[],
    progress: (progressResult.data ?? []) as unknown as FoundryProgressEvent[],
  };
}

export async function listFoundryClasses() {
  const context = await requireFounderFoundry();
  const [classesResult, attendanceResult, studentsResult] = await Promise.all([
    context.supabase
      .from("foundry_classes")
      .select(
        "id, title, department, instructor_name, starts_at, ends_at, mode, join_url, room_label, status, capacity, notes",
      )
      .eq("workspace_id", context.workspace.id)
      .order("starts_at", { ascending: false }),
    context.supabase
      .from("foundry_attendance")
      .select(
        "id, class_id, student_id, status, note, marked_at, foundry_students(id, foundry_id, full_name, health_status), foundry_classes(id, title, starts_at)",
      )
      .eq("workspace_id", context.workspace.id)
      .order("marked_at", { ascending: false }),
    context.supabase
      .from("foundry_students")
      .select("id, foundry_id, full_name, health_status")
      .eq("workspace_id", context.workspace.id)
      .order("foundry_id"),
  ]);

  return {
    ...context,
    classes: (classesResult.data ?? []) as unknown as FoundryClass[],
    attendance: (attendanceResult.data ?? []) as unknown as FoundryAttendance[],
    students: (studentsResult.data ?? []) as Array<
      Pick<FoundryStudent, "id" | "foundry_id" | "full_name" | "health_status">
    >,
  };
}

export async function listFoundryTasks() {
  const context = await requireFounderFoundry();
  const [tasksResult, assignmentsResult, studentsResult] = await Promise.all([
    context.supabase
      .from("foundry_tasks")
      .select(
        "id, title, instructions_roman_urdu, instructions_english, department, difficulty, skill_dimension, points, status, created_at",
      )
      .eq("workspace_id", context.workspace.id)
      .order("created_at", { ascending: false }),
    context.supabase
      .from("foundry_task_assignments")
      .select(
        "id, task_id, student_id, status, due_at, recovery_for_assignment_id, foundry_tasks(id, title, instructions_roman_urdu, instructions_english, department, difficulty, skill_dimension, points, status, created_at), foundry_students(id, foundry_id, full_name, health_status)",
      )
      .eq("workspace_id", context.workspace.id)
      .order("due_at"),
    context.supabase
      .from("foundry_students")
      .select("id, foundry_id, full_name, health_status")
      .eq("workspace_id", context.workspace.id)
      .order("foundry_id"),
  ]);

  return {
    ...context,
    tasks: (tasksResult.data ?? []) as unknown as FoundryTask[],
    assignments: (assignmentsResult.data ?? []) as unknown as FoundryAssignment[],
    students: (studentsResult.data ?? []) as Array<
      Pick<FoundryStudent, "id" | "foundry_id" | "full_name" | "health_status">
    >,
  };
}

export async function listFoundrySubmissions() {
  const context = await requireFounderFoundry();
  const result = await context.supabase
    .from("foundry_submissions")
    .select(
      "id, assignment_id, student_id, submission_url, student_note, status, feedback, score, submitted_at, reviewed_at, foundry_students(id, foundry_id, full_name, health_status), foundry_task_assignments(id, foundry_tasks(id, title, points))",
    )
    .eq("workspace_id", context.workspace.id)
    .order("submitted_at", { ascending: false });

  return {
    ...context,
    submissions: (result.data ?? []) as unknown as FoundrySubmission[],
  };
}

export async function listFoundryProgress() {
  const context = await requireFounderFoundry();
  const [studentsResult, skillsResult, progressResult] = await Promise.all([
    context.supabase
      .from("foundry_students")
      .select(studentFields)
      .eq("workspace_id", context.workspace.id)
      .order("progress_percent", { ascending: false }),
    context.supabase
      .from("foundry_skill_scores")
      .select(
        "id, student_id, dimension, score, evidence_count, note, updated_at",
      )
      .eq("workspace_id", context.workspace.id),
    context.supabase
      .from("foundry_progress_events")
      .select(
        "id, student_id, event_type, title, detail, points, evidence_url, occurred_at",
      )
      .eq("workspace_id", context.workspace.id)
      .order("occurred_at", { ascending: false })
      .limit(30),
  ]);

  return {
    ...context,
    students: (studentsResult.data ?? []) as unknown as FoundryStudent[],
    skills: (skillsResult.data ?? []) as unknown as FoundrySkillScore[],
    progress: (progressResult.data ?? []) as unknown as FoundryProgressEvent[],
  };
}

async function getPortalDataForStudent(
  student: FoundryStudent,
  context:
    | Awaited<ReturnType<typeof requireWorkspace>>
    | Awaited<ReturnType<typeof requireStudentAccess>>,
) {
  const { supabase, workspace } = context;
  const [assignmentsResult, submissionsResult, classesResult, skillsResult, progressResult] =
    await Promise.all([
      supabase
        .from("foundry_task_assignments")
        .select(
          "id, task_id, student_id, status, due_at, recovery_for_assignment_id, foundry_tasks(id, title, instructions_roman_urdu, instructions_english, department, difficulty, skill_dimension, points, status, created_at)",
        )
        .eq("workspace_id", workspace.id)
        .eq("student_id", student.id)
        .order("due_at"),
      supabase
        .from("foundry_submissions")
        .select(
          "id, assignment_id, student_id, submission_url, student_note, status, feedback, score, submitted_at, reviewed_at",
        )
        .eq("workspace_id", workspace.id)
        .eq("student_id", student.id)
        .order("submitted_at", { ascending: false }),
      supabase
        .from("foundry_classes")
        .select(
          "id, title, department, instructor_name, starts_at, ends_at, mode, join_url, room_label, status, capacity, notes",
        )
        .eq("workspace_id", workspace.id)
        .or(`department.is.null,department.eq.${student.department}`)
        .gte("ends_at", new Date().toISOString())
        .neq("status", "cancelled")
        .order("starts_at")
        .limit(4),
      supabase
        .from("foundry_skill_scores")
        .select(
          "id, student_id, dimension, score, evidence_count, note, updated_at",
        )
        .eq("workspace_id", workspace.id)
        .eq("student_id", student.id)
        .order("dimension"),
      supabase
        .from("foundry_progress_events")
        .select(
          "id, student_id, event_type, title, detail, points, evidence_url, occurred_at",
        )
        .eq("workspace_id", workspace.id)
        .eq("student_id", student.id)
        .order("occurred_at", { ascending: false })
        .limit(20),
    ]);

  return {
    ...context,
    student,
    assignments: (assignmentsResult.data ?? []) as unknown as FoundryAssignment[],
    submissions: (submissionsResult.data ?? []) as unknown as FoundrySubmission[],
    classes: (classesResult.data ?? []) as unknown as FoundryClass[],
    skills: (skillsResult.data ?? []) as unknown as FoundrySkillScore[],
    progress: (progressResult.data ?? []) as unknown as FoundryProgressEvent[],
  };
}

export async function getFounderStudentPreview(studentId: string) {
  const context = await requireFounderFoundry();
  const result = await context.supabase
    .from("foundry_students")
    .select(studentFields)
    .eq("workspace_id", context.workspace.id)
    .eq("id", studentId)
    .maybeSingle();

  if (!result.data) return null;
  return getPortalDataForStudent(
    result.data as unknown as FoundryStudent,
    context,
  );
}

export async function getCurrentStudentPortal() {
  const context = await requireStudentAccess();
  const result = await context.supabase
    .from("foundry_students")
    .select(studentFields)
    .eq("workspace_id", context.workspace.id)
    .eq("id", context.studentId)
    .eq("auth_user_id", context.user.id)
    .maybeSingle();

  if (!result.data) {
    return { ...context, student: null };
  }

  return getPortalDataForStudent(
    result.data as unknown as FoundryStudent,
    context,
  );
}

export function foundryDepartmentLabel(value: string | null) {
  const labels: Record<string, string> = {
    unassigned: "Unassigned",
    creative_ui: "Creative & UI",
    web_app: "Web & App",
    ai_automation: "AI & Automation",
    sales_calling: "Sales & Calling",
    operations: "Operations",
    content_media: "Content & Media",
  };
  return value ? (labels[value] ?? value) : "All departments";
}

export function foundryLevelLabel(value: string) {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function formatFoundryDate(value: string, withTime = true) {
  return new Intl.DateTimeFormat("en-PK", {
    timeZone: "Asia/Karachi",
    day: "numeric",
    month: "short",
    ...(withTime
      ? { hour: "numeric", minute: "2-digit", hour12: true }
      : {}),
  }).format(new Date(value));
}
