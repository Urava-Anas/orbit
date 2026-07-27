import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { humanize } from "@/lib/format";
import { requireWorkspace } from "@/lib/workspace";

export const metadata: Metadata = {
  title: "Organisation",
  robots: { index: false, follow: false },
};

export default async function OrganisationPage() {
  const { user, role, workspace } = await requireWorkspace();

  return (
    <div className="page">
      <PageHeader
        kicker="Organisation architecture"
        title={workspace.name}
        description="One organisation boundary, one person identity, controlled access to each operating domain, and an audit trail for every important action."
      />

      <section className="settings-grid">
        <article className="panel settings-card">
          <h2>Organisation boundary</h2>
          <p>
            Every operational record belongs to this organisation and remains
            isolated from every other Orbit organisation.
          </p>
          <dl>
            <div>
              <dt>Name</dt>
              <dd>{workspace.name}</dd>
            </div>
            <div>
              <dt>Organisation slug</dt>
              <dd className="mono">{workspace.slug}</dd>
            </div>
            <div>
              <dt>Your membership</dt>
              <dd>{humanize(role)}</dd>
            </div>
          </dl>
        </article>

        <article className="panel settings-card">
          <h2>Identity and authority</h2>
          <p>
            A person keeps one identity. Their membership and access determine
            which domains and actions they may use.
          </p>
          <dl>
            <div>
              <dt>Signed-in identity</dt>
              <dd>{user.email}</dd>
            </div>
            <div>
              <dt>Default access</dt>
              <dd>Deny</dd>
            </div>
            <div>
              <dt>Enforcement</dt>
              <dd>Server + RLS</dd>
            </div>
          </dl>
        </article>

        <article className="panel settings-card">
          <h2>Current operating domains</h2>
          <p>
            Orbit currently runs the proven founder loop while the broader
            organisation model is introduced in controlled vertical slices.
          </p>
          <dl>
            <div>
              <dt>Founder Command</dt>
              <dd>Active</dd>
            </div>
            <div>
              <dt>Growth and delivery</dt>
              <dd>Active</dd>
            </div>
            <div>
              <dt>Finance and evidence</dt>
              <dd>Active</dd>
            </div>
            <div>
              <dt>Foundry</dt>
              <dd>Architecture locked</dd>
            </div>
          </dl>
        </article>

        <article className="panel settings-card">
          <h2>Platform direction</h2>
          <p>
            Orbit remains founder-first in experience and organisation-first in
            architecture. Foundry will enter as a bounded domain, not as a second
            application or a replacement for Founder Command.
          </p>
          <dl>
            <div>
              <dt>Construction</dt>
              <dd>Modular monolith</dd>
            </div>
            <div>
              <dt>Operation</dt>
              <dd>Workflow-first</dd>
            </div>
            <div>
              <dt>AI access</dt>
              <dd>Policy-scoped</dd>
            </div>
          </dl>
          <Link className="button" href="/dashboard/settings">
            Review security
          </Link>
        </article>
      </section>
    </div>
  );
}
