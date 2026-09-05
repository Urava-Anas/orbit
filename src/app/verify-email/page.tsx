import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, Mail, ShieldCheck } from "lucide-react";
import { OrbitMark } from "@/components/OrbitMark";

export const metadata: Metadata = {
  title: "Verify your email",
  robots: { index: false, follow: false },
};

export default function VerifyEmailPage() {
  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <Link href="/" aria-label="Orbit home">
          <OrbitMark />
        </Link>

        <div className="auth-form">
          <span className="eyebrow">Verify your identity</span>
          <h1>Check your inbox.</h1>
          <p>
            We sent a secure confirmation link. Open it on this device and Orbit will
            bring you straight into company setup. Your trial has not started yet.
          </p>

          <div className="auth-role-row" aria-label="What happens next">
            <span><Mail size={13} /> Open the confirmation email</span>
            <span><CheckCircle2 size={13} /> Confirm your address</span>
            <span><ShieldCheck size={13} /> Continue to setup</span>
          </div>

          <div className="form-foot" style={{ marginTop: 20 }}>
            <Link className="text-link" href="/signup">
              Use a different account
            </Link>
            <Link className="text-link" href="/login">
              Already verified? Sign in
            </Link>
          </div>
        </div>
      </section>

      <aside className="auth-art" aria-hidden="true">
        <div className="auth-quote">
          <span className="eyebrow">Identity first</span>
          <p>One verified person identity. Organisation access comes after it.</p>
          <span className="system-state">Trial clock still paused</span>
        </div>
      </aside>
    </main>
  );
}
