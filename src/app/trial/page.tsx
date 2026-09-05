import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Check, Clock3, ShieldCheck, Sparkles } from "lucide-react";
import { Notice } from "@/components/Notice";
import { OrbitMark } from "@/components/OrbitMark";
import { SubmitButton } from "@/components/SubmitButton";
import { getOrbitAccess, orbitHomePath } from "@/lib/access";
import { ORBIT_TRIAL_DAYS } from "@/lib/orbit-plans";
import { startOrbitTrial } from "./actions";
import styles from "./trial.module.css";

export const metadata: Metadata = {
  title: "Start your Orbit trial",
  robots: { index: false, follow: false },
};

type TrialPageProps = {
  searchParams: Promise<{ error?: string; notice?: string }>;
};

export default async function TrialPage({ searchParams }: TrialPageProps) {
  const params = await searchParams;
  const context = await getOrbitAccess();

  if (!context) redirect("/login?next=/trial");

  if (context.access.accountRole === "founder" && context.access.workspace) {
    redirect("/dashboard/billing");
  }

  if (context.access.accountRole === "student") {
    redirect(orbitHomePath(context.access));
  }

  const suggestedName =
    typeof context.user.user_metadata.full_name === "string"
      ? `${context.user.user_metadata.full_name}'s workspace`
      : "My company";

  return (
    <main className={styles.trialPage}>
      <nav className={styles.nav}>
        <Link href="/pricing" className={styles.backLink}>
          <ArrowLeft size={15} aria-hidden="true" /> Pricing
        </Link>
        <OrbitMark />
        <span className={styles.secure}><ShieldCheck size={14} /> Secure setup</span>
      </nav>

      <section className={styles.shell}>
        <div className={styles.promise}>
          <span className={styles.kicker}>Your {ORBIT_TRIAL_DAYS}-day Business trial</span>
          <h1>Give your company an Orbit.</h1>
          <p>
            Create one secure organisation workspace. Orbit will start it on the full
            Business operating level for {ORBIT_TRIAL_DAYS} days—no stripped-down demo.
          </p>

          <div className={styles.promiseGrid}>
            <div><Check size={16} /><span>Business operating level</span></div>
            <div><Check size={16} /><span>Up to 10 team members</span></div>
            <div><Check size={16} /><span>Founder command centre</span></div>
            <div><Check size={16} /><span>Automation & approvals</span></div>
          </div>

          <div className={styles.trustLine}>
            <span><Clock3 size={14} /> {ORBIT_TRIAL_DAYS} full days</span>
            <span><ShieldCheck size={14} /> Workspace-isolated data</span>
            <span><Sparkles size={14} /> Choose a plan later</span>
          </div>
        </div>

        <section className={styles.setupCard}>
          <div className={styles.cardHead}>
            <span>Step 1 of 1</span>
            <h2>Name the organisation.</h2>
            <p>This becomes the workspace Orbit operates around.</p>
          </div>

          <Notice error={params.error} notice={params.notice} />

          <form action={startOrbitTrial} className={styles.form}>
            <label htmlFor="workspace_name">Organisation / workspace name</label>
            <input
              id="workspace_name"
              name="workspace_name"
              type="text"
              minLength={2}
              maxLength={80}
              defaultValue={suggestedName}
              autoComplete="organization"
              required
            />
            <small>You can rename it later while your subscription is active.</small>

            <SubmitButton
              idleLabel={`Start ${ORBIT_TRIAL_DAYS}-day Business trial`}
              pendingLabel="Creating your Orbit…"
            />
          </form>

          <p className={styles.termsNote}>
            No payment method is collected at this stage. Use the full trial first,
            then choose the plan that fits from Plan & Billing inside your workspace.
          </p>
        </section>
      </section>
    </main>
  );
}