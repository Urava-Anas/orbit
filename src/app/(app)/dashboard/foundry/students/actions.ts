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

const levels = [
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
] as const;

const deviceStates = [
  "own_laptop",
  "shared_laptop",
  "mobile_only",
  "no_reliable_device",
  "unknown",
] as const;

const languageStates = ["roman_urdu", "urdu", "english", "bilingual"] as const;

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function optional(input: string) {
  return input || null;
}

function fail(message: string): never {
  redirect(`/dashboard/foundry/students?mode=add&error=${encodeURIComponent(message)}`);
}

function revalidateStudentSurfaces() {
  revalidatePath("/dashboard/foundry/students");
  revalidatePath("/dashboard/foundry/map");
  revalidatePath("/dashboard/foundry/tasks");
  revalidatePath("/dashboard/foundry/notes");
  revalidatePath("/dashboard/foundry/studio");
  revalidatePath("/dashboard/foundry", "layout");
}

export async function createFoundryStudent(formData: FormData) {
  const parsed = z
    .object({
      fullName: z.string().min(2).max(120),
      email: z.string().trim().email().max(254).or(z.literal("")),
      phone: z.string().max(40),
      department: z.enum(departments),
      level: z.enum(levels),
      lifecycleStatus: z.enum(lifecycleStates),
      deviceAccess: z.enum(deviceStates),
      preferredLanguage: z.enum(languageStates),
      mainGoal: z.string().max(1000),
      nextAction: z.string().max(500),
    })
    .safeParse({
      fullName: value(formData, "fullName"),
      email: value(formData, "email").toLowerCase(),
      phone: value(formData, "phone"),
      department: value(formData, "department"),
      level: value(formData, "level"),
      lifecycleStatus: value(formData, "lifecycleStatus"),
      deviceAccess: value(formData, "deviceAccess"),
      preferredLanguage: value(formData, "preferredLanguage"),
      mainGoal: value(formData, "mainGoal"),
      nextAction: value(formData, "nextAction"),
    });

  if (!parsed.success) {
    fail("Student details dobara check karein. Name required hai; email ho to valid hona chahiye.");
  }

  const { supabase, user, workspace } = await requireFounderFoundry();

  if (parsed.data.email) {
    const { data: duplicate } = await supabase
      .from("foundry_students")
      .select("id, foundry_id")
      .eq("workspace_id", workspace.id)
      .ilike("email", parsed.data.email)
      .maybeSingle();

    if (duplicate) {
      fail(`Ye email pehle ${duplicate.foundry_id} se linked hai.`);
    }
  }

  const { data: existingIds, error: idError } = await supabase
    .from("foundry_students")
    .select("foundry_id")
    .eq("workspace_id", workspace.id);

  if (idError) fail("Next Foundry ID calculate nahi hua.");

  const usedNumbers = (existingIds ?? [])
    .map((record) => /^UFS-(\d+)$/.exec(record.foundry_id)?.[1])
    .filter(Boolean)
    .map(Number);
  let nextNumber = Math.max(0, ...usedNumbers) + 1;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const foundryId = `UFS-${nextNumber}`;
    const { data, error } = await supabase
      .from("foundry_students")
      .insert({
        workspace_id: workspace.id,
        foundry_id: foundryId,
        external_source: "manual",
        full_name: parsed.data.fullName,
        email: optional(parsed.data.email),
        phone: optional(parsed.data.phone),
        department: parsed.data.department,
        level: parsed.data.level,
        lifecycle_status: parsed.data.lifecycleStatus,
        health_status: "yellow",
        progress_percent: 0,
        device_access: parsed.data.deviceAccess,
        preferred_language: parsed.data.preferredLanguage,
        main_goal: optional(parsed.data.mainGoal),
        next_action: optional(parsed.data.nextAction),
        studio_eligible: false,
        created_by: user.id,
      })
      .select("id, foundry_id")
      .maybeSingle();

    if (!error && data) {
      revalidateStudentSurfaces();
      redirect(
        `/dashboard/foundry/students/${data.id}?notice=${encodeURIComponent(
          `${data.foundry_id} created. Complete the profile or open the Journey Map next.`,
        )}`,
      );
    }

    if (error?.code !== "23505") {
      fail("Student create nahi hua. Access ya field rules dobara check karein.");
    }
    nextNumber += 1;
  }

  fail("Foundry ID collision hua. Dobara try karein.");
}

export async function removeFoundryStudent(formData: FormData) {
  const parsed = z
    .object({
      studentId: z.string().uuid(),
      foundryId: z.string().regex(/^UFS-[A-Z0-9-]+$/),
    })
    .safeParse({
      studentId: value(formData, "studentId"),
      foundryId: value(formData, "foundryId"),
    });

  if (!parsed.success) {
    redirect(`/dashboard/foundry/students?error=${encodeURIComponent("Student remove request invalid hai.")}`);
  }

  const { supabase, workspace } = await requireFounderFoundry();
  const { data, error } = await supabase
    .from("foundry_students")
    .update({
      lifecycle_status: "inactive",
      studio_eligible: false,
    })
    .eq("workspace_id", workspace.id)
    .eq("id", parsed.data.studentId)
    .eq("foundry_id", parsed.data.foundryId)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    redirect(`/dashboard/foundry/students?error=${encodeURIComponent("Student active roster se remove nahi hua.")}`);
  }

  revalidateStudentSurfaces();
  redirect(
    `/dashboard/foundry/students?notice=${encodeURIComponent(
      `${parsed.data.foundryId} active Foundry se removed. History preserve ki gayi hai.`,
    )}`,
  );
}
