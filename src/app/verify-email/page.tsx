import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, Mail, ShieldCheck } from "lucide-react";
import { OrbitMark } from "@/components/OrbitMark";
import {
  isInvitationReturnPath,
  safeAuthReturnPath,
} from "@/lib/auth-return-path";

export const metadata: Metadata = {
  title: "Verify your email",
  robots: { index: false, follow: false },
};

type VerifyEmailPageProps = {
  searchParams: Promise<{ next?: string }>;
};

export default async function VerifyEmailPage({ searchParams }: VerifyEmailPageProps) {
  const params = await searchParams;
  const nextPath = safeAuthReturnPath(params.next);
  const invitationFlow = isInvitationReturnPath(nextPath);
  const signupHref = invitationFlow && nextPath
    ? `/signup?next=${encodeURIComponent(nextPath)}`
    : "/signup";
  const loginHref = invitationFlow && nextPath
    ? `/login?next=${encodeURIComponent(nextPath)}`
    : "/login";

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
            {invitationFlow
              ? "We sent a secure confirmation link. Open it on this device and Orbit will return you to the invitation before any organisation access is granted."
              : "We sent a secure confirmation link. Open it on this device and Orbit will bring you straight into company setup. Your trial has not started yet."}
          </p>

          <div className="auth-role-row" aria-label="What happens next">
            <span><Mail size={13} /> Open the confirmation email</span>
            <span><CheckCircle2 size={13} /> Confirm your address</span>
            <span><ShieldCheck size={13} /> {invitationFlow ? "Review invitation" : "Continue to setup"}</span>
          </div>

          <div className="form-foot" style={{ marginTop: 20 }}>
            <Link className="text-link" href={signupHref}>
              Use a different account
            </Link>
            <Link className="text-link" href={loginHref}>
              Already verified? Sign in
            </Link>
          </div>
        </div>
      </section>

      <aside className="auth-art" aria-hidden="true">
        <div className="auth-quote">
          <span className="eyebrow">Identity first</span>
          <p>
            {invitationFlow
              ? "Verification proves identity. The invitation separately grants organisation access."
              : "One verified person identity. Organisation access comes after it."}
          </p>
          <span className="system-state">
            {invitationFlow ? "No access granted yet" : "Trial clock still paused"}
          </span>
        </div>
      </aside>
    </main>
  );
}
