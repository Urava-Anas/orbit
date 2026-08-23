import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, CalendarClock, CreditCard, ShieldCheck, Sparkles } from "lucide-react";
import { Notice } from "@/components/Notice";
import { ORBIT_TRIAL_DAYS } from "@/lib/orbit-plans";
import {
  readLatestPlanChangeRequest,
  readWorkspaceSubscription,
} from "@/lib/subscription";
import { requireWorkspace } from "@/lib/workspace";
import { BillingPlanChooser } from "./BillingPlanChooser";
import styles from "./billing.module.css";

export const metadata: Metadata = {
  title: "Plan & Billing · Orbit",
};

type BillingPageProps = {
  searchParams: Promise<{
    notice?: string;
    error?: string;
  }>;
};

function formatDate(date: Date | null) {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function statusLabel(status: string) {
  switch (status) {
    case "trialing":
      return "Trial active";
    case "active":
      return "Active";
    case "comped":
      return "Managed workspace";
    case "past_due":
      return "Payment attention";
    case "cancelled":
      return "Cancelled";
    case "expired":
      return "Trial ended";
    default:
      return status;
  }
}

export default async function BillingPage({ searchParams }: BillingPageProps) {
  const params = await searchParams;
  const { supabase, workspace } = await requireWorkspace();
  const subscription = await readWorkspaceSubscription(supabase, workspace.id);
  const latestRequest = await readLatestPlanChangeRequest(supabase, workspace.id);
  const pendingRequest = latestRequest?.status === "pending" ? latestRequest : null;

  return (
    <div className={`page ${styles.page}`}>
      <div className={styles.pageHeader}>
        <div>
          <span className="section-kicker">Orbit subscription</span>
          <h1>Plan & billing</h1>
          <p>
            Manage the operating level for {workspace.name}. Trial, plan choice and
            future checkout all resolve from this workspace-level subscription.
          </p>
        </div>
        <Link href="/pricing" className={styles.publicPricingLink}>
          View public pricing <ArrowUpRight size={15} aria-hidden="true" />
        </Link>
      </div>

      <Notice notice={params.notice} error={params.error} />

      {subscription.isTrial ? (
        <section className={styles.trialBanner}>
          <div className={styles.bannerIcon}><Sparkles size={19} aria-hidden="true" /></div>
          <div>
            <span>Business trial</span>
            <strong>{subscription.trialDaysRemaining} days remaining</strong>
            <p>
              Your {ORBIT_TRIAL_DAYS}-day trial uses the Business operating level so
              Orbit can prove itself with real workflows before you choose a plan.
            </p>
          </div>
          <div className={styles.bannerMeta}>
            <small>Trial ends</small>
            <b>{formatDate(subscription.trialEndsAt)}</b>
          </div>
        </section>
      ) : null}

      {subscription.effectiveStatus === "expired" ? (
        <section className={`${styles.trialBanner} ${styles.expiredBanner}`}>
          <div className={styles.bannerIcon}><CalendarClock size={19} aria-hidden="true" /></div>
          <div>
            <span>Trial complete</span>
            <strong>Choose the plan that keeps Orbit running.</strong>
            <p>Your workspace data is preserved. Select a plan below to prepare activation.</p>
          </div>
        </section>
      ) : null}

      <section className={styles.summaryGrid}>
        <article className={styles.summaryCard}>
          <div className={styles.summaryIcon}><ShieldCheck size={18} aria-hidden="true" /></div>
          <span>Current plan</span>
          <strong>{subscription.plan.name}</strong>
          <div className={styles.statusLine}>
            <i className={subscription.canWrite ? styles.liveDot : styles.attentionDot} />
            {statusLabel(subscription.effectiveStatus)}
          </div>
        </article>

        <article className={styles.summaryCard}>
          <div className={styles.summaryIcon}><CreditCard size={18} aria-hidden="true" /></div>
          <span>Billing connection</span>
          <strong>{subscription.row?.provider ? subscription.row.provider : "Not connected yet"}</strong>
          <p>
            Provider IDs already have a dedicated place in Orbit. Checkout can be
            connected later without changing the plan model.
          </p>
        </article>

        <article className={styles.summaryCard}>
          <div className={styles.summaryIcon}><CalendarClock size={18} aria-hidden="true" /></div>
          <span>Plan selection</span>
          <strong>{pendingRequest ? "Pending activation" : "No pending change"}</strong>
          <p>
            {pendingRequest
              ? `${pendingRequest.requested_plan_key} · ${pendingRequest.billing_interval}`
              : "Your current workspace plan remains the source of truth."}
          </p>
        </article>
      </section>

      <BillingPlanChooser
        currentPlanKey={subscription.plan.key}
        currentStatus={subscription.effectiveStatus}
        pendingPlanKey={pendingRequest?.requested_plan_key ?? null}
      />

      <section className={styles.paymentBoundary}>
        <div>
          <span className="section-kicker">Payment boundary</span>
          <h2>Pricing is live. Checkout stays replaceable.</h2>
        </div>
        <p>
          Orbit stores the workspace plan, billing interval, trial dates, provider
          customer/subscription references and an immutable plan-choice trail separately.
          When online payments are added, the provider only activates these records—it
          does not become the pricing source of truth.
        </p>
      </section>
    </div>
  );
}
