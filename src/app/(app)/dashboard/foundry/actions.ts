"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireStudentAccess } from "@/lib/access";
import { scheduleFoundryWorker } from "@/lib/foundry-integrations/schedule";
import { runFoundryWorker } from "@/lib/foundry-integrations/worker";
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
const classStates = ["scheduled", "live", "completed", "cancelled"] as const;
const levelStates = [
  "applied",
  "screening",
  "trial",
  "accepted",
  "onboarding",
  "explorer",
  "apprentice",
  "operator",
  "specialist",
  "mentor_alumni",
] as const;
const lifecycleStates = [
  "new",
  "reviewing",
  "shortlisted",
  "accepted",
  "waitlisted",
  "enrolled",
  "inactive",
  "graduated",
  "rejected",
] as const;
const deviceStates = [
  "own_laptop",
  "shared_laptop",
  "mobile_only",
  "no_reliable_device",
  "unknown",
] as const;
const languageStates = ["roman_urdu", "urdu", "english", "bilingual"] as const;
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
  const separator = path.includes("?") ? "&" : "?";
  redirect(`${path}${separator}error=${encodeURIComponent(message)}`);
}

function succeed(path: string, message: string): never {
  scheduleFoundryWorker();
  revalidatePath("/dashboard/foundry", "layout");
  revalidatePath("/learn", "layout");
  revalidatePath(path);
  const separator = path.includes("?") ? "&" : "?";
  redirect(`${path}${separator}notice=${encodeURIComponent(message)}`);
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

export async function updateFoundryClassStatus(formData: FormData) {
  const parsed = z
    .object({
      classId: idSchema,
      status: z.enum(classStates),
    })
    .safeParse({
      classId: value(formData, "classId"),
      status: value(formData, "status"),
    });

  if (!parsed.success) {
    fail("/dashboard/foundry/classes", "Class status valid nahi hai.");
  }

  const { supabase, workspace } = await requireFounderFoundry();
  const { data, error } = await supabase
    .from("foundry_classes")
    .update({ status: parsed.data.status })
    .eq("workspace_id", workspace.id)
    .eq("id", parsed.data.classId)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    fail(
      "/dashboard/foundry/classes",
      parsed.data.status === "completed"
        ? "Complete karne se pehle poori attendance roster save karein."
        : "Class status update nahi hua. Current state dobara check karein.",
    );
  }

  const statusMessage = {
    scheduled: "Class schedule par wapas aa gayi.",
    live: "Class ab live hai.",
    completed: "Class complete mark ho gayi.",
    cancelled: "Class cancel ho gayi aur students ko update mil jayegi.",
  }[parsed.data.status];

  succeed("/dashboard/foundry/classes", statusMessage);
}

