import type { Metadata } from "next";
import Link from "next/link";
import { Building2, CheckCircle2, Plus, UsersRound } from "lucide-react";
import { orbitHomePath, requireOrbitAccess } from "@/lib/access";
import { selectOrganisation } from "./actions";

export const metadata: Metadata = {
  title: "Choose organisation · Orbit",
  robots: { index: false, follow: false },
};

type MembershipRow = {
  workspace_id: string;
  role: string;
  workspaces:
    | { id: string; name: string; slug: string }
    | Array<{ id: string; name: string; slug: string }>
    | null;
};

type Props = {
  searchParams: Promise<{ error?: string }>;
};

function workspaceFrom(value: MembershipRow["workspaces"]) {
  return Array.isArray(value) ? value[0] ?? null : value;
}

export default async function OrganisationSelectionPage({ searchParams }: Props) {
  const context = await requireOrbitAccess();
  const params = await searchParams;
  const { access, supabase, user } = context;

  const { data } = await supabase
    .from("workspace_members")
    .select("workspace_id, role, workspaces(id, name, slug)")
    .eq("user_id", user.id)
    .in("role", ["owner", "admin"])
    .order("created_at", { ascending: true });

  const memberships = ((data ?? []) as unknown as MembershipRow[])
    .map((item) => ({ ...item, workspace: workspaceFrom(item.workspaces) }))
    .filter((item) => item.workspace);

  const errorCopy =
    params.error === "invalid-workspace"
      ? "That workspace selection was invalid. Nothing was changed."
      : params.error === "not-authorised"
        ? "Your account is not authorised to operate that organisation."
        : null;

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
            Orbit verifies membership again before switching. The selected organisation is stored in a secure, server-only cookie and rechecked on every protected request.
          </p>

          {errorCopy ? <div className="notice" style={{ marginTop: 18 }}>{errorCopy}</div> : null}

          <div className="settings-grid" style={{ marginTop: 24 }}>
            {memberships.length ? memberships.map((membership) => {
              const workspace = membership.workspace!;
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
                    <form action={selectOrganisation}>
                      <input type="hidden" name="workspaceId" value={workspace.id} />
                      <button className="button" type="submit">Switch to this organisation</button>
                    </form>
                  )}
                </article>
              );
            }) : (
              <article className="panel settings-card">
                <UsersRound aria-hidden="true" size={20} />
                <h2>No operator organisation assigned</h2>
                <p>Your verified account does not have an owner or admin membership yet.</p>
                <Link className="button" href="/access-pending">Check access</Link>
              </article>
            )}
          </div>

          <div className="notice" style={{ marginTop: 20 }}>
            <Plus aria-hidden="true" size={16} />
            New organisation creation stays inside onboarding. Selection never creates membership or expands authority.
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
