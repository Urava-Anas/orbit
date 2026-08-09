"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireFounderFoundry } from "@/lib/foundry";

const idSchema = z.string().uuid();
const learningStates = [
  "introduced",
  "practising",
  "understood",
  "applied",
  "mastered",
] as const;

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function optional(input: string) {
  return input || null;
}

function notePath(studentId?: string, classId?: string) {
  const query = new URLSearchParams();
  if (studentId) query.set("studentId", studentId);
  if (classId) query.set("classId", classId);
  const suffix = query.toString();
  return `/dashboard/foundry/notes${suffix ? `?${suffix}` : ""}`;
}

function fail(path: string, message: string): never {
  const separator = path.includes("?") ? "&" : "?";
  redirect(`${path}${separator}error=${encodeURIComponent(message)}`);
}

function succeed(path: string, message: string): never {
  revalidatePath("/dashboard/foundry", "layout");
  revalidatePath("/dashboard/foundry/notes");
  revalidatePath("/dashboard/foundry/map");
  revalidatePath("/learn", "layout");
  revalidatePath("/learn/notes");
  revalidatePath("/learn/progress");
  const separator = path.includes("?") ? "&" : "?";
  redirect(`${path}${separator}notice=${encodeURIComponent(message)}`);
}

export async function saveClassLearningNote(formData: FormData) {
  const studentId = value(formData, "studentId");
  const classId = value(formData, "classId");
  const path = notePath(studentId, classId);

  const parsed = z
    .object({
      studentId: idSchema,
      classId: idSchema,
      lessonSummary: z.string().min(2).max(1200),
      keyConcepts: z.string().max(2000),
      studentNotes: z.string().min(2).max(4000),
      learningState: z.enum(learningStates),
      understandingLevel: z.preprocess(
        (input) => (input === "" ? null : input),
        z.coerce.number().int().min(1).max(5).nullable(),
      ),
      progressSummary: z.string().max(1200),
      supportNote: z.string().max(1200),
      nextStep: z.string().max(1200),
      resourceUrl: z.string().url().max(500).or(z.literal("")),
      impactTitle: z.string().max(180),
      impactStatement: z.string().max(1200),
      achievementTitle: z.string().max(180),
      achievementDescription: z.string().max(1200),
      evidenceRequirement: z.string().max(1600),
      xpReward: z.coerce.number().int().min(0).max(1000),
    })
    .safeParse({
      studentId,
      classId,
      lessonSummary: value(formData, "lessonSummary"),
      keyConcepts: value(formData, "keyConcepts"),
      studentNotes: value(formData, "studentNotes"),
      learningState: value(formData, "learningState"),
      understandingLevel: value(formData, "understandingLevel"),
      progressSummary: value(formData, "progressSummary"),
      supportNote: value(formData, "supportNote"),
      nextStep: value(formData, "nextStep"),
      resourceUrl: value(formData, "resourceUrl"),
      impactTitle: value(formData, "impactTitle"),
      impactStatement: value(formData, "impactStatement"),
      achievementTitle: value(formData, "achievementTitle"),
      achievementDescription: value(formData, "achievementDescription"),
      evidenceRequirement: value(formData, "evidenceRequirement"),
      xpReward: value(formData, "xpReward") || "0",
    });

  if (!parsed.success) {
    fail(path, "Class note, impact, achievement aur learning stage dobara check karein.");
  }

  const { supabase, user, workspace } = await requireFounderFoundry();
  const [studentResult, classResult] = await Promise.all([
    supabase
      .from("foundry_students")
      .select("id")
      .eq("workspace_id", workspace.id)
      .eq("id", parsed.data.studentId)
      .maybeSingle(),
    supabase
      .from("foundry_classes")
      .select("id, title, starts_at, status")
      .eq("workspace_id", workspace.id)
      .eq("id", parsed.data.classId)
      .maybeSingle(),
  ]);

  if (studentResult.error || !studentResult.data) fail(path, "Student record nahi mila.");
  if (classResult.error || !classResult.data) fail(path, "Class record nahi mila.");
  if (classResult.data.status !== "completed") {
    fail(path, "Learning history sirf completed class ke baad save hoti hai.");
  }

  const { error } = await supabase.from("foundry_class_learning_notes").upsert(
    {
      workspace_id: workspace.id,
      student_id: parsed.data.studentId,
      class_id: parsed.data.classId,
      class_title_snapshot: classResult.data.title,
      class_date: classResult.data.starts_at,
      lesson_summary: parsed.data.lessonSummary,
      key_concepts: optional(parsed.data.keyConcepts),
      student_notes: parsed.data.studentNotes,
      learning_state: parsed.data.learningState,
      understanding_level: parsed.data.understandingLevel,
      progress_summary: optional(parsed.data.progressSummary),
      support_note: optional(parsed.data.supportNote),
      next_step: optional(parsed.data.nextStep),
      resource_url: optional(parsed.data.resourceUrl),
      impact_title: optional(parsed.data.impactTitle),
      impact_statement: optional(parsed.data.impactStatement),
      achievement_title: optional(parsed.data.achievementTitle),
      achievement_description: optional(parsed.data.achievementDescription),
      evidence_requirement: optional(parsed.data.evidenceRequirement),
      xp_reward: parsed.data.xpReward,
      created_by: user.id,
    },
    { onConflict: "workspace_id,student_id,class_id" },
  );

  if (error) fail(path, "Class notes save nahi huay. Dobara try karein.");

  succeed(path, "Class record, impact aur achievement map update ho gaya.");
}
