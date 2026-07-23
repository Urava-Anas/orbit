import type { Metadata } from "next";
import Link from "next/link";
import { signOut, signOutEverywhere } from "@/app/auth/actions";
import { Notice } from "@/components/Notice";
import { PageHeader } from "@/components/PageHeader";
import { humanize } from "@/lib/format";
import { requireWorkspace } from "@/lib/workspace";

export const metadata: Metadata = {
  title: "Settings & Security",
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
        kicker="Access control"
        title="Settings & Security"
        description="Workspace identity, role, credential recovery, and session revocation. Sensitive authorization remains server-side and database-enforced."
      />
      <Notice error={params.error} notice={params.notice} />

      <section className="settings-grid">
        <article className="panel settings-card">
          <h2>Workspace</h2>
          <p>The active tenant boundary attached to this session.</p>
          <dl>
            <div>
              <dt>Name</dt>
              <dd>{workspace.name}</dd>
            </div>
            <div>
              <dt>Slug</dt>
              <dd className="mono">{workspace.slug}</dd>
            </div>
            <div>
              <dt>Your role</dt>
              <dd>{humanize(role)}</dd>
            </div>
          </dl>
        </article>

        <article className="panel settings-card">
          <h2>Identity</h2>
          <p>Verified by Supabase Auth on every protected request.</p>
          <dl>
            <div>
              <dt>Email</dt>
              <dd>{user.email}</dd>
            </div>
            <div>
              <dt>User ID</dt>
              <dd className="mono">{user.id.slice(0, 8)}…</dd>
            </div>
            <div>
              <dt>Email verified</dt>
              <dd>{user.email_confirmed_at ? "Yes" : "No"}</dd>
            </div>
          </dl>
          <Link className="button" href="/forgot-password">
            Reset password
          </Link>
        </article>

        <article className="panel settings-card">
          <h2>Current session</h2>
          <p>Close only this browser session and keep other signed-in devices active.</p>
          <form action={signOut}>
            <button className="button" type="submit">
              Sign out this session
            </button>
          </form>
        </article>

        <article className="panel settings-card">
          <h2>Emergency revocation</h2>
          <p>End every active Orbit session if a device or credential may be exposed.</p>
          <form action={signOutEverywhere}>
            <button className="button button-danger" type="submit">
              Sign out everywhere
            </button>
          </form>
        </article>
      </section>
    </div>
  );
}
