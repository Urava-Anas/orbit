import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, MailCheck, ShieldCheck } from "lucide-react";
import { Notice } from "@/components/Notice";
import { requireWorkspace } from "@/lib/workspace";
import { stageFourProviderReadinessForWorkspace } from "@/lib/agents/stage4-providers";
import { saveOutboundEmailProvider } from "./actions";

export const metadata: Metadata = {
  title: "Outbound Email Provider",
  robots: { index: false, follow: false },
};

type Props = {
  searchParams: Promise<{ error?: string; notice?: string }>;
};

export default async function OutboundEmailPage({ searchParams }: Props) {
  const params = await searchParams;
  const { workspace, role } = await requireWorkspace();
  const readiness = await stageFourProviderReadinessForWorkspace(workspace.id);
  const canManage = ["owner", "admin"].includes(role);

  return (
    <div className="page">
      <Link className="button button-quiet" href="/dashboard/settings">
        <ArrowLeft size={15} /> Back to settings
      </Link>

      <section className="panel" style={{ maxWidth: 780 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <span className="icon-button"><MailCheck size={18} /></span>
          <div>
            <div className="eyebrow">Stage 4 outbound provider</div>
            <h1 style={{ margin: "4px 0" }}>Outbound Email</h1>
            <p style={{ margin: 0 }}>
              Connect a workspace-owned Resend sender for governed proposal,
              outreach and follow-up delivery.
            </p>
          </div>
        </div>
      </section>

      <Notice error={params.error} notice={params.notice} />

      <section className="settings-grid" style={{ maxWidth: 1100 }}>
        <article className="panel settings-card">
          <h2>Provider readiness</h2>
          <dl>
            <div><dt>Provider</dt><dd>Resend</dd></div>
            <div><dt>Status</dt><dd>{readiness.email.configured ? "Configured" : "Not configured"}</dd></div>
            <div><dt>Reason</dt><dd>{readiness.email.reason}</dd></div>
          </dl>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start", marginTop: 16 }}>
            <ShieldCheck size={16} />
            <small>
              The API key is written directly into workspace Vault and is never
              returned to this page.
            </small>
          </div>
        </article>

        <article className="panel settings-card">
          <h2>{readiness.email.configured ? "Replace provider credentials" : "Connect Resend"}</h2>
          <p>Use a Resend API key and a sender address already verified by Resend.</p>
          {canManage ? (
            <form action={saveOutboundEmailProvider} style={{ display: "grid", gap: 12 }}>
              <label>
                <span>Resend API key</span>
                <input
                  type="password"
                  name="apiKey"
                  autoComplete="off"
                  placeholder="re_••••••••••••••••"
                  required
                />
              </label>
              <label>
                <span>Verified sender</span>
                <input
                  type="text"
                  name="emailFrom"
                  placeholder="Urava <hello@yourdomain.com>"
                  required
                />
              </label>
              <button className="button" type="submit">
                Save securely
              </button>
            </form>
          ) : (
            <p>Owner or admin authority is required to change provider credentials.</p>
          )}
        </article>
      </section>
    </div>
  );
}
