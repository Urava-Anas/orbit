import type { Metadata } from "next";
import Link from "next/link";
import { requestPasswordReset } from "@/app/auth/actions";
import { Notice } from "@/components/Notice";
import { OrbitMark } from "@/components/OrbitMark";

export const metadata: Metadata = {
  title: "Recover access",
  robots: { index: false, follow: false },
};

type PageProps = {
  searchParams: Promise<{ error?: string; notice?: string }>;
};

export default async function ForgotPasswordPage({ searchParams }: PageProps) {
  const params = await searchParams;

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <Link href="/">
          <OrbitMark />
        </Link>
        <div className="auth-form">
          <span className="eyebrow">Account recovery</span>
          <h1>Recover access.</h1>
          <p>Orbit will send a time-limited password reset link to your email.</p>
          <Notice error={params.error} notice={params.notice} />
          <form className="form-stack" action={requestPasswordReset}>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                maxLength={254}
                required
              />
            </div>
            <button className="button button-primary" type="submit">
              Send secure reset link
            </button>
          </form>
          <div className="form-foot" style={{ marginTop: 20 }}>
            <Link className="text-link" href="/login">
              Return to sign in
            </Link>
          </div>
        </div>
      </section>
      <aside className="auth-art" aria-hidden="true">
        <div className="auth-quote">
          <span className="eyebrow">Security boundary</span>
          <p>Recovery reveals nothing about whether an account exists.</p>
        </div>
      </aside>
    </main>
  );
}
