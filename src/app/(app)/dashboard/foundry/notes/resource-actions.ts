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

const resourceKinds = ["pdf", "link", "video", "file", "tool", "note"] as const;

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function fail(message: string): never {
  redirect(`/dashboard/foundry/notes?error=${encodeURIComponent(message)}`);
}

function revalidateNoteSurfaces() {
  revalidatePath("/dashboard/foundry/notes");
  revalidatePath("/dashboard/foundry/map");
  revalidatePath("/learn/notes");
  revalidatePath("/learn/progress");
}

export async function addLevelResource(formData: FormData) {
  const parsed = z
    .object({
      requestId: z.string().uuid(),
      studentId: z.string().uuid().or(z.literal("")),
      department: z.enum(departments).or(z.literal("")),
      levelNumber: z.coerce.number().int().min(1).max(100),
      title: z.string().min(2).max(180),
      resourceUrl: z.string().url().max(500).or(z.literal("")),
      resourceContent: z.string().max(8000),
      resourceKind: z.enum(resourceKinds),
    })
    .superRefine((data, ctx) => {
      if (data.resourceKind === "note") {
        if (data.resourceContent.trim().length < 2) {
          ctx.addIssue({
            code: "custom",
            path: ["resourceContent"],
            message: "A note needs written content.",
          });
        }
      } else if (!data.resourceUrl) {
        ctx.addIssue({
          code: "custom",
          path: ["resourceUrl"],
          message: "This resource type needs a URL.",
        });
      }
    })
    .safeParse({
      requestId: value(formData, "requestId"),
      studentId: value(formData, "studentId"),
      department: value(formData, "department"),
      levelNumber: value(formData, "levelNumber") || "1",
      title: value(formData, "title"),
      resourceUrl: value(formData, "resourceUrl"),
      resourceContent: value(formData, "resourceContent"),
      resourceKind: value(formData, "resourceKind") || "pdf",
    });

  if (!parsed.success) {
    fail("Resource details dobara check karein. Notes need text; tools/videos/PDFs need a valid URL.");
  }

  const { supabase, user, workspace } = await requireFounderFoundry();

  if (parsed.data.studentId) {
    const { data: student, error: studentError } = await supabase
      .from("foundry_students")
      .select("id")
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
    resource_url: parsed.data.resourceUrl || null,
    content: parsed.data.resourceContent || null,
    resource_kind: parsed.data.resourceKind,
    status: "published",
    created_by: user.id,
  });

  if (error) {
    fail("Resource add nahi hua. Duplicate submit ya access dobara check karein.");
  }

  revalidateNoteSurfaces();
  redirect(
    `/dashboard/foundry/notes?notice=${encodeURIComponent(
      `Level ${parsed.data.levelNumber} ${parsed.data.resourceKind} Journey Map se link ho gaya.`,
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
  revalidateNoteSurfaces();
  redirect(`/dashboard/foundry/notes?notice=${encodeURIComponent("Resource archived. Student map updated.")}`);
}
