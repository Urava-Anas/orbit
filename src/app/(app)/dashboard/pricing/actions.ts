"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  PRICING_CURRENCIES,
  PRICING_TYPES,
  pricingPlanKey,
} from "@/lib/pricing";
import { requireWorkspace } from "@/lib/workspace";

const idSchema = z.string().uuid();
const optionalMoney = z.preprocess(
  (input) => (input === "" || input === null ? null : Number(input)),
  z.number().min(0).max(999999999999).nullable(),
);

const pricingPlanSchema = z.object({
  name: z.string().trim().min(2).max(120),
  serviceCategory: z.string().trim().min(2).max(80),
  summary: z.string().trim().max(2000),
  pricingType: z.enum(PRICING_TYPES),
  basePrice: optionalMoney,
  minPrice: optionalMoney,
  maxPrice: optionalMoney,
  currency: z.enum(PRICING_CURRENCIES),
  maxDiscountPercent: z.coerce.number().min(0).max(100),
  offerValidDays: z.coerce.number().int().min(1).max(365),
  includedFeatures: z.string().max(6000),
  installmentOptions: z.string().max(3000),
  addOns: z.string().max(4000),
  status: z.enum(["draft", "active"]),
});

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function lines(input: string) {
  return input.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function fail(message: string): never {
  redirect(`/dashboard/pricing?error=${encodeURIComponent(message)}`);
}

function succeed(message: string): never {
  revalidatePath("/dashboard/pricing");
  revalidatePath("/dashboard/leads");
  redirect(`/dashboard/pricing?notice=${encodeURIComponent(message)}`);
}

function parsePlan(formData: FormData) {
  const parsed = pricingPlanSchema.safeParse({
    name: value(formData, "name"),
    serviceCategory: value(formData, "serviceCategory"),
    summary: value(formData, "summary"),
    pricingType: value(formData, "pricingType"),
    basePrice: value(formData, "basePrice"),
    minPrice: value(formData, "minPrice"),
    maxPrice: value(formData, "maxPrice"),
    currency: value(formData, "currency"),
    maxDiscountPercent: value(formData, "maxDiscountPercent") || "0",
    offerValidDays: value(formData, "offerValidDays") || "14",
    includedFeatures: value(formData, "includedFeatures"),
    installmentOptions: value(formData, "installmentOptions"),
    addOns: value(formData, "addOns"),
    status: value(formData, "status") || "draft",
  });

  if (!parsed.success) fail("Check the pricing plan details and try again.");

  const data = parsed.data;
  const features = lines(data.includedFeatures);
  let basePrice = data.basePrice;
  let minPrice = data.minPrice;
  let maxPrice = data.maxPrice;
  let requiresApproval = formData.get("requiresApproval") === "on";

  if (data.pricingType === "custom") {
    basePrice = null;
    minPrice = null;
    maxPrice = null;
    requiresApproval = true;
  } else if (data.pricingType === "fixed") {
    if (basePrice === null) fail("A fixed plan needs a base price.");
    minPrice = basePrice;
    maxPrice = basePrice;
  } else if (
    minPrice === null ||
    basePrice === null ||
    maxPrice === null ||
    minPrice > basePrice ||
    basePrice > maxPrice
  ) {
    fail("A range plan needs minimum, recommended and maximum prices in order.");
  }

  if (data.status === "active" && features.length === 0) {
    fail("Add at least one included feature before activating a plan.");
  }

  return {
    name: data.name,
    service_category: data.serviceCategory,
    summary: data.summary,
    pricing_type: data.pricingType,
    base_price: basePrice,
    min_price: minPrice,
    max_price: maxPrice,
    currency: data.currency,
    max_discount_percent: data.maxDiscountPercent,
    offer_valid_days: data.offerValidDays,
    included_features: features,
    installment_options: lines(data.installmentOptions),
    add_ons: lines(data.addOns),
    requires_approval: requiresApproval,
    status: data.status,
  };
}

export async function createPricingPlan(formData: FormData) {
  const plan = parsePlan(formData);
  const planKey = pricingPlanKey(plan.name);
  if (planKey.length < 2) fail("Use a clearer pricing plan name.");

  const { supabase, user, workspace } = await requireWorkspace();
  const { error } = await supabase.from("pricing_plans").insert({
    workspace_id: workspace.id,
    plan_key: planKey,
    ...plan,
    created_by: user.id,
    updated_by: user.id,
  });

  if (error) {
    fail(error.code === "23505" ? "A pricing plan with that name already exists." : "Orbit could not save this pricing plan.");
  }
  succeed(plan.status === "active" ? "Pricing plan activated." : "Pricing plan saved as draft.");
}

export async function updatePricingPlan(formData: FormData) {
  const id = idSchema.safeParse(value(formData, "id"));
  const version = z.coerce.number().int().min(1).safeParse(value(formData, "version"));
  if (!id.success || !version.success) fail("Invalid pricing plan.");
  const plan = parsePlan(formData);

  const { supabase, user, workspace } = await requireWorkspace();
  const { data, error } = await supabase
    .from("pricing_plans")
    .update({ ...plan, updated_by: user.id, version: version.data + 1 })
    .eq("workspace_id", workspace.id)
    .eq("id", id.data)
    .eq("version", version.data)
    .select("id")
    .maybeSingle();

  if (error) fail("Orbit could not update this pricing plan.");
  if (!data) fail("This plan changed in another session. Refresh before editing it again.");
  succeed("Pricing plan updated. New proposals will use this version.");
}

export async function setPricingPlanStatus(formData: FormData) {
  const parsed = z.object({ id: idSchema, status: z.enum(["active", "archived"]) }).safeParse({
    id: value(formData, "id"),
    status: value(formData, "status"),
  });
  if (!parsed.success) fail("Invalid pricing plan status.");

  const { supabase, user, workspace } = await requireWorkspace();
  const { data: current, error: currentError } = await supabase
    .from("pricing_plans")
    .select("included_features,version")
    .eq("workspace_id", workspace.id)
    .eq("id", parsed.data.id)
    .single();
  if (currentError || !current) fail("Orbit could not verify this pricing plan.");

  if (parsed.data.status === "active") {
    if (!Array.isArray(current.included_features) || current.included_features.length === 0) {
      fail("Add at least one included feature before activating this plan.");
    }
  }

  const { data, error } = await supabase
    .from("pricing_plans")
    .update({ status: parsed.data.status, updated_by: user.id, version: Number(current.version) + 1 })
    .eq("workspace_id", workspace.id)
    .eq("id", parsed.data.id)
    .eq("version", current.version)
    .select("id")
    .maybeSingle();
  if (error) fail("Orbit could not change this pricing plan status.");
  if (!data) fail("This plan changed in another session. Refresh and try again.");
  succeed(parsed.data.status === "active" ? "Pricing plan activated." : "Pricing plan moved to archive.");
}
