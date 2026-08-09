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

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function fail(message: string): never {
  redirect(`/dashboard/foundry/classes?error=${encodeURIComponent(message)}`);
}

function pakistanDateTime(input: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input)) return null;
  const parsed = new Date(`${input}:00+05:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function createJourneyClass(formData: FormData) {
  const parsed = z
    .object({
      requestId: z.string().uuid(),
      title: z.string().min(2).max(180),
      instructorName: z.string().min(2).max(120),
      department: z.enum(departments).or(z.literal("")),
      levelNumber: z.coerce.number().int().min(1).max(100),
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
      levelNumber: value(formData, "levelNumber") || "1",
      startsAt: value(formData, "startsAt"),
      endsAt: value(formData, "endsAt"),
      mode: value(formData, "mode"),
      joinUrl: value(formData, "joinUrl"),
      notes: value(formData, "notes"),
    });

  if (!parsed.success) fail("Class details aur level dobara check karein.");

  const startsAt = pakistanDateTime(parsed.data.startsAt);
  const endsAt = pakistanDateTime(parsed.data.endsAt);
  if (!startsAt || !endsAt || endsAt <= startsAt) {
    fail("Class ka start aur end time valid hona chahiye.");
  }

  const { supabase, workspace } = await requireFounderFoundry();
  const { error } = await supabase.rpc("create_foundry_class_journey_command", {
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
    class_level_number: parsed.data.levelNumber,
  });

  if (error) fail("Class schedule save nahi ho saki.");

  revalidatePath("/dashboard/foundry/classes");
  revalidatePath("/dashboard/foundry/map");
  revalidatePath("/learn/progress");
  redirect(
    `/dashboard/foundry/classes?notice=${encodeURIComponent(
      `Level ${parsed.data.levelNumber} class schedule ho gayi.`,
    )}`,
  );
}
