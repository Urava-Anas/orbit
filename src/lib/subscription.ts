import "server-only";

import { ORBIT_PLAN_BY_KEY, type OrbitBillingInterval, type OrbitPlanKey } from "@/lib/orbit-plans";
import { createClient } from "@/lib/supabase/server";

export type WorkspaceSubscriptionStatus =
  | "trialing"
  | "active"
  | "managed"
  | "past_due"
  | "canceled";

export type WorkspaceSubscriptionRow = {
  workspace_id: string;
  plan_key: OrbitPlanKey;
  status: WorkspaceSubscriptionStatus;
  billing_interval: OrbitBillingInterval;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  current_period_started_at: string | null;
  current_period_ends_at: string | null;
  cancel_at_period_end: boolean;
  provider: string | null;
  provider_customer_id: string | null;
  provider_subscription_id: string | null;
  provider_price_id: string | null;
  requested_plan_key: OrbitPlanKey | null;
  requested_billing_interval: OrbitBillingInterval | null;
  upgrade_requested_at: string | null;
  managed_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type EffectiveSubscriptionStatus = WorkspaceSubscriptionStatus | "expired";

export type WorkspaceSubscriptionState = {
  row: WorkspaceSubscriptionRow | null;
  plan: (typeof ORBIT_PLAN_BY_KEY)[OrbitPlanKey];
  effectiveStatus: EffectiveSubscriptionStatus;
  trialDaysRemaining: number | null;
  trialEndsAt: Date | null;
  canWrite: boolean;
  isTrial: boolean;
  isManaged: boolean;
};

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

function parseDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function deriveSubscriptionState(
  row: WorkspaceSubscriptionRow | null,
  now = new Date(),
): WorkspaceSubscriptionState {
  // Safety fallback for legacy or partially migrated workspaces: do not lock a
  // customer out just because a subscription row is temporarily unavailable.
  if (!row) {
    return {
      row: null,
      plan: ORBIT_PLAN_BY_KEY.business,
      effectiveStatus: "managed",
      trialDaysRemaining: null,
      trialEndsAt: null,
      canWrite: true,
      isTrial: false,
      isManaged: true,
    };
  }

  const trialEndsAt = parseDate(row.trial_ends_at);
  const expiredTrial =
    row.status === "trialing" &&
    (!trialEndsAt || trialEndsAt.getTime() <= now.getTime());
  const effectiveStatus: EffectiveSubscriptionStatus = expiredTrial
    ? "expired"
    : row.status;
  const trialDaysRemaining =
    row.status === "trialing" && trialEndsAt
      ? Math.max(
          0,
          Math.ceil((trialEndsAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)),
        )
      : null;

  return {
    row,
    plan: ORBIT_PLAN_BY_KEY[row.plan_key] ?? ORBIT_PLAN_BY_KEY.business,
    effectiveStatus,
    trialDaysRemaining,
    trialEndsAt,
    canWrite: ["active", "managed", "trialing"].includes(effectiveStatus),
    isTrial: effectiveStatus === "trialing",
    isManaged: effectiveStatus === "managed",
  };
}

export async function readWorkspaceSubscription(
  supabase: SupabaseServerClient,
  workspaceId: string,
) {
  const { data, error } = await supabase
    .from("workspace_subscriptions")
    .select(
      "workspace_id, plan_key, status, billing_interval, trial_started_at, trial_ends_at, current_period_started_at, current_period_ends_at, cancel_at_period_end, provider, provider_customer_id, provider_subscription_id, provider_price_id, requested_plan_key, requested_billing_interval, upgrade_requested_at, managed_reason, created_at, updated_at",
    )
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error) {
    // During a rolling deploy the app may briefly arrive before the migration.
    // Keep the legacy workspace usable, but surface the absence in server logs.
    console.error("Orbit subscription lookup failed", {
      workspaceId,
      code: error.code,
      message: error.message,
    });
    return deriveSubscriptionState(null);
  }

  return deriveSubscriptionState((data as WorkspaceSubscriptionRow | null) ?? null);
}
