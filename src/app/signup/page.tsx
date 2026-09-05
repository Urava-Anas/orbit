import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, ShieldCheck, Sparkles } from "lucide-react";
import { signInWithGoogle, signUp } from "@/app/auth/actions";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { Notice } from "@/components/Notice";
import { OrbitMark } from "@/components/OrbitMark";
import { PasswordField } from "@/components/PasswordField";
import { SubmitButton } from "@/components/SubmitButton";
import { getOrbitAccess, orbitHomePath } from "@/lib/access";
import {
  isInvitationReturnPath,
  safeAuthReturnPath,
} from "@/lib/auth-return-path";
import { ORBIT_TRIAL_DAYS } from "@/lib/orbit-plans";

export const metadata: Metadata = {
  title: "Create your Orbit",
  robots: { index: false, follow: false },
};

type SignupPageProps = {
  searchParams: Promise<{
    error?: string;
    notice?: string;
    next?: string;
  }>;
};

export default async function SignupPage({ searchParams }: SignupPageProps) {
  const params = await searchParams;
  const nextPath = safeAuthReturnPath(params.next);
  const invitationFlow = isInvitationReturnPath(nextPath);
  const context = await getOrbitAccess();

  if (context) {
    if (invitationFlow && nextPath) redirect(nextPath);
    if (context.access.accountRole === "founder" && context.access.workspace) {
      redirect(orbitHomePath(context.access));
    }
    if (context.access.accountRole === "student") {
      redirect(orbitHomePath(context.access));
    }
    redirect("/onboarding");
  }

  const loginHref = invitationFlow && nextPath
    ? `/login?next=${encodeURIComponent(nextPath)}`
    : "/login";

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <Link href="/" aria-label="Orbit home">
          <OrbitMark />
        </Link>

        <div className="auth-form">
          <span className="eyebrow">
            {invitationFlow ? "Orbit invitation" : "New Orbit account"}
          </span>
          <h1>{invitationFlow ? "Create your account to join." : "Create your Orbit."}</h1>
          <p>
            {invitationFlow
              ? "Create one verified Orbit identity. Your invitation decides the organisation and access you receive; signup does not choose your role."
              : `Create your identity first. Then Orbit will learn what you want under control before your ${ORBIT_TRIAL_DAYS}-day Business trial begins.`}
          </p>

          <Notice error={params.error} notice={params.notice} />

          <form className="oauth-form" action={signInWithGoogle}>
            <input type="hidden" name="flow" value="signup" />
            {invitationFlow && nextPath ? (
              <input type="hidden" name="next" value={nextPath} />
            ) : (
              <input type="hidden" name="next" value="/onboarding" />
            )}
            <GoogleSignInButton />
          </form>

          <div className="auth-divider">
            <span>or create with email</span>
          </div>

          <form className="form-stack" action={signUp}>
            {invitationFlow && nextPath ? (
              <input type="hidden" name="next" value={nextPath} />
            ) : null}
            <div className="field">
              <label htmlFor="full_name">Your name</label>
              <input
                id="full_name"
                name="full_name"
                type="text"
                autoComplete="name"
                minLength={2}
                maxLength={100}
                required
                placeholder="Your name"
              />
            </div>
            <div className="field">
              <label htmlFor="email">{invitationFlow ? "Invited email" : "Work email"}</label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                maxLength={254}
                required
                placeholder={invitationFlow ? "Use the email that received the invitation" : "you@company.com"}
              />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <PasswordField
                id="password"
                name="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                required
                placeholder="At least 12 characters"
              />
            </div>
            <div className="field">
              <label htmlFor="confirm_password">Confirm password</label>
              <PasswordField
                id="confirm_password"
                name="confirm_password"
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                required
                placeholder="Repeat your password"
              />
            </div>
            <SubmitButton
              idleLabel={invitationFlow ? "Create account and continue" : "Create account"}
              pendingLabel="Creating your account…"
            />
          </form>

          <div className="form-foot" style={{ marginTop: 20 }}>
            <span className="auth-invite-note">
              <ShieldCheck aria-hidden="true" size={13} />
              {invitationFlow
                ? "Access is granted only after the invitation is accepted."
                : "Your trial starts after setup, not now."}
            </span>
            <Link className="text-link" href={loginHref}>
              Already have an account? Sign in
            </Link>
          </div>
        </div>
      </section>

      <aside className="auth-art" aria-hidden="true">
        <div className="auth-quote">
          <span className="eyebrow">
            {invitationFlow ? "Identity → invitation → access" : "Account → setup → real workspace"}
          </span>
          <p>
            {invitationFlow
              ? "Orbit separates who you are from what an organisation authorises you to do."
              : "Orbit should understand the company before it starts operating around it."}
          </p>
          <span className="system-state">
            <Sparkles size={13} />
            {invitationFlow ? "Verified invitation required" : "No payment method required to start"}
          </span>
          <span className="sr-only"><ArrowRight /> Continue after account creation.</span>
        </div>
      </aside>
    </main>
  );
}
