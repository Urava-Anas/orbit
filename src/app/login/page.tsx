import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Crown, GraduationCap } from "lucide-react";
import { OrbitMark } from "@/components/OrbitMark";
import { Notice } from "@/components/Notice";
import { PasswordField } from "@/components/PasswordField";
import { SubmitButton } from "@/components/SubmitButton";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { login, signInWithGoogle, signup } from "@/app/auth/actions";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

type LoginPageProps = {
  searchParams: Promise<{
    mode?: string;
    error?: string;
    notice?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) redirect("/dashboard");

  const params = await searchParams;
  const isSignup = params.mode === "signup";

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <Link href="/" aria-label="Orbit home">
          <OrbitMark />
        </Link>
        <div className="auth-form">
          <span className="eyebrow">
            {isSignup ? "Founder setup" : "One secure entrance"}
          </span>
          <h1>{isSignup ? "Start with control." : "Welcome to Orbit."}</h1>
          <p>
            {isSignup
              ? "Create the organisation boundary that will hold your real operating data, decisions, workflows, and future team access."
              : "One secure sign-in serves both Founder and Student access."}
          </p>

          {!isSignup ? (
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
          ) : null}

          <Notice error={params.error} notice={params.notice} />

          <form className="oauth-form" action={signInWithGoogle}>
            <GoogleSignInButton />
          </form>
          <div className="auth-divider">
            <span>{isSignup ? "or create with email" : "or use email"}</span>
          </div>

          <form className="form-stack" action={isSignup ? signup : login}>
            {isSignup ? (
              <>
                <div className="field">
                  <label htmlFor="fullName">Your name</label>
                  <input
                    id="fullName"
                    name="fullName"
                    autoComplete="name"
                    minLength={2}
                    maxLength={80}
                    required
                    placeholder="Mian Anas Arain"
                  />
                </div>
                <div className="field">
                  <label htmlFor="workspaceName">Organisation name</label>
                  <input
                    id="workspaceName"
                    name="workspaceName"
                    autoComplete="organization"
                    minLength={2}
                    maxLength={80}
                    required
                    placeholder="Urava"
                  />
                </div>
              </>
            ) : null}
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
                autoComplete={isSignup ? "new-password" : "current-password"}
                minLength={12}
                maxLength={128}
                required
                placeholder="Minimum 12 characters"
              />
            </div>
            <SubmitButton
              idleLabel={
                isSignup ? "Create secure organisation" : "Sign in to Orbit"
              }
              pendingLabel={
                isSignup ? "Creating organisation…" : "Signing in…"
              }
            />
          </form>

          <div className="form-foot" style={{ marginTop: 20 }}>
            <Link
              className="text-link"
              href={isSignup ? "/login" : "/login?mode=signup"}
            >
              {isSignup
                ? "I already have an account"
                : "Create a Founder workspace"}
            </Link>
            {!isSignup ? (
              <Link className="text-link" href="/forgot-password">
                Forgot password?
              </Link>
            ) : null}
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
