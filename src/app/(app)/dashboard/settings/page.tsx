import type { Metadata } from "next";
import Link from "next/link";
import { signOut, signOutEverywhere } from "@/app/auth/actions";
import { Notice } from "@/components/Notice";
import { PageHeader } from "@/components/PageHeader";
import { humanize } from "@/lib/format";
import { requireWorkspace } from "@/lib/workspace";

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
        title="Identity & Security"
        description="Organisation membership, verified identity, credential recovery, session revocation and account deletion. Sensitive authority remains server-side and database-enforced."
      />
      <Notice error={params.error} notice={params.notice} />

      <section className="settings-grid">
        <article className="panel settings-card">
          <h2>Organisation</h2>
          <p>The active tenant boundary attached to this session.</p>
          <dl>
            <div><dt>Name</dt><dd>{workspace.name}</dd></div>
            <div><dt>Slug</dt><dd className="mono">{workspace.slug}</dd></div>
            <div><dt>Your membership</dt><dd>{humanize(role)}</dd></div>
          </dl>
          <Link className="button" href="/dashboard/organisation">Open organisation</Link>
        </article>

        <article className="panel settings-card">
          <h2>Identity</h2>
          <p>Verified by Supabase Auth on every protected request.</p>
          <dl>
            <div><dt>Email</dt><dd>{user.email}</dd></div>
            <div><dt>User ID</dt><dd className="mono">{user.id.slice(0, 8)}…</dd></div>
            <div><dt>Email verified</dt><dd>{user.email_confirmed_at ? "Yes" : "No"}</dd></div>
          </dl>
          <Link className="button" href="/forgot-password">Reset password</Link>
        </article>

        <article className="panel settings-card">
          <h2>Outbound email</h2>
          <p>Connect the verified sender Orbit Stage 4 uses for proposals, outreach and follow-ups.</p>
          <Link className="button" href="/dashboard/settings/outbound-email">Manage outbound email</Link>
        </article>

        <article className="panel settings-card">
          <h2>Current session</h2>
          <p>Close only this browser session and keep other signed-in devices active.</p>
          <form action={signOut}><button className="button" type="submit">Sign out this session</button></form>
        </article>

        <article className="panel settings-card">
          <h2>Emergency revocation</h2>
          <p>End every active Orbit session if a device or credential may be exposed.</p>
          <form action={signOutEverywhere}><button className="button button-danger" type="submit">Sign out everywhere</button></form>
        </article>

        <article className="panel settings-card">
          <h2>Privacy & deletion</h2>
          <p>Review Orbit&apos;s privacy controls or permanently delete this account and any workspaces you own.</p>
          <div className="actions">
            <Link className="button" href="/orbit/privacy">Privacy controls</Link>
            <Link className="button button-danger" href="/account/delete">Delete account</Link>
          </div>
        </article>
      </section>
    </div>
  );
}
