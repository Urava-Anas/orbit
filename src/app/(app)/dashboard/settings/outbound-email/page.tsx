import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, MailCheck, ShieldCheck } from "lucide-react";
import { Notice } from "@/components/Notice";
import { PageHeader } from "@/components/PageHeader";
import { stageFourProviderReadinessForWorkspace } from "@/lib/agents/stage4-providers";
import { requireWorkspace } from "@/lib/workspace";
import { saveOutboundEmailProvider } from "./actions";
import styles from "./outbound-email.module.css";

export const metadata: Metadata = {
  title: "Outbound Email Provider",
  robots: { index: false, follow: false },
};

type Props = {
  searchParams: Promise<{ error?: string; notice?: string }>;
};

export default async function OutboundEmailPage({ searchParams }: Props) {
  const params = await searchParams;
  const { workspace, role } = await requireWorkspace();
  const readiness = await stageFourProviderReadinessForWorkspace(workspace.id);
  const canManage = ["owner", "admin"].includes(role);

  return (
    <div className="page">
      <Link className={`button button-quiet ${styles.back}`} href="/dashboard/settings">
        <ArrowLeft size={15} /> Back to Security & Access
      </Link>

      <PageHeader
        kicker="Workspace sender"
        title="Outbound Email"
        description="Connect a verified sender Orbit can use for approved proposals, outreach and follow-ups. Credentials stay private to this workspace."
      />

      <Notice error={params.error} notice={params.notice} />

      <section className={styles.grid}>
        <article className={`panel settings-card ${styles.card}`}>
          <div className={styles.cardHead}>
            <span><MailCheck size={18} /></span>
            <div>
              <h2>Connection status</h2>
              <div className={styles.status} data-ready={readiness.email.configured}>
                {readiness.email.configured ? "Ready to send" : "Setup required"}
              </div>
            </div>
          </div>
          <dl>
            <div><dt>Provider</dt><dd>Resend</dd></div>
            <div><dt>Status</dt><dd>{readiness.email.configured ? "Configured" : "Not configured"}</dd></div>
            <div><dt>Readiness</dt><dd>{readiness.email.reason}</dd></div>
          </dl>
          <div className={styles.readiness}>
            <ShieldCheck size={16} />
            <span>The API key is written directly into the workspace Vault and is never returned to this page.</span>
          </div>
        </article>

        <article className={`panel settings-card ${styles.card}`}>
          <div className={styles.cardHead}>
            <span><ShieldCheck size={18} /></span>
            <div>
              <h2>{readiness.email.configured ? "Replace sender credentials" : "Connect Resend"}</h2>
            </div>
          </div>
          <p>Use a Resend API key and a sender address already verified in your Resend account.</p>
          {canManage ? (
            <form action={saveOutboundEmailProvider} className={styles.form}>
              <label>
                <span>Resend API key</span>
                <input
                  type="password"
                  name="apiKey"
                  autoComplete="off"
                  placeholder="re_••••••••••••••••"
                  required
                />
              </label>
              <label>
                <span>Verified sender</span>
                <input
                  type="text"
                  name="emailFrom"
                  placeholder="Urava <hello@yourdomain.com>"
                  required
                />
              </label>
              <button className="button button-primary" type="submit">
                Save securely
              </button>
            </form>
          ) : (
            <p>Owner or admin authority is required to change provider credentials.</p>
          )}
        </article>
      </section>
    </div>
  );
}
