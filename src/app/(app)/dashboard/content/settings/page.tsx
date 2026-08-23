import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Power,
  Settings2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { contentGenerationConfigured } from "@/lib/content-engine";
import { requireWorkspace } from "@/lib/workspace";
import { setPublishingMode } from "../actions";
import styles from "./settings.module.css";

export const metadata: Metadata = {
  title: "Content Engine Settings · Orbit",
  description: "Content Engine automation, publishing and safety controls.",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ notice?: string; error?: string }>;

type Asset = { kind?: string; id?: string; username?: string | null; name?: string | null; page_id?: string | null };

function Status({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return <span className={ok ? styles.good : styles.warn}>{ok ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}{children}</span>;
}

export default async function ContentEngineSettingsPage({ searchParams }: { searchParams: SearchParams }) {
  const query = await searchParams;
  const { supabase, workspace, role } = await requireWorkspace();
  const canManage = role === "owner" || role === "admin";

  const [profileResult, connectionResult] = await Promise.all([
    supabase
      .from("content_brand_profiles")
      .select("publishing_enabled,daily_generation_enabled,approval_required,timezone,daily_target_count")
      .eq("workspace_id", workspace.id)
      .maybeSingle(),
    supabase
      .from("integration_connections")
      .select("status,provider_account_name,metadata,selected_assets")
      .eq("workspace_id", workspace.id)
      .eq("provider", "meta")
      .maybeSingle(),
  ]);

  const profile = profileResult.data;
  const connection = connectionResult.data;
  const metadata = (connection?.metadata ?? {}) as Record<string, unknown>;
  const capabilities = Array.isArray(metadata.verifiedCapabilities) ? metadata.verifiedCapabilities.map(String) : [];
  const assets = Array.isArray(connection?.selected_assets) ? (connection.selected_assets as Asset[]) : [];
  const instagramAccounts = assets.filter((asset) => asset.kind === "instagram_account" && asset.id && asset.page_id);
  const facebookPages = assets.filter((asset) => asset.kind === "facebook_page" && asset.id);

  const aiReady = contentGenerationConfigured();
  const profileReady = Boolean(profile);
  const metaConnected = connection?.status === "connected";
  const instagramReady = metaConnected && capabilities.includes("instagram.publish") && instagramAccounts.length === 1;
  const facebookReady = metaConnected && capabilities.includes("facebook.publish") && facebookPages.length === 1;
  const deploymentMaster = process.env.CONTENT_PUBLISHING_ENABLED === "true";
  const workspacePublishing = profile?.publishing_enabled === true;
  const approvalLocked = profile?.approval_required === true;
  const allSafetyGates = profileReady && approvalLocked && deploymentMaster && metaConnected;

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div>
          <span className={styles.eyebrow}><Settings2 size={14} /> Control plane</span>
          <h1>Content Engine Settings</h1>
          <p>One place to see whether generation, founder approval and real provider delivery are actually ready. Orbit fails closed when any required gate is missing.</p>
        </div>
        <Status ok={allSafetyGates}>{allSafetyGates ? "Production rails ready" : "One or more rails need attention"}</Status>
      </header>

      {query.notice ? <div className={styles.notice}><CheckCircle2 size={15} />{query.notice}</div> : null}
      {query.error ? <div className={`${styles.notice} ${styles.error}`}><AlertTriangle size={15} />{query.error}</div> : null}

      <section className={styles.grid}>
        <article className={styles.panel}>
          <div className={styles.panelTitle}><Sparkles size={16} /><div><strong>Generation</strong><small>Daily idea → platform-specific draft</small></div></div>
          <div className={styles.checks}>
            <Status ok={aiReady}>{aiReady ? "OpenAI generation configured" : "OPENAI_API_KEY is missing"}</Status>
            <Status ok={profileReady}>{profileReady ? "Brand Brain persisted" : "Brand Brain must be saved"}</Status>
            <Status ok={profile?.daily_generation_enabled === true}>{profile?.daily_generation_enabled ? "Daily generation enabled" : "Daily generation is off"}</Status>
            <Status ok={approvalLocked}>{approvalLocked ? "Founder approval is mandatory" : "Approval policy is not locked"}</Status>
          </div>
          <div className={styles.meta}>{profile ? `${profile.daily_target_count} pieces/day · ${profile.timezone}` : "No workspace profile yet"}</div>
          <Link className={styles.link} href="/dashboard/content#brand-brain">Review Brand Brain <ExternalLink size={12} /></Link>
        </article>

        <article className={styles.panel}>
          <div className={styles.panelTitle}><ShieldCheck size={16} /><div><strong>Meta delivery</strong><small>Verified capabilities, not assumed access</small></div></div>
          <div className={styles.checks}>
            <Status ok={metaConnected}>{metaConnected ? connection?.provider_account_name || "Meta connected" : "Meta connection required"}</Status>
            <Status ok={instagramReady}>{instagramReady ? `Instagram ready · ${instagramAccounts[0]?.username || instagramAccounts[0]?.name || "selected account"}` : "Instagram publishing capability/account not ready"}</Status>
            <Status ok={facebookReady}>{facebookReady ? `Facebook ready · ${facebookPages[0]?.name || "selected Page"}` : "Facebook publishing capability/Page not ready"}</Status>
            <Status ok={deploymentMaster}>{deploymentMaster ? "Deployment publishing master switch ON" : "Deployment publishing master switch OFF"}</Status>
          </div>
          <Link className={styles.link} href="/dashboard/plugins">Open Plugins & Connections <ExternalLink size={12} /></Link>
        </article>
      </section>

      <section className={styles.killSwitch}>
        <div>
          <span className={styles.sectionLabel}><Power size={14} /> Workspace publishing kill switch</span>
          <h2>{workspacePublishing ? "Automatic publishing is armed" : "Automatic publishing is off"}</h2>
          <p>Turning this on never bypasses founder approval, provider capability checks, the deployment master switch, media readiness, scheduling, idempotency or the durable worker queue. Turning it off stops new claims and blocks queued retries.</p>
        </div>
        {canManage ? (
          <form action={setPublishingMode} className={styles.switchForm}>
            <label>
              <input name="publishingEnabled" type="checkbox" defaultChecked={workspacePublishing} />
              <span><strong>{workspacePublishing ? "Armed" : "Off"}</strong><small>Save to apply workspace-wide</small></span>
            </label>
            <button type="submit">Save publishing mode</button>
          </form>
        ) : <span className={styles.meta}>Owner/admin permission required</span>}
      </section>

      <section className={styles.channels}>
        <div className={styles.sectionHead}><div><span className={styles.sectionLabel}>Channel policy</span><h2>What Orbit will automate today</h2></div><small>Unsupported adapters remain blocked instead of being simulated.</small></div>
        <div className={styles.channelRows}>
          <div><strong>Instagram</strong><span>Generation · image generation · approval · scheduling · publishing · insights · learning</span><Status ok={instagramReady}>Automatic rail</Status></div>
          <div><strong>Facebook</strong><span>Generation · approval · scheduling · Page text/photo publishing</span><Status ok={facebookReady}>Automatic rail</Status></div>
          <div><strong>LinkedIn</strong><span>Generation · approval · library · controlled manual distribution</span><Status ok={false}>Publishing adapter gated</Status></div>
          <div><strong>TikTok</strong><span>Generation · creative brief · approval · library · controlled manual distribution</span><Status ok={false}>Publishing adapter gated</Status></div>
        </div>
      </section>
    </main>
  );
}
