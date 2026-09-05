import type { Metadata } from "next";
import Link from "next/link";
import {
  Building2,
  KeyRound,
  LogOut,
  MailCheck,
  ShieldAlert,
  Trash2,
  UserRound,
} from "lucide-react";
import { signOut, signOutEverywhere } from "@/app/auth/actions";
import { Notice } from "@/components/Notice";
import { PageHeader } from "@/components/PageHeader";
import { humanize } from "@/lib/format";
import { requireWorkspace } from "@/lib/workspace";
import styles from "./settings.module.css";

export const metadata: Metadata = {
  title: "Identity & Security",
  robots: { index: false, follow: false },
};

type PageProps = {
  searchParams: Promise<{ error?: string; notice?: string }>;
};

export default async function SettingsPage({ searchParams }: PageProps) {
  const { user, role, workspace } = await requireWorkspace();
  const params = await searchParams;

  return (
    <div className="page">
      <PageHeader
        kicker="Identity and access control"
        title="Security & Access"
        description="Manage the workspace boundary, your identity, outbound sender and active sessions. High-risk account actions are deliberately separated from routine settings."
      />
      <Notice error={params.error} notice={params.notice} />

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <div>
            <span className="section-kicker">Workspace access</span>
            <h2>Organisation & identity</h2>
          </div>
          <p>These controls define who you are in Orbit and which workspace boundary this session belongs to.</p>
        </div>
        <div className="settings-grid">
          <article className={`panel settings-card ${styles.card}`}>
            <div className={styles.cardTop}>
              <span className={styles.cardIcon}><Building2 size={17} /></span>
              <div><h3>Organisation</h3><span className={styles.status}>Isolated workspace</span></div>
            </div>
            <p>The active organisation boundary attached to this session.</p>
            <dl>
              <div><dt>Name</dt><dd>{workspace.name}</dd></div>
              <div><dt>Slug</dt><dd className="mono">{workspace.slug}</dd></div>
              <div><dt>Your membership</dt><dd>{humanize(role)}</dd></div>
            </dl>
            <Link className="button" href="/dashboard/organisation">Open organisation</Link>
          </article>

          <article className={`panel settings-card ${styles.card}`}>
            <div className={styles.cardTop}>
              <span className={styles.cardIcon}><UserRound size={17} /></span>
              <div><h3>Identity</h3>{user.email_confirmed_at ? <span className={styles.status}>Email verified</span> : null}</div>
            </div>
            <p>Your protected Orbit identity is verified on every authenticated request.</p>
            <dl>
              <div><dt>Email</dt><dd>{user.email}</dd></div>
              <div><dt>User ID</dt><dd className="mono">{user.id.slice(0, 8)}…</dd></div>
              <div><dt>Email verified</dt><dd>{user.email_confirmed_at ? "Yes" : "No"}</dd></div>
            </dl>
            <Link className="button" href="/forgot-password"><KeyRound size={14} /> Reset password</Link>
          </article>

          <article className={`panel settings-card ${styles.card}`}>
            <div className={styles.cardTop}>
              <span className={styles.cardIcon}><MailCheck size={17} /></span>
              <div><h3>Outbound email</h3></div>
            </div>
            <p>Connect the verified sender used for governed proposals, outreach and follow-ups.</p>
            <Link className="button" href="/dashboard/settings/outbound-email">Manage outbound email</Link>
          </article>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <div>
            <span className="section-kicker">Session protection</span>
            <h2>Signed-in devices</h2>
          </div>
          <p>Use the emergency option only when a device or credential may be exposed.</p>
        </div>
        <div className="settings-grid">
          <article className={`panel settings-card ${styles.card}`}>
            <div className={styles.cardTop}>
              <span className={styles.cardIcon}><LogOut size={17} /></span>
              <div><h3>Current session</h3></div>
            </div>
            <p>Close only this browser session and keep other signed-in devices active.</p>
            <form action={signOut}><button className="button" type="submit">Sign out this session</button></form>
          </article>

          <article className={`panel settings-card ${styles.card} ${styles.securityCard}`}>
            <div className={styles.cardTop}>
              <span className={styles.cardIcon}><ShieldAlert size={17} /></span>
              <div><h3>Emergency revocation</h3></div>
            </div>
            <p>End every active Orbit session if a device, browser or credential may be compromised.</p>
            <form action={signOutEverywhere}><button className="button button-danger" type="submit">Sign out everywhere</button></form>
          </article>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <div>
            <span className="section-kicker">Ownership controls</span>
            <h2>Privacy & deletion</h2>
          </div>
          <p>Account deletion is irreversible and therefore visually isolated from ordinary workspace controls.</p>
        </div>
        <article className={`panel settings-card ${styles.card} ${styles.dangerCard}`}>
          <div className={styles.cardTop}>
            <span className={styles.cardIcon}><Trash2 size={17} /></span>
            <div><h3>Account ownership</h3></div>
          </div>
          <p>Review how Orbit handles your data, or open the permanent account deletion flow.</p>
          <div className={styles.actions}>
            <Link className="button" href="/orbit/privacy">Privacy controls</Link>
            <Link className="button button-danger" href="/account/delete">Delete account</Link>
          </div>
        </article>
      </section>
    </div>
  );
}
