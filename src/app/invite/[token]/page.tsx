import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, LockKeyhole, MailCheck } from "lucide-react";
import { getOrbitAccess, orbitHomePath } from "@/lib/access";

export const metadata: Metadata = {
  title: "Organisation invitation · Orbit",
  robots: { index: false, follow: false },
};

type Props = { params: Promise<{ token: string }> };

export default async function InvitationPage({ params }: Props) {
  const { token } = await params;
  const context = await getOrbitAccess();
  const looksValid = /^[A-Za-z0-9_-]{12,160}$/.test(token);

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <Link href="/" aria-label="Orbit home">
          <span className="wordmark"><span className="orbit-mark" aria-hidden="true" />Orbit <span style={{ color: "var(--muted)" }}>by Urava</span></span>
        </Link>
        <div className="auth-form">
          <span className="eyebrow">Organisation invitation</span>
          <h1>{looksValid ? "Your invite is protected." : "This invite link is not valid."}</h1>
          <p>
            Orbit never grants organisation access from a URL alone. Your verified identity and an active organisation invitation must match before access is opened.
          </p>

          {!looksValid ? (
            <div className="notice">Ask the organisation admin for a fresh invitation link.</div>
          ) : context ? (
            <>
              <div className="panel settings-card" style={{ marginTop: 20 }}>
                <CheckCircle2 aria-hidden="true" size={20} />
                <h2>Identity verified</h2>
                <p>{context.user.email}</p>
                <span className="system-state"><LockKeyhole aria-hidden="true" size={13} /> Access remains deny-by-default</span>
              </div>
              <div className="notice" style={{ marginTop: 16 }}>
                Invitation acceptance is not activated until Orbit's invitation registry is connected. This page will not guess or create membership from an unverified token.
              </div>
              <Link className="button button-primary" href={orbitHomePath(context.access)} style={{ marginTop: 18 }}>
                Open my current workspace
              </Link>
            </>
          ) : (
            <>
              <div className="panel settings-card" style={{ marginTop: 20 }}>
                <MailCheck aria-hidden="true" size={20} />
                <h2>Verify your identity first</h2>
                <p>Sign in with the exact email that received the invitation, then reopen this invitation link.</p>
              </div>
              <Link className="button button-primary" href="/login" style={{ marginTop: 18 }}>
                Sign in to Orbit
              </Link>
            </>
          )}
        </div>
      </section>
      <aside className="auth-art" aria-hidden="true">
        <div className="auth-quote">
          <span className="eyebrow">Invite → identity → organisation</span>
          <p>Invitation links never override Orbit's role and organisation security boundary.</p>
        </div>
      </aside>
    </main>
  );
}
