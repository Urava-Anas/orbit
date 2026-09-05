import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, Clock3, KeyRound, ShieldCheck, Users } from "lucide-react";
import { acceptOrbitInvitation } from "@/app/invite/[token]/actions";
import { Notice } from "@/components/Notice";
import { OrbitMark } from "@/components/OrbitMark";
import { SubmitButton } from "@/components/SubmitButton";
import { getOrbitAccess, orbitHomePath } from "@/lib/access";
import { isOrbitInvitationToken } from "@/lib/auth-return-path";
import { inspectOrbitInvitation } from "@/lib/orbit-invitations";

export const metadata: Metadata = {
  title: "Orbit invitation",
  robots: { index: false, follow: false },
};

type InvitationPageProps = {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
};

function invitationPath(token: string) {
  return `/invite/${token}`;
}

function expiryLabel(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZoneName: "short",
  }).format(date);
}

export default async function InvitationPage({ params, searchParams }: InvitationPageProps) {
  const { token } = await params;
  const messages = await searchParams;
  const validTokenShape = isOrbitInvitationToken(token);
  const invitation = validTokenShape
    ? await inspectOrbitInvitation(token)
    : {
        status: "invalid" as const,
        kind: null,
        workspaceName: null,
        emailHint: null,
        expiresAt: null,
      };
  const context = await getOrbitAccess();
  const returnPath = validTokenShape ? invitationPath(token) : "/login";
  const loginHref = `/login?next=${encodeURIComponent(returnPath)}`;
  const signupHref = `/signup?next=${encodeURIComponent(returnPath)}`;
  const expires = expiryLabel(invitation.expiresAt);

  const unavailable = invitation.status !== "valid";
  const unavailableTitle =
    invitation.status === "accepted"
      ? "This invitation has already been used."
      : invitation.status === "expired"
        ? "This invitation has expired."
        : invitation.status === "revoked"
          ? "This invitation was withdrawn."
          : "This invitation is not available.";

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <Link href="/" aria-label="Orbit home">
          <OrbitMark />
        </Link>

        <div className="auth-form">
          <span className="eyebrow">Orbit invitation</span>
          <h1>{unavailable ? unavailableTitle : `Join ${invitation.workspaceName ?? "this organisation"}.`}</h1>
          <p>
            {unavailable
              ? "No organisation access can be granted from this link. Ask the organisation to send a new invitation if you still need access."
              : "This invitation grants Foundry learner access only after the invited person signs in with the matching verified email and explicitly accepts."}
          </p>

          <Notice error={messages.error} notice={messages.notice} />

          {!unavailable ? (
            <div className="auth-role-row" aria-label="Invitation details">
              <span><Users size={13} /> {invitation.workspaceName ?? "Orbit organisation"}</span>
              <span><KeyRound size={13} /> {invitation.emailHint ?? "Invited email"}</span>
              {expires ? <span><Clock3 size={13} /> Expires {expires}</span> : null}
            </div>
          ) : null}

          {!unavailable && !context ? (
            <div className="form-stack" style={{ marginTop: 22 }}>
              <Link className="button button-primary" href={loginHref}>
                Sign in to review invitation
              </Link>
              <Link className="button button-secondary" href={signupHref}>
                Create Orbit account
              </Link>
              <span className="auth-invite-note">
                <ShieldCheck size={13} /> Authentication does not grant access by itself.
              </span>
            </div>
          ) : null}

          {!unavailable && context && context.access.accountRole === "pending" ? (
            <form className="form-stack" style={{ marginTop: 22 }} action={acceptOrbitInvitation}>
              <input type="hidden" name="token" value={token} />
              <SubmitButton
                idleLabel={`Accept and join ${invitation.workspaceName ?? "organisation"}`}
                pendingLabel="Granting authorised access…"
              />
              <span className="auth-invite-note">
                <ShieldCheck size={13} /> Orbit will verify your confirmed email again before access changes.
              </span>
            </form>
          ) : null}

          {!unavailable && context && context.access.accountRole !== "pending" ? (
            <div className="form-stack" style={{ marginTop: 22 }}>
              <Notice
                error="This signed-in account already has Orbit access. Use the account that was invited rather than changing an existing account's role."
              />
              <Link className="text-link" href={orbitHomePath(context.access)}>
                Return to my current Orbit workspace
              </Link>
            </div>
          ) : null}

          {unavailable ? (
            <div className="form-foot" style={{ marginTop: 22 }}>
              {context ? (
                <Link className="text-link" href={orbitHomePath(context.access)}>
                  Continue to Orbit
                </Link>
              ) : (
                <Link className="text-link" href="/login">
                  Sign in to Orbit
                </Link>
              )}
            </div>
          ) : null}
        </div>
      </section>

      <aside className="auth-art" aria-hidden="true">
        <div className="auth-quote">
          <span className="eyebrow">Identity ≠ authority</span>
          <p>Orbit keeps account identity separate from organisation membership and Foundry access.</p>
          <span className="system-state">
            <CheckCircle2 size={13} /> Signed, expiring, single-use access
          </span>
        </div>
      </aside>
    </main>
  );
}
