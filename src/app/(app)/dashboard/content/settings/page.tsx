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
type Asset = {
  kind?: string;
  id?: string;
  username?: string | null;
  name?: string | null;
  page_id?: string | null;
};
type Connection = {
  provider: string;
  status: string;
  provider_account_name: string | null;
  metadata: Record<string, unknown> | null;
  selected_assets: unknown;
};

function Status({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return <span className={ok ? styles.good : styles.warn}>{ok ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}{children}</span>;
}

function capabilitiesOf(connection: Connection | undefined) {
  const metadata = (connection?.metadata ?? {}) as Record<string, unknown>;
  return Array.isArray(metadata.verifiedCapabilities) ? metadata.verifiedCapabilities.map(String) : [];
}

function assetsOf(connection: Connection | undefined) {
  return Array.isArray(connection?.selected_assets) ? (connection.selected_assets as Asset[]) : [];
}

export default async function ContentEngineSettingsPage({ searchParams }: { searchParams: SearchParams }) {
  const query = await searchParams;
  const { supabase, workspace, role } = await requireWorkspace();
  const canManage = role === "owner" || role === "admin";

  const [profileResult, connectionsResult] = await Promise.all([
    supabase
      .from("content_brand_profiles")
      .select("publishing_enabled,daily_generation_enabled,approval_required,timezone,daily_target_count")
      .eq("workspace_id", workspace.id)
      .maybeSingle(),
    supabase
      .from("integration_connections")
      .select("provider,status,provider_account_name,metadata,selected_assets")
      .eq("workspace_id", workspace.id)
      .in("provider", ["meta", "linkedin", "tiktok", "google_analytics", "google_search_console"]),
  ]);
  if (profileResult.error || connectionsResult.error) {
    throw new Error("Content Engine connection readiness could not be loaded completely.");
  }

  const profile = profileResult.data;
  const connections = (connectionsResult.data ?? []) as Connection[];
  const byProvider = new Map(connections.map((connection) => [connection.provider, connection]));
  const meta = byProvider.get("meta");
  const linkedin = byProvider.get("linkedin");
  const tiktok = byProvider.get("tiktok");
  const analytics = byProvider.get("google_analytics");
  const searchConsole = byProvider.get("google_search_console");

  const metaCapabilities = capabilitiesOf(meta);
  const metaAssets = assetsOf(meta);
  const instagramAccounts = metaAssets.filter((asset) => asset.kind === "instagram_account" && asset.id && asset.page_id);
  const facebookPages = metaAssets.filter((asset) => asset.kind === "facebook_page" && asset.id);

  const linkedinCapabilities = capabilitiesOf(linkedin);
  const linkedinMembers = assetsOf(linkedin).filter((asset) => asset.kind === "linkedin_member" && asset.id);
  const tiktokCapabilities = capabilitiesOf(tiktok);
  const tiktokAccounts = assetsOf(tiktok).filter((asset) => asset.kind === "tiktok_account" && asset.id);
  const analyticsCapabilities = capabilitiesOf(analytics);
  const searchCapabilities = capabilitiesOf(searchConsole);

  const aiReady = contentGenerationConfigured();
  const profileReady = Boolean(profile);
  const metaConnected = meta?.status === "connected";
  const instagramReady = metaConnected && metaCapabilities.includes("instagram.publish") && instagramAccounts.length === 1;
  const facebookReady = metaConnected && metaCapabilities.includes("facebook.publish") && facebookPages.length === 1;
  const linkedinReady = linkedin?.status === "connected" && linkedinCapabilities.includes("linkedin.publish.member") && linkedinMembers.length === 1;
  const tiktokConnected = tiktok?.status === "connected" || tiktok?.status === "attention";
  const tiktokScopeReady = tiktokConnected && tiktokAccounts.length === 1 && (tiktokCapabilities.includes("tiktok.publish") || tiktokCapabilities.includes("tiktok.upload"));
  const analyticsReady = analytics?.status === "connected" && analyticsCapabilities.includes("analytics.read");
  const searchReady = searchConsole?.status === "connected" && searchCapabilities.includes("search_console.read");

  const deploymentMaster = process.env.CONTENT_PUBLISHING_ENABLED === "true";
  const workspacePublishing = profile?.publishing_enabled === true;
  const approvalLocked = profile?.approval_required === true;
  const anyVerifiedAutomaticRail = instagramReady || facebookReady || linkedinReady;
  const allSafetyGates = profileReady && approvalLocked && deploymentMaster && anyVerifiedAutomaticRail;

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div>
          <span className={styles.eyebrow}><Settings2 size={14} /> Control plane</span>
          <h1>Content Engine Settings</h1>
          <p>Generation, founder approval, publishing identities and intelligence sources meet here. Orbit distinguishes a real verified capability from a simple OAuth connection and fails closed when a provider requirement is missing.</p>
        </div>
        <Status ok={allSafetyGates}>{allSafetyGates ? "Verified automatic rail available" : "One or more production rails need attention"}</Status>
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
          <div className={styles.panelTitle}><ShieldCheck size={16} /><div><strong>Meta delivery</strong><small>Facebook + Instagram through verified Page capabilities</small></div></div>
          <div className={styles.checks}>
            <Status ok={metaConnected}>{metaConnected ? meta?.provider_account_name || "Meta connected" : "Meta connection required"}</Status>
            <Status ok={instagramReady}>{instagramReady ? `Instagram ready · ${instagramAccounts[0]?.username || instagramAccounts[0]?.name || "selected account"}` : "Instagram publishing capability/account not ready"}</Status>
            <Status ok={facebookReady}>{facebookReady ? `Facebook ready · ${facebookPages[0]?.name || "selected Page"}` : "Facebook publishing capability/Page not ready"}</Status>
          </div>
          <Link className={styles.link} href="/api/integrations/oauth/meta/start">Connect / verify Meta <ExternalLink size={12} /></Link>
        </article>

        <article className={styles.panel}>
          <div className={styles.panelTitle}><ShieldCheck size={16} /><div><strong>LinkedIn delivery</strong><small>Authenticated-member publishing, isolated from Meta</small></div></div>
          <div className={styles.checks}>
            <Status ok={linkedin?.status === "connected"}>{linkedin?.status === "connected" ? linkedin.provider_account_name || "LinkedIn connected" : "LinkedIn connection required"}</Status>
            <Status ok={linkedinReady}>{linkedinReady ? `Member publishing ready · ${linkedinMembers[0]?.name || "selected identity"}` : "w_member_social publishing capability not verified"}</Status>
          </div>
          <Link className={styles.link} href="/api/integrations/oauth/linkedin/start">Connect / verify LinkedIn <ExternalLink size={12} /></Link>
        </article>

        <article className={styles.panel}>
          <div className={styles.panelTitle}><ShieldCheck size={16} /><div><strong>TikTok connection</strong><small>Account + Content Posting scopes, with provider-required gates preserved</small></div></div>
          <div className={styles.checks}>
            <Status ok={tiktokConnected}>{tiktokConnected ? tiktok?.provider_account_name || "TikTok connected" : "TikTok connection required"}</Status>
            <Status ok={tiktokScopeReady}>{tiktokScopeReady ? "Content Posting scope granted" : "video.publish / video.upload capability not verified"}</Status>
            <Status ok={false}>Automatic TikTok posting stays blocked until creator-info consent, supported media flow and TikTok app audit are verified</Status>
          </div>
          <Link className={styles.link} href="/api/integrations/oauth/tiktok/start">Connect / verify TikTok <ExternalLink size={12} /></Link>
        </article>

        <article className={styles.panel}>
          <div className={styles.panelTitle}><Sparkles size={16} /><div><strong>Performance intelligence</strong><small>Read-only Google measurement sources</small></div></div>
          <div className={styles.checks}>
            <Status ok={analyticsReady}>{analyticsReady ? `Google Analytics connected · ${analytics?.provider_account_name || "verified account"}` : "Google Analytics read access not connected"}</Status>
            <Status ok={searchReady}>{searchReady ? `Search Console connected · ${searchConsole?.provider_account_name || "verified account"}` : "Search Console read access not connected"}</Status>
          </div>
          <div className={styles.meta}>These sources are read-only. They can inform strategy without gaining publishing authority.</div>
          <Link className={styles.link} href="/api/integrations/oauth/google_analytics/start">Connect Analytics <ExternalLink size={12} /></Link>
          <Link className={styles.link} href="/api/integrations/oauth/google_search_console/start">Connect Search Console <ExternalLink size={12} /></Link>
        </article>

        <article className={styles.panel}>
          <div className={styles.panelTitle}><Power size={16} /><div><strong>Deployment authority</strong><small>Global safety boundary</small></div></div>
          <div className={styles.checks}>
            <Status ok={deploymentMaster}>{deploymentMaster ? "Deployment publishing master switch ON" : "Deployment publishing master switch OFF"}</Status>
            <Status ok={workspacePublishing}>{workspacePublishing ? "Workspace publishing armed" : "Workspace publishing remains off"}</Status>
            <Status ok={anyVerifiedAutomaticRail}>{anyVerifiedAutomaticRail ? "At least one verified publishing rail" : "No automatic publishing rail is verified yet"}</Status>
          </div>
          <Link className={styles.link} href="/dashboard/plugins">Open all Plugins & Connections <ExternalLink size={12} /></Link>
        </article>
      </section>

      <section className={styles.killSwitch}>
        <div>
          <span className={styles.sectionLabel}><Power size={14} /> Workspace publishing kill switch</span>
          <h2>{workspacePublishing ? "Automatic publishing is armed" : "Automatic publishing is off"}</h2>
          <p>Turning this on never bypasses founder approval, provider capability checks, the deployment master switch, media readiness, scheduling, idempotency or durable worker queues. Turning it off stops new claims and blocks queued retries.</p>
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
        <div className={styles.sectionHead}><div><span className={styles.sectionLabel}>Channel policy</span><h2>What Orbit is allowed to automate</h2></div><small>A connection is never treated as permission to publish.</small></div>
        <div className={styles.channelRows}>
          <div><strong>Instagram</strong><span>Generation · image generation · visual approval · scheduling · publishing · insights · learning</span><Status ok={instagramReady}>Automatic rail</Status></div>
          <div><strong>Facebook</strong><span>Generation · approval · scheduling · Page text/photo publishing</span><Status ok={facebookReady}>Automatic rail</Status></div>
          <div><strong>LinkedIn</strong><span>Generation · approval · scheduling · authenticated-member text publishing</span><Status ok={linkedinReady}>Automatic member rail</Status></div>
          <div><strong>TikTok</strong><span>Generation · creative brief · approval · account capability verification; delivery remains provider-gated</span><Status ok={false}>Audit/media gate</Status></div>
          <div><strong>Google Analytics</strong><span>Read-only performance identity for strategy/intelligence adapters</span><Status ok={analyticsReady}>Intelligence source</Status></div>
          <div><strong>Search Console</strong><span>Read-only search-property identity for strategy/intelligence adapters</span><Status ok={searchReady}>Intelligence source</Status></div>
        </div>
      </section>
    </main>
  );
}
