import type { Metadata } from "next";
import Link from "next/link";
import { Building2, CheckCircle2, Plus, UsersRound } from "lucide-react";
import { orbitHomePath, requireOrbitAccess } from "@/lib/access";

export const metadata: Metadata = {
  title: "Choose organisation · Orbit",
  robots: { index: false, follow: false },
};

type MembershipRow = {
  workspace_id: string;
  role: string;
  workspaces: { id: string; name: string; slug: string } | null;
};

export default async function OrganisationSelectionPage() {
  const context = await requireOrbitAccess();
  const { access, supabase, user } = context;

  const { data } = await supabase
    .from("workspace_members")
    .select("workspace_id, role, workspaces(id, name, slug)")
    .eq("user_id", user.id);

  const memberships = ((data ?? []) as unknown as MembershipRow[]).filter(
    (item) => item.workspaces,
  );

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <Link href="/" aria-label="Orbit home">
          <span className="wordmark">
            <span className="orbit-mark" aria-hidden="true" />
            Orbit <span style={{ color: "var(--muted)" }}>by Urava</span>
          </span>
        </Link>
        <div className="auth-form">
          <span className="eyebrow">Organisation first</span>
          <h1>Choose your workspace.</h1>
          <p>
            Orbit keeps each organisation separate. Your role, modules and data follow the workspace you enter.
          </p>

          <div className="settings-grid" style={{ marginTop: 24 }}>
            {memberships.length ? memberships.map((membership) => {
              const workspace = membership.workspaces!;
              const current = access.workspace?.id === workspace.id;
              return (
                <article className="panel settings-card" key={workspace.id}>
                  <Building2 aria-hidden="true" size={20} />
                  <h2>{workspace.name}</h2>
                  <p>{membership.role.replaceAll("_", " ")} · {workspace.slug}</p>
                  {current ? (
                    <>
                      <span className="system-state"><CheckCircle2 aria-hidden="true" size={13} /> Current organisation</span>
                      <Link className="button button-primary" href={orbitHomePath(access)}>
                        Open workspace
                      </Link>
                    </>
                  ) : (
                    <span className="system-state">Membership verified</span>
                  )}
                </article>
              );
            }) : (
              <article className="panel settings-card">
                <UsersRound aria-hidden="true" size={20} />
                <h2>No organisation assigned</h2>
                <p>Your verified account does not have an organisation membership yet.</p>
                <Link className="button" href="/access-pending">Check access</Link>
              </article>
            )}
          </div>

          <div className="notice" style={{ marginTop: 20 }}>
            <Plus aria-hidden="true" size={16} />
            Multiple-workspace switching stays locked until Orbit has a verified active-workspace selector. No data is switched by guesswork.
          </div>
        </div>
      </section>
      <aside className="auth-art" aria-hidden="true">
        <div className="auth-quote">
          <span className="eyebrow">One identity · separate organisations</span>
          <p>Choose the organisation first. Orbit then opens only the role and modules you are allowed to use.</p>
        </div>
      </aside>
    </main>
  );
}
