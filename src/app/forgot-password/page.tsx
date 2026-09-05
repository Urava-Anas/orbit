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
        <Link href="/" aria-label="Orbit home">
          <OrbitMark />
        </Link>
        <div className="auth-form">
          <span className="eyebrow">Existing account recovery</span>
          <h1>Recover access.</h1>
          <p>
            Enter the email you previously used for Orbit. For security, the response
            is the same whether or not an account exists.
          </p>
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
                placeholder="you@example.com"
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
            <Link className="text-link" href="/signup">
              Never had an Orbit account? Create one
            </Link>
          </div>
        </div>
      </section>
      <aside className="auth-art" aria-hidden="true">
        <div className="auth-quote">
          <span className="eyebrow">Private by design</span>
          <p>Recovery helps the owner without confirming who does or does not use Orbit.</p>
        </div>
      </aside>
    </main>
  );
}
