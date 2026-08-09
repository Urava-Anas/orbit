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
  redirect(`/dashboard/foundry/notes?error=${encodeURIComponent(message)}`);
}

export async function addLevelResource(formData: FormData) {
  const parsed = z
    .object({
      requestId: z.string().uuid(),
      studentId: z.string().uuid().or(z.literal("")),
      department: z.enum(departments).or(z.literal("")),
      levelNumber: z.coerce.number().int().min(1).max(100),
      title: z.string().min(2).max(180),
      resourceUrl: z.string().url().max(500),
      resourceKind: z.enum(["pdf", "link", "video", "file"]),
    })
    .safeParse({
      requestId: value(formData, "requestId"),
      studentId: value(formData, "studentId"),
      department: value(formData, "department"),
      levelNumber: value(formData, "levelNumber") || "1",
      title: value(formData, "title"),
      resourceUrl: value(formData, "resourceUrl"),
      resourceKind: value(formData, "resourceKind") || "pdf",
    });

  if (!parsed.success) fail("PDF/resource details aur level dobara check karein.");

  const { supabase, user, workspace } = await requireFounderFoundry();

  if (parsed.data.studentId) {
    const { data: student, error: studentError } = await supabase
      .from("foundry_students")
      .select("id, department")
      .eq("workspace_id", workspace.id)
      .eq("id", parsed.data.studentId)
      .maybeSingle();
    if (studentError || !student) fail("Selected student nahi mila.");
  }

  const { error } = await supabase.from("foundry_level_resources").insert({
    workspace_id: workspace.id,
    request_id: parsed.data.requestId,
    student_id: parsed.data.studentId || null,
    department: parsed.data.department || null,
    level_number: parsed.data.levelNumber,
    title: parsed.data.title,
    resource_url: parsed.data.resourceUrl,
    resource_kind: parsed.data.resourceKind,
    status: "published",
    created_by: user.id,
  });

  if (error) fail("Level resource add nahi hua. Duplicate submit ya access dobara check karein.");

  revalidatePath("/dashboard/foundry/notes");
  revalidatePath("/dashboard/foundry/map");
  revalidatePath("/learn/notes");
  revalidatePath("/learn/progress");
  redirect(
    `/dashboard/foundry/notes?notice=${encodeURIComponent(
      `Level ${parsed.data.levelNumber} resource map se link ho gaya.`,
    )}`,
  );
}

export async function archiveLevelResource(formData: FormData) {
  const resourceId = z.string().uuid().safeParse(value(formData, "resourceId"));
  if (!resourceId.success) fail("Resource dobara select karein.");

  const { supabase, workspace } = await requireFounderFoundry();
  const { data, error } = await supabase
    .from("foundry_level_resources")
    .update({ status: "archived" })
    .eq("workspace_id", workspace.id)
    .eq("id", resourceId.data)
    .select("id")
    .maybeSingle();

  if (error || !data) fail("Resource archive nahi hua.");
  revalidatePath("/dashboard/foundry/notes");
  revalidatePath("/dashboard/foundry/map");
  revalidatePath("/learn/progress");
  redirect(`/dashboard/foundry/notes?notice=${encodeURIComponent("Resource archived.")}`);
}