export async function markFoundryAttendanceRoster(formData: FormData) {
  const parsedClassId = idSchema.safeParse(value(formData, "classId"));
  if (!parsedClassId.success) {
    fail("/dashboard/foundry/attendance", "Class dobara select karein.");
  }

  const { supabase, user, workspace } = await requireFounderFoundry();
  const [classResult, studentsResult] = await Promise.all([
    supabase
      .from("foundry_classes")
      .select("id, department")
      .eq("workspace_id", workspace.id)
      .eq("id", parsedClassId.data)
      .maybeSingle(),
    supabase
      .from("foundry_students")
      .select("id, department, lifecycle_status")
      .eq("workspace_id", workspace.id),
  ]);

  const selectedClass = classResult.data;
  if (classResult.error || !selectedClass || studentsResult.error) {
    fail("/dashboard/foundry/attendance", "Class roster load nahi hua.");
  }

  const eligibleStudents = (studentsResult.data ?? []).filter(
    (student) =>
      !["inactive", "graduated", "rejected"].includes(
        student.lifecycle_status,
      ) &&
      (!selectedClass.department ||
        student.department === selectedClass.department),
  );

  const markedAt = new Date().toISOString();
  const records = eligibleStudents.flatMap((student) => {
    const status = value(formData, `status-${student.id}`);
    const note = value(formData, `note-${student.id}`);
    const parsed = z
      .object({
        status: z.enum(attendanceStates),
        note: z.string().max(500),
      })
      .safeParse({ status, note });

    if (!parsed.success) return [];

    return [
      {
        workspace_id: workspace.id,
        class_id: selectedClass.id,
        student_id: student.id,
        status: parsed.data.status,
        note: optional(parsed.data.note),
        marked_by: user.id,
        marked_at: markedAt,
      },
    ];
  });

  if (!records.length || records.length !== eligibleStudents.length) {
    fail(
      `/dashboard/foundry/attendance?classId=${parsedClassId.data}`,
      "Har student ki attendance dobara check karein.",
    );
  }

  const { error } = await supabase.from("foundry_attendance").upsert(records, {
    onConflict: "workspace_id,class_id,student_id",
  });

  if (error) {
    fail(
      `/dashboard/foundry/attendance?classId=${parsedClassId.data}`,
      "Attendance roster save nahi hua.",
    );
  }

  succeed(
    `/dashboard/foundry/attendance?classId=${parsedClassId.data}`,
    `${records.length} students ki attendance save ho gayi.`,
  );
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
      fullName: z.string().min(2).max(120),
      phone: z.string().max(40),
      department: z.enum(departments),
      level: z.enum(levelStates),
      lifecycleStatus: z.enum(lifecycleStates),
      healthStatus: z.enum(healthStates),
      progressPercent: z.coerce.number().int().min(0).max(100),
      deviceAccess: z.enum(deviceStates),
      preferredLanguage: z.enum(languageStates),
      email: z.string().trim().email().max(254).or(z.literal("")),
      batchLabel: z.string().max(80),
      mainGoal: z.string().max(1000),
      nextAction: z.string().max(500),
      learningDifficulty: z.string().max(500),
      founderNotes: z.string().max(4000),
    })
    .safeParse({
      studentId: value(formData, "studentId"),
      fullName: value(formData, "fullName"),
      phone: value(formData, "phone"),
      department: value(formData, "department"),
      level: value(formData, "level"),
      lifecycleStatus: value(formData, "lifecycleStatus"),
      healthStatus: value(formData, "healthStatus"),
      progressPercent: value(formData, "progressPercent"),
      deviceAccess: value(formData, "deviceAccess"),
      preferredLanguage: value(formData, "preferredLanguage"),
      email: value(formData, "email"),
      batchLabel: value(formData, "batchLabel"),
      mainGoal: value(formData, "mainGoal"),
      nextAction: value(formData, "nextAction"),
      learningDifficulty: value(formData, "learningDifficulty"),
      founderNotes: value(formData, "founderNotes"),
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
      full_name: parsed.data.fullName,
      phone: optional(parsed.data.phone),
      department: parsed.data.department,
      level: parsed.data.level,
      lifecycle_status: parsed.data.lifecycleStatus,
      health_status: parsed.data.healthStatus,
      progress_percent: parsed.data.progressPercent,
      device_access: parsed.data.deviceAccess,
      preferred_language: parsed.data.preferredLanguage,
      email: optional(nextEmail),
      batch_label: optional(parsed.data.batchLabel),
      main_goal: optional(parsed.data.mainGoal),
      next_action: optional(parsed.data.nextAction),
      learning_difficulty: optional(parsed.data.learningDifficulty),
      founder_notes: optional(parsed.data.founderNotes),
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

export async function updateFoundryCapacity(formData: FormData) {
  const parsed = z
    .object({
      seatCapacity: z.coerce.number().int().min(1).max(500),
    })
    .safeParse({
      seatCapacity: value(formData, "seatCapacity"),
    });

  if (!parsed.success) {
    fail("/dashboard/foundry/more", "Seat capacity 1 se 500 ke darmiyan rakhein.");
  }

  const { supabase, workspace } = await requireFounderFoundry();
  const current = await supabase
    .from("organisation_modules")
    .select("config")
    .eq("workspace_id", workspace.id)
    .eq("module_key", "foundry")
    .maybeSingle();

  if (current.error || !current.data) {
    fail("/dashboard/foundry/more", "Foundry settings load nahi huin.");
  }

  const currentConfig =
    current.data.config &&
    typeof current.data.config === "object" &&
    !Array.isArray(current.data.config)
      ? (current.data.config as Record<string, unknown>)
      : {};
  const { data, error } = await supabase
    .from("organisation_modules")
    .update({
      config: {
        ...currentConfig,
        seat_capacity: parsed.data.seatCapacity,
      },
    })
    .eq("workspace_id", workspace.id)
    .eq("module_key", "foundry")
    .select("module_key")
    .maybeSingle();

  if (error || !data) {
    fail("/dashboard/foundry/more", "Seat capacity save nahi hui.");
  }

  succeed("/dashboard/foundry/more", "Foundry seat capacity update ho gayi.");
}

export async function recordFoundryDailyIssue(formData: FormData) {
  const parsed = z
    .object({
      studentId: idSchema,
      checkDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      issueCode: z.enum([
        "login",
        "account_link",
        "task",
        "submission",
        "feedback",
        "attendance",
        "device",
        "other",
      ]),
      issueNote: z.string().max(1000),
      resolved: z.boolean(),
    })
    .safeParse({
      studentId: value(formData, "studentId"),
      checkDate: value(formData, "checkDate"),
      issueCode: value(formData, "issueCode"),
      issueNote: value(formData, "issueNote"),
      resolved: value(formData, "resolved") === "on",
    });

  if (!parsed.success) {
    fail("/dashboard/foundry/operations", "Daily test note valid nahi hai.");
  }

  const { supabase, workspace } = await requireFounderFoundry();
  const { error } = await supabase.rpc("record_foundry_daily_issue", {
    target_workspace_id: workspace.id,
    target_student_id: parsed.data.studentId,
    target_date: parsed.data.checkDate,
    target_issue_code: parsed.data.issueCode,
    target_issue_note: parsed.data.issueNote,
    mark_resolved: parsed.data.resolved,
  });

  if (error) {
    fail("/dashboard/foundry/operations", "Daily test note save nahi hui.");
  }
  succeed(
    "/dashboard/foundry/operations",
    parsed.data.resolved
      ? "Student issue resolved mark ho gaya."
      : "Student issue daily test board par save ho gaya.",
  );
}

export async function updateFoundryDeliveryPreferences(formData: FormData) {
  const parsed = z
    .object({
      studentId: idSchema,
      emailEnabled: z.boolean(),
      whatsappEnabled: z.boolean(),
      whatsappNumber: z.string().max(40),
      consentNote: z.string().max(1000),
    })
    .refine(
      (data) =>
        !data.whatsappEnabled || Boolean(data.whatsappNumber.trim()),
      { message: "WhatsApp number required" },
    )
    .safeParse({
      studentId: value(formData, "studentId"),
      emailEnabled: value(formData, "emailEnabled") === "on",
      whatsappEnabled: value(formData, "whatsappEnabled") === "on",
      whatsappNumber: value(formData, "whatsappNumber"),
      consentNote: value(formData, "consentNote"),
    });

  if (!parsed.success) {
    fail(
      "/dashboard/foundry/operations",
      "Notification consent aur number dobara check karein.",
    );
  }

  const { supabase, workspace } = await requireFounderFoundry();
  const { error } = await supabase.rpc(
    "update_foundry_delivery_preferences",
    {
      target_workspace_id: workspace.id,
      target_student_id: parsed.data.studentId,
      enable_email: parsed.data.emailEnabled,
      enable_whatsapp: parsed.data.whatsappEnabled,
      target_whatsapp_number: parsed.data.whatsappNumber,
      target_consent_note: parsed.data.consentNote,
    },
  );

  if (error) {
    fail(
      "/dashboard/foundry/operations",
      "Notifications enable nahi huin. Email, number aur consent check karein.",
    );
  }
  succeed(
    "/dashboard/foundry/operations",
    "Notification consent aur channels update ho gaye.",
  );
}

export async function reviewFoundryStudioReadiness(formData: FormData) {
  const parsed = z
    .object({
      requestId: idSchema,
      studentId: idSchema,
      decision: z.enum(["changes_required", "approved", "revoked"]),
      skillQuality: z.coerce.number().int().min(1).max(5),
      deadline: z.coerce.number().int().min(1).max(5),
      communication: z.coerce.number().int().min(1).max(5),
      revisionAttitude: z.coerce.number().int().min(1).max(5),
      reliability: z.coerce.number().int().min(1).max(5),
      confidentiality: z.coerce.number().int().min(1).max(5),
      evidenceSummary: z.string().min(20).max(4000),
      decisionNote: z.string().max(2000),
    })
    .safeParse({
      requestId: value(formData, "requestId"),
      studentId: value(formData, "studentId"),
      decision: value(formData, "decision"),
      skillQuality: value(formData, "skillQuality"),
      deadline: value(formData, "deadline"),
      communication: value(formData, "communication"),
      revisionAttitude: value(formData, "revisionAttitude"),
      reliability: value(formData, "reliability"),
      confidentiality: value(formData, "confidentiality"),
      evidenceSummary: value(formData, "evidenceSummary"),
      decisionNote: value(formData, "decisionNote"),
    });

  const path = "/dashboard/foundry/progress?view=studio";
  if (!parsed.success) {
    fail(path, "Six standards aur evidence dobara check karein.");
  }

  const { supabase, workspace } = await requireFounderFoundry();
  const { error } = await supabase.rpc(
    "review_foundry_studio_readiness",
    {
      target_workspace_id: workspace.id,
      target_student_id: parsed.data.studentId,
      command_request_id: parsed.data.requestId,
      decision: parsed.data.decision,
      score_skill_quality: parsed.data.skillQuality,
      score_deadline: parsed.data.deadline,
      score_communication: parsed.data.communication,
      score_revision_attitude: parsed.data.revisionAttitude,
      score_reliability: parsed.data.reliability,
      score_confidentiality: parsed.data.confidentiality,
      target_evidence_summary: parsed.data.evidenceSummary,
      target_decision_note: parsed.data.decisionNote,
    },
  );

  if (error) {
    fail(
      path,
      parsed.data.decision === "approved"
        ? "Approval ke liye har standard 3+ aur average 4+ hona chahiye."
        : "Studio review save nahi hui.",
    );
  }
  succeed(
    path,
    parsed.data.decision === "approved"
      ? "Studio Ready Founder approval save ho gaya."
      : "Studio readiness review update ho gayi.",
  );
}

export async function issueFoundryCertificate(formData: FormData) {
  const parsed = z
    .object({
      requestId: idSchema,
      studentId: idSchema,
      certificateType: z.enum([
        "track_completion",
        "foundry_completion",
        "studio_readiness",
      ]),
      title: z.string().min(3).max(180),
    })
    .safeParse({
      requestId: value(formData, "requestId"),
      studentId: value(formData, "studentId"),
      certificateType: value(formData, "certificateType"),
      title: value(formData, "title"),
    });
  const path = "/dashboard/foundry/progress?view=studio";
  if (!parsed.success) {
    fail(path, "Certificate details dobara check karein.");
  }

  const { supabase, workspace } = await requireFounderFoundry();
  const { error } = await supabase.rpc("issue_foundry_certificate", {
    target_workspace_id: workspace.id,
    target_student_id: parsed.data.studentId,
    command_request_id: parsed.data.requestId,
    target_certificate_type: parsed.data.certificateType,
    target_title: parsed.data.title,
  });

  if (error) {
    fail(
      path,
      "Certificate issue nahi hua. Required progress aur accepted evidence check karein.",
    );
  }
  succeed(path, "Verified certificate issue ho gaya.");
}

export async function revokeFoundryCertificate(formData: FormData) {
  const parsed = z
    .object({
      certificateId: idSchema,
      reason: z.string().min(5).max(1000),
    })
    .safeParse({
      certificateId: value(formData, "certificateId"),
      reason: value(formData, "reason"),
    });
  const path = "/dashboard/foundry/progress?view=studio";
  if (!parsed.success) {
    fail(path, "Certificate aur revocation reason required hain.");
  }

  const { supabase, workspace } = await requireFounderFoundry();
  const { error } = await supabase.rpc("revoke_foundry_certificate", {
    target_workspace_id: workspace.id,
    target_certificate_id: parsed.data.certificateId,
    target_reason: parsed.data.reason,
  });
  if (error) {
    fail(path, "Active certificate revoke nahi hua.");
  }
  succeed(path, "Certificate revoke ho gaya; public verification updated hai.");
}

export async function queueFoundryFullSync() {
  const { supabase, workspace } = await requireFounderFoundry();
  const { data, error } = await supabase.rpc("queue_foundry_full_sync", {
    target_workspace_id: workspace.id,
  });
  if (error) {
    fail("/dashboard/foundry/operations", "Full sync queue nahi hui.");
  }
  succeed(
    "/dashboard/foundry/operations",
    `${data ?? 0} student sync events durable queue mein hain.`,
  );
}

export async function runFoundryWorkerNow() {
  await requireFounderFoundry();
  let result;
  try {
    result = await runFoundryWorker({
      outboxBatch: 100,
      deliveryBatch: 100,
    });
  } catch {
    fail(
      "/dashboard/foundry/operations",
      "Worker safely stop hua; queued work retry ke liye preserved hai.",
    );
  }
  if (!result.configured) {
    fail(
      "/dashboard/foundry/operations",
      "Server worker key abhi configured nahi hai.",
    );
  }
  succeed(
    "/dashboard/foundry/operations",
    `${result.deliveriesSucceeded} deliveries complete; ${result.deliveriesFailed} retry queue mein.`,
  );
}

export async function markCurrentStudentNotificationsRead() {
  const { supabase, studentId, workspace } = await requireStudentAccess();
  const { error } = await supabase
    .from("foundry_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("workspace_id", workspace.id)
    .eq("student_id", studentId)
    .is("read_at", null);

  if (error) {
    fail("/learn", "Updates read mark nahi huin. Dobara try karein.");
  }

  succeed("/learn", "Aap ke updates read mark ho gaye.");
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
