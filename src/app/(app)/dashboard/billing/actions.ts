"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  ORBIT_PLAN_BY_KEY,
  type OrbitBillingInterval,
  type OrbitPlanKey,
} from "@/lib/orbit-plans";
import { requireWorkspace } from "@/lib/workspace";

const planSchema = z.enum(["founder", "business", "autopilot", "enterprise"]);
const intervalSchema = z.enum(["monthly", "yearly", "custom"]);

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function requestOrbitPlan(formData: FormData) {
  const parsed = z
    .object({
      planKey: planSchema,
      billingInterval: intervalSchema,
    })
    .safeParse({
      planKey: value(formData, "plan_key"),
      billingInterval: value(formData, "billing_interval"),
    });

  if (!parsed.success) {
    redirect("/dashboard/billing?error=Choose%20a%20valid%20Orbit%20plan.");
  }

  const { supabase, user, workspace, role } = await requireWorkspace();
  if (!['owner', 'admin'].includes(role)) {
    redirect("/dashboard/billing?error=Only%20workspace%20administrators%20can%20change%20plans.");
  }

  const planKey = parsed.data.planKey as OrbitPlanKey;
  const plan = ORBIT_PLAN_BY_KEY[planKey];
  const billingInterval =
    planKey === "enterprise"
      ? "custom"
      : (parsed.data.billingInterval as OrbitBillingInterval);

  const { error } = await supabase.from("orbit_plan_change_requests").insert({
    workspace_id: workspace.id,
    requested_plan_key: planKey,
    billing_interval: billingInterval,
    requested_by: user.id,
    status: "pending",
    note:
      "Plan intent recorded before online checkout activation. Resolve through the future billing provider flow.",
  });

  if (error) {
    console.error("Orbit plan request failed", {
      workspaceId: workspace.id,
      planKey,
      code: error.code,
      message: error.message,
    });
    redirect("/dashboard/billing?error=Orbit%20could%20not%20save%20that%20plan%20choice.");
  }

  revalidatePath("/dashboard/billing");
  redirect(
    `/dashboard/billing?notice=${encodeURIComponent(
      `${plan.name} selected. Checkout will attach to this request when online payments are enabled.`,
    )}`,
  );
}
