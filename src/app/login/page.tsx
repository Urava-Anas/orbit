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
  const nextPath = params.next === "/trial" ? "/trial" : null;
  const context = await getOrbitAccess();

  if (context) {
    if (nextPath) redirect(nextPath);
    redirect(orbitHomePath(context.access));
  }

  const isTrialIntent = nextPath === "/trial";

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <Link href="/" aria-label="Orbit home">
          <OrbitMark />
        </Link>

        <div className="auth-form">
          <span className="eyebrow">
            {isTrialIntent ? "Start your 15-day Business trial" : "Your Orbit workspace"}
          </span>
          <h1>{isTrialIntent ? "Enter Orbit." : "Welcome back."}</h1>
          <p>
            {isTrialIntent
              ? "Sign in once, then create the organisation workspace your trial will run on."
              : "Continue once. Orbit will identify your organisation and role automatically."}
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
                minLength={12}
                maxLength={128}
                required
                placeholder="Your password"
              />
            </div>
            <SubmitButton
              idleLabel={isTrialIntent ? "Continue to trial setup" : "Continue to Orbit"}
              pendingLabel={isTrialIntent ? "Preparing your trial…" : "Opening your workspace…"}
            />
          </form>

          <div className="form-foot" style={{ marginTop: 20 }}>
            <span className="auth-invite-note">
              <LockKeyhole aria-hidden="true" size={13} /> Access follows your verified role.
            </span>
            <Link className="text-link" href="/forgot-password">
              Forgot password?
            </Link>
          </div>
        </div>
      </section>

      <aside className="auth-art" aria-hidden="true">
        <div className="auth-quote">
          <span className="eyebrow">
            {isTrialIntent ? "15 days · Business · real workspace" : "Sign in → role → workspace"}
          </span>
          <p>
            {isTrialIntent
              ? "Test the operating system with the same Business layer you would actually run."
              : "One entrance. No second open button. No detour through the marketing site."}
          </p>
          <span className="system-state">
            <Sparkles size={13} /> {isTrialIntent ? "No payment method required yet" : "Orbit routes you automatically"}
          </span>
        </div>
      </aside>
    </main>
  );
}
