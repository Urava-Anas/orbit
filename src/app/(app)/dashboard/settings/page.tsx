import type { Metadata } from "next";
import Link from "next/link";
import { signOut, signOutEverywhere } from "@/app/auth/actions";
import { Notice } from "@/components/Notice";
import { PageHeader } from "@/components/PageHeader";
import { humanize } from "@/lib/format";
import { requireWorkspace } from "@/lib/workspace";

export const metadata: Metadata = {
  title: "Settings",
  robots: { index: false, follow: false },
};

type PageProps = {
  searchParams: Promise<{ error?: string; notice?: string }>;
};

export default async function SettingsPage({ searchParams }: PageProps) {
  const { supabase, user, role, workspace } = await requireWorkspace();
  const params = await searchParams;

  const [permissionResult, auditResult] = await Promise.all([
    supabase
      .from("permission_bundles")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspace.id),
    supabase
      .from("audit_events")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspace.id),
  ]);

  return (
    <div className="page">
      <PageHeader
        kicker="Organisation controls"
        title="Settings"
        description="Identity, roles, security, notifications and account controls belong here instead of becoming separate Orbit pages."
      />
      <Notice error={params.error} notice={params.notice} />

      <section className="settings-grid">
        <article className="panel settings-card">
          <h2>Organisation</h2>
          <p>The active organisation boundary attached to this session.</p>
          <dl>
            <div><dt>Name</dt><dd>{workspace.name}</dd></div>
            <div><dt>Slug</dt><dd className="mono">{workspace.slug}</dd></div>
            <div><dt>Your membership</dt><dd>{humanize(role)}</dd></div>
          </dl>
          <Link className="button" href="/dashboard/organisation">Open organisation</Link>
        </article>

        <article className="panel settings-card">
          <h2>Roles & permissions</h2>
          <p>Keep role authority and capability access inside organisation settings.</p>
          <dl>
            <div><dt>Your role</dt><dd>{humanize(role)}</dd></div>
            <div><dt>Permission bundles</dt><dd>{permissionResult.count ?? 0}</dd></div>
          </dl>
          <Link className="button" href="/dashboard/organisation">Review people & access</Link>
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
          <h2>Audit & security</h2>
          <p>Important organisation actions remain attributable and reviewable.</p>
          <dl>
            <div><dt>Recorded audit events</dt><dd>{auditResult.count ?? 0}</dd></div>
            <div><dt>Session protection</dt><dd>Active</dd></div>
          </dl>
          <form action={signOutEverywhere}>
            <button className="button button-danger" type="submit">Sign out everywhere</button>
          </form>
        </article>

        <article className="panel settings-card">
          <h2>Notifications</h2>
          <p>Email, in-app and workflow preferences stay in Settings. Module-specific delivery rules can still be configured inside their module.</p>
          <span className="system-state">One notification home · no extra top-level page</span>
        </article>

        <article className="panel settings-card">
          <h2>Billing & subscription</h2>
          <p>Plan, seats, invoices and usage will live here when Orbit billing is activated. No separate billing page is created early.</p>
          <span className="system-state">Not activated for this organisation</span>
        </article>

        <article className="panel settings-card">
          <h2>Current session</h2>
          <p>Close only this browser session and keep other signed-in devices active.</p>
          <form action={signOut}>
            <button className="button" type="submit">Sign out this session</button>
          </form>
        </article>
      </section>
    </div>
  );
}
