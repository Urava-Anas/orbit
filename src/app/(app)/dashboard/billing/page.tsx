import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowUpRight,
  CalendarClock,
  CreditCard,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Notice } from "@/components/Notice";
import { PageHeader } from "@/components/PageHeader";
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
      <PageHeader
        kicker="Orbit subscription"
        title="Plan & billing"
        description={`See the current operating level for ${workspace.name}, trial status and any pending plan change in one place.`}
        action={
          <Link href="/pricing" className="button">
            Compare plans <ArrowUpRight size={15} aria-hidden="true" />
          </Link>
        }
      />

      <Notice notice={params.notice} error={params.error} />

      {subscription.isTrial ? (
        <section className={styles.trialBanner}>
          <div className={styles.bannerIcon}>
            <Sparkles size={19} aria-hidden="true" />
          </div>
          <div>
            <span>Business trial</span>
            <strong>{subscription.trialDaysRemaining} days remaining</strong>
            <p>
              Your {ORBIT_TRIAL_DAYS}-day trial includes the Business operating level so
              you can test real workflows before choosing a plan.
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
          <div className={styles.bannerIcon}>
            <CalendarClock size={19} aria-hidden="true" />
          </div>
          <div>
            <span>Trial complete</span>
            <strong>Choose a plan to resume workspace changes.</strong>
            <p>Your workspace data is preserved while you decide.</p>
          </div>
        </section>
      ) : null}

      <section className={styles.summaryGrid} aria-label="Billing status">
        <article className={styles.summaryCard}>
          <div className={styles.summaryIcon}>
            <ShieldCheck size={18} aria-hidden="true" />
          </div>
          <span>Current plan</span>
          <strong>{subscription.plan.name}</strong>
          <div className={styles.statusLine}>
            <i className={subscription.canWrite ? styles.liveDot : styles.attentionDot} />
            {statusLabel(subscription.effectiveStatus)}
          </div>
        </article>

        <article className={styles.summaryCard}>
          <div className={styles.summaryIcon}>
            <CreditCard size={18} aria-hidden="true" />
          </div>
          <span>Payment connection</span>
          <strong>
            {subscription.row?.provider ? subscription.row.provider : "Not connected"}
          </strong>
          <p>
            Your workspace plan remains independent from the payment provider used to
            activate it.
          </p>
        </article>

        <article className={styles.summaryCard}>
          <div className={styles.summaryIcon}>
            <CalendarClock size={18} aria-hidden="true" />
          </div>
          <span>Pending change</span>
          <strong>{pendingRequest ? "Awaiting activation" : "None"}</strong>
          <p>
            {pendingRequest
              ? `${pendingRequest.requested_plan_key} · ${pendingRequest.billing_interval}`
              : "No plan change is waiting to be applied."}
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
          <span className="section-kicker">Billing architecture</span>
          <h2>Your workspace stays portable.</h2>
        </div>
        <p>
          Orbit keeps plan choice, trial dates and subscription state at the workspace
          level. A payment provider can activate billing without becoming the source of
          truth for your organisation or operating data.
        </p>
      </section>
    </div>
  );
}
