"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireWorkspace } from "@/lib/workspace";

const idSchema = z.string().uuid();
const assetTypes = ["poster", "offer", "service_explainer", "case_study", "testimonial", "before_after", "followup", "seasonal", "authority", "proof"] as const;
const goals = ["start_conversation", "build_trust", "explain_offer", "request_decision", "follow_up", "reactivate", "broadcast"] as const;
const channels = ["email", "whatsapp", "instagram", "facebook", "linkedin", "website"] as const;

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function lines(input: string) {
  return input.split(/[\r\n,]+/).map((item) => item.trim()).filter(Boolean).slice(0, 50);
}

function fail(message: string): never {
  redirect(`/dashboard/content?error=${encodeURIComponent(message)}`);
}

function succeed(message: string): never {
  revalidatePath("/dashboard/content");
  revalidatePath("/dashboard/leads");
  redirect(`/dashboard/content?notice=${encodeURIComponent(message)}`);
}

const assetSchema = z.object({
  title: z.string().min(2).max(180),
  assetType: z.enum(assetTypes),
  assetUrl: z.string().url().max(1000).or(z.literal("")),
  thumbnailUrl: z.string().url().max(1000).or(z.literal("")),
  body: z.string().max(8000),
  goal: z.enum(goals),
  language: z.string().min(2).max(20),
  cta: z.string().max(500),
  proofId: idSchema.or(z.literal("")),
  pricingPlanId: idSchema.or(z.literal("")),
  status: z.enum(["draft", "approved"]),
});

export async function createCommercialContentAsset(formData: FormData) {
  const parsed = assetSchema.safeParse({
    title: value(formData, "title"),
    assetType: value(formData, "assetType"),
    assetUrl: value(formData, "assetUrl"),
    thumbnailUrl: value(formData, "thumbnailUrl"),
    body: value(formData, "body"),
    goal: value(formData, "goal"),
    language: value(formData, "language") || "en",
    cta: value(formData, "cta"),
    proofId: value(formData, "proofId"),
    pricingPlanId: value(formData, "pricingPlanId"),
    status: value(formData, "status") || "draft",
  });
  if (!parsed.success) fail("Check the content asset details and try again.");
  if (!parsed.data.assetUrl && !parsed.data.body) fail("Add either a public asset URL or reusable content body.");

  const selectedChannels = channels.filter((channel) => formData.getAll("channels").includes(channel));
  if (!selectedChannels.length) fail("Choose at least one channel for this asset.");

  const { supabase, user, workspace } = await requireWorkspace();

  if (parsed.data.proofId) {
    const proof = await supabase
      .from("proofs")
      .select("id,status")
      .eq("workspace_id", workspace.id)
      .eq("id", parsed.data.proofId)
      .eq("status", "approved")
      .maybeSingle();
    if (proof.error || !proof.data) fail("Only approved proof may be linked to a commercial asset.");
  }

  if (parsed.data.pricingPlanId) {
    const plan = await supabase
      .from("pricing_plans")
      .select("id,status")
      .eq("workspace_id", workspace.id)
      .eq("id", parsed.data.pricingPlanId)
      .eq("status", "active")
      .maybeSingle();
    if (plan.error || !plan.data) fail("Only an active pricing plan may be linked to an approved asset.");
  }

  const { error } = await supabase.from("commercial_content_assets").insert({
    workspace_id: workspace.id,
    title: parsed.data.title,
    asset_type: parsed.data.assetType,
    asset_url: parsed.data.assetUrl || null,
    thumbnail_url: parsed.data.thumbnailUrl || null,
    body: parsed.data.body,
    audience_tags: lines(value(formData, "audienceTags")),
    industry_tags: lines(value(formData, "industryTags")),
    service_categories: lines(value(formData, "serviceCategories")),
    lead_stages: lines(value(formData, "leadStages")),
    channels: selectedChannels,
    goal: parsed.data.goal,
    language: parsed.data.language,
    cta: parsed.data.cta,
    proof_id: parsed.data.proofId || null,
    linked_pricing_plan_id: parsed.data.pricingPlanId || null,
    status: parsed.data.status,
    created_by: user.id,
    updated_by: user.id,
  });
  if (error) fail("Orbit could not save this content asset.");
  succeed(parsed.data.status === "approved" ? "Content asset approved for recommendations." : "Content asset saved as draft.");
}

export async function setCommercialContentAssetStatus(formData: FormData) {
  const parsed = z.object({
    id: idSchema,
    status: z.enum(["approved", "expired", "archived"]),
  }).safeParse({ id: value(formData, "id"), status: value(formData, "status") });
  if (!parsed.success) fail("Invalid content asset status.");

  const { supabase, user, workspace } = await requireWorkspace();
  const { data, error } = await supabase
    .from("commercial_content_assets")
    .update({ status: parsed.data.status, updated_by: user.id })
    .eq("workspace_id", workspace.id)
    .eq("id", parsed.data.id)
    .select("id")
    .maybeSingle();
  if (error || !data) fail("Orbit could not change this content asset.");
  succeed(parsed.data.status === "approved" ? "Asset approved for Orbit recommendations." : "Asset removed from active recommendations.");
}
