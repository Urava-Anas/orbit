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
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const context = await getOrbitAccess();
  if (context) redirect(orbitHomePath(context.access));

  const params = await searchParams;

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <Link href="/" aria-label="Orbit home">
          <OrbitMark />
        </Link>

        <div className="auth-form">
          <span className="eyebrow">Your Orbit workspace</span>
          <h1>Welcome back.</h1>
          <p>Continue once. Orbit will identify your organisation and role automatically.</p>

          <Notice error={params.error} notice={params.notice} />

          <form className="oauth-form" action={signInWithGoogle}>
            <GoogleSignInButton />
          </form>

          <div className="auth-divider">
            <span>or use email</span>
          </div>

          <form className="form-stack" action={login}>
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
              idleLabel="Continue to Orbit"
              pendingLabel="Opening your workspace…"
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
          <span className="eyebrow">Sign in → role → workspace</span>
          <p>One entrance. No second open button. No detour through the marketing site.</p>
          <span className="system-state">
            <Sparkles size={13} /> Orbit routes you automatically
          </span>
        </div>
      </aside>
    </main>
  );
}
