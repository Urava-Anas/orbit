import "server-only";

import {
  ORBIT_PLAN_BY_KEY,
  type OrbitBillingInterval,
  type OrbitPlanKey,
} from "@/lib/orbit-plans";
import { createClient } from "@/lib/supabase/server";

export type WorkspaceSubscriptionStatus =
  | "trialing"
  | "active"
  | "comped"
  | "past_due"
  | "cancelled";

export type WorkspaceSubscriptionInterval = OrbitBillingInterval | "custom";

export type WorkspaceSubscriptionRow = {
  workspace_id: string;
  plan_key: OrbitPlanKey;
  status: WorkspaceSubscriptionStatus;
  billing_interval: WorkspaceSubscriptionInterval;
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

export type PlanChangeRequestRow = {
  id: string;
  workspace_id: string;
  requested_plan_key: OrbitPlanKey;
  billing_interval: WorkspaceSubscriptionInterval;
  requested_by: string;
  status: "pending" | "accepted" | "rejected" | "cancelled";
  note: string | null;
  created_at: string;
  resolved_at: string | null;
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
  isComped: boolean;
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
  // Migration-safe fallback: never lock a legacy workspace because a billing
  // row is temporarily unavailable during a rolling deployment.
  if (!row) {
    return {
      row: null,
      plan: ORBIT_PLAN_BY_KEY.business,
      effectiveStatus: "comped",
      trialDaysRemaining: null,
      trialEndsAt: null,
      canWrite: true,
      isTrial: false,
      isComped: true,
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
          Math.ceil(
            (trialEndsAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
          ),
        )
      : null;

  return {
    row,
    plan: ORBIT_PLAN_BY_KEY[row.plan_key] ?? ORBIT_PLAN_BY_KEY.business,
    effectiveStatus,
    trialDaysRemaining,
    trialEndsAt,
    canWrite: ["active", "comped", "trialing"].includes(effectiveStatus),
    isTrial: effectiveStatus === "trialing",
    isComped: effectiveStatus === "comped",
  };
}

export async function readWorkspaceSubscription(
  supabase: SupabaseServerClient,
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
    console.error("Orbit subscription lookup failed", {
      workspaceId,
      code: error.code,
      message: error.message,
    });
    return deriveSubscriptionState(null);
  }

  return deriveSubscriptionState((data as WorkspaceSubscriptionRow | null) ?? null);
}

export async function readLatestPlanChangeRequest(
  supabase: SupabaseServerClient,
  workspaceId: string,
) {
  const { data, error } = await supabase
    .from("orbit_plan_change_requests")
    .select(
      "id, workspace_id, requested_plan_key, billing_interval, requested_by, status, note, created_at, resolved_at",
    )
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Orbit plan request lookup failed", {
      workspaceId,
      code: error.code,
      message: error.message,
    });
    return null;
  }

  return (data as PlanChangeRequestRow | null) ?? null;
}
