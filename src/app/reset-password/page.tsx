import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { updatePassword } from "@/app/auth/actions";
import { Notice } from "@/components/Notice";
import { OrbitMark } from "@/components/OrbitMark";
import { PasswordField } from "@/components/PasswordField";
import { SubmitButton } from "@/components/SubmitButton";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Set a new password",
  robots: { index: false, follow: false },
};

type PageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function ResetPasswordPage({ searchParams }: PageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/forgot-password?error=That%20reset%20link%20is%20invalid%20or%20expired.");
  const params = await searchParams;

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <Link href="/" aria-label="Orbit home"><OrbitMark /></Link>
        <div className="auth-form">
          <span className="eyebrow">Secure credential change</span>
          <h1>Choose a new password.</h1>
          <p>
            Use at least 12 characters. When it changes, Orbit revokes your active
            sessions and asks you to sign in again.
          </p>
          <Notice error={params.error} />
          <form className="form-stack" action={updatePassword}>
            <div className="field">
              <label htmlFor="password">New password</label>
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
            <SubmitButton idleLabel="Update password" pendingLabel="Securing your account…" />
          </form>
        </div>
      </section>
      <aside className="auth-art" aria-hidden="true">
        <div className="auth-quote">
          <span className="eyebrow">Session control</span>
          <p>A new credential closes old sessions before you return to the workspace.</p>
        </div>
      </aside>
    </main>
  );
}
