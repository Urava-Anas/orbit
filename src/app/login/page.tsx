import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LockKeyhole, Sparkles } from "lucide-react";
import { OrbitMark } from "@/components/OrbitMark";
import { Notice } from "@/components/Notice";
import { PasswordField } from "@/components/PasswordField";
import { SubmitButton } from "@/components/SubmitButton";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { login, signInWithGoogle } from "@/app/auth/actions";
import { getOrbitAccess, orbitHomePath } from "@/lib/access";
import {
  isInvitationReturnPath,
  safeAuthReturnPath,
} from "@/lib/auth-return-path";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

type LoginPageProps = {
  searchParams: Promise<{
    error?: string;
    notice?: string;
    next?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const nextPath = safeAuthReturnPath(params.next);
  const invitationFlow = isInvitationReturnPath(nextPath);
  const context = await getOrbitAccess();

  if (context) {
    if (nextPath) redirect(nextPath);
    redirect(orbitHomePath(context.access));
  }

  const signupHref = invitationFlow && nextPath
    ? `/signup?next=${encodeURIComponent(nextPath)}`
    : "/signup";

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <Link href="/" aria-label="Orbit home">
          <OrbitMark />
        </Link>

        <div className="auth-form">
          <span className="eyebrow">
            {invitationFlow ? "Orbit invitation" : "Existing Orbit account"}
          </span>
          <h1>{invitationFlow ? "Sign in to continue." : "Welcome back."}</h1>
          <p>
            {invitationFlow
              ? "Use the Orbit account for the email address that received this invitation. Access is granted only after you explicitly accept it."
              : "Sign in to the account you already use. Orbit will resolve your authorised organisation and access automatically."}
          </p>

          <Notice error={params.error} notice={params.notice} />

          <form className="oauth-form" action={signInWithGoogle}>
            {nextPath ? <input type="hidden" name="next" value={nextPath} /> : null}
            <GoogleSignInButton />
          </form>

          <div className="auth-divider">
            <span>or use email</span>
          </div>

          <form className="form-stack" action={login}>
            {nextPath ? <input type="hidden" name="next" value={nextPath} /> : null}
            <div className="field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                maxLength={254}
                required
                placeholder="you@example.com"
              />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <PasswordField
                id="password"
                name="password"
                autoComplete="current-password"
                minLength={1}
                maxLength={128}
                required
                placeholder="Your password"
              />
            </div>
            <SubmitButton
              idleLabel={invitationFlow ? "Sign in and review invitation" : "Continue to Orbit"}
              pendingLabel="Opening your account…"
            />
          </form>

          <div className="form-foot" style={{ marginTop: 20 }}>
            <Link className="text-link" href="/forgot-password">
              Forgot password?
            </Link>
            <Link className="text-link" href={signupHref}>
              New to Orbit? Create account
            </Link>
          </div>
        </div>
      </section>

      <aside className="auth-art" aria-hidden="true">
        <div className="auth-quote">
          <span className="eyebrow">
            {invitationFlow ? "Identity → invitation → access" : "Sign in → access → workspace"}
          </span>
          <p>
            {invitationFlow
              ? "An invitation can grant authority. Authentication alone cannot."
              : "One entrance for people who already have an Orbit identity."}
          </p>
          <span className="system-state">
            <Sparkles size={13} /> Orbit routes you by verified access
          </span>
          <span className="sr-only"><LockKeyhole /> Secure account sign in.</span>
        </div>
      </aside>
    </main>
  );
}
