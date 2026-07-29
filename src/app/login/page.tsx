import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Crown, GraduationCap } from "lucide-react";
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
          <span className="eyebrow">One secure entrance</span>
          <h1>Welcome to Orbit.</h1>
          <p>
            Sign in once. Orbit securely opens your Founder Command or private
            Student space automatically.
          </p>

          <div className="auth-role-row" aria-label="Orbit workspaces">
            <span>
              <Crown aria-hidden="true" size={16} />
              Founder command
            </span>
            <span>
              <GraduationCap aria-hidden="true" size={17} />
              Student space
            </span>
          </div>

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
                placeholder="Minimum 12 characters"
              />
            </div>
            <SubmitButton
              idleLabel="Sign in to Orbit"
              pendingLabel="Opening your workspace…"
            />
          </form>

          <div className="form-foot" style={{ marginTop: 20 }}>
            <span className="auth-invite-note">Access is managed by Urava.</span>
            <Link className="text-link" href="/forgot-password">
              Forgot password?
            </Link>
          </div>
        </div>
      </section>

      <aside className="auth-art" aria-hidden="true">
        <div className="auth-quote">
          <span className="eyebrow">One door, correct workspace</span>
          <p>
            One secure entrance. Founder command and Student learning stay
            clearly separated.
          </p>
        </div>
      </aside>
    </main>
  );
}
