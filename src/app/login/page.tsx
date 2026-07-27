import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { OrbitMark } from "@/components/OrbitMark";
import { Notice } from "@/components/Notice";
import { PasswordField } from "@/components/PasswordField";
import { SubmitButton } from "@/components/SubmitButton";
import { login, signup } from "@/app/auth/actions";
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
            {isSignup ? "Create organisation" : "Secure access"}
          </span>
          <h1>{isSignup ? "Start with control." : "Welcome back."}</h1>
          <p>
            {isSignup
              ? "Create the organisation boundary that will hold your real operating data, decisions, workflows, and future team access."
              : "Sign in to your private founder command system."}
          </p>

          <Notice error={params.error} notice={params.notice} />

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
                placeholder="founder@company.com"
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
              {isSignup ? "I already have an account" : "Create an account"}
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
          <span className="eyebrow">Orbit principle 01</span>
          <p>
            The founder stays in control. Every signal must resolve to evidence,
            authority, and a real organisation record.
          </p>
        </div>
      </aside>
    </main>
  );
}
