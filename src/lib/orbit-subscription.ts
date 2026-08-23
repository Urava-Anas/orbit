import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrbitBillingInterval, OrbitPlanKey } from "@/lib/orbit-plans";

export type OrbitSubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "cancelled"
  | "comped";

export type OrbitWorkspaceSubscription = {
  workspace_id: string;
  plan_key: OrbitPlanKey;
  status: OrbitSubscriptionStatus;
  billing_interval: OrbitBillingInterval | "custom";
  trial_started_at: string | null;
  trial_ends_at: string | null;
  current_period_ends_at: string | null;
  provider: string | null;
  provider_customer_id: string | null;
  provider_subscription_id: string | null;
  price_snapshot: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type OrbitPlanChangeRequest = {
  id: string;
  workspace_id: string;
  requested_plan_key: OrbitPlanKey;
  billing_interval: OrbitBillingInterval | "custom";
  status: "pending" | "accepted" | "rejected" | "cancelled";
  created_at: string;
};

export async function getWorkspaceSubscription(
  supabase: SupabaseClient,
  workspaceId: string,
) {
  const { data, error } = await supabase
    .from("orbit_workspace_subscriptions")
    .select(
      "workspace_id, plan_key, status, billing_interval, trial_started_at, trial_ends_at, current_period_ends_at, provider, provider_customer_id, provider_subscription_id, price_snapshot, created_at, updated_at",
    )
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error) {
    throw new Error(`Orbit subscription could not be loaded: ${error.message}`);
  }

  return (data as OrbitWorkspaceSubscription | null) ?? null;
}

export async function getLatestPlanChangeRequest(
  supabase: SupabaseClient,
  workspaceId: string,
) {
  const { data, error } = await supabase
    .from("orbit_plan_change_requests")
    .select("id, workspace_id, requested_plan_key, billing_interval, status, created_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Orbit plan request could not be loaded: ${error.message}`);
  }

  return (data as OrbitPlanChangeRequest | null) ?? null;
}

export function trialDaysRemaining(subscription: OrbitWorkspaceSubscription | null) {
  if (!subscription?.trial_ends_at || subscription.status !== "trialing") return null;
  const remaining = new Date(subscription.trial_ends_at).getTime() - Date.now();
  return Math.max(0, Math.ceil(remaining / 86_400_000));
}

export function isTrialExpired(subscription: OrbitWorkspaceSubscription | null) {
  if (!subscription?.trial_ends_at || subscription.status !== "trialing") return false;
  return new Date(subscription.trial_ends_at).getTime() <= Date.now();
}
