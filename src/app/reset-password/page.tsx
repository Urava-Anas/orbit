import type { Metadata } from "next";
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

  if (!user) redirect("/login?error=Reset%20link%20expired");
  const params = await searchParams;

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <OrbitMark />
        <div className="auth-form">
          <span className="eyebrow">New credential</span>
          <h1>Reset password.</h1>
          <p>
            Use at least 12 characters. Updating it will revoke your other active
            Orbit sessions.
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
              />
            </div>
            <SubmitButton
              idleLabel="Update password"
              pendingLabel="Updating password…"
            />
          </form>
        </div>
      </section>
      <aside className="auth-art" aria-hidden="true">
        <div className="auth-quote">
          <span className="eyebrow">Session control</span>
          <p>A changed credential should close every door you no longer trust.</p>
        </div>
      </aside>
    </main>
  );
}
