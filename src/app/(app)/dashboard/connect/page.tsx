import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  KeyRound,
  Link2,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
  SiGithub,
  SiGoogle,
  SiGoogleanalytics,
  SiLinkedin,
  SiMeta,
  SiOpenai,
  SiVercel,
} from "react-icons/si";
import { OrbitActionKeyManager } from "@/components/foundry/OrbitActionKeyManager";
import { formatFoundryDate, requireFounderFoundry } from "@/lib/foundry";
import {
  githubAppReady,
  vercelIntegrationReady,
} from "@/lib/integration-connections";
import { listOrbitActionKeys } from "@/lib/orbit-actions";
import { revokeOrbitActionKeyAction } from "../foundry/integrations/actions";
import styles from "./connect.module.css";

export const metadata: Metadata = {
  title: "Connect · Orbit",
  robots: { index: false, follow: false },
};

const orbitUrl = "https://orbit-two-delta.vercel.app";
const schemaUrl = `${orbitUrl}/orbit-gpt-actions.openapi.json`;
const githubSetupUrl = "https://github.com/settings/apps/new";

type ConnectionStatus = "connected" | "available" | "pending";
type ProviderId =
  | "github"
  | "vercel"
  | "google_search_console"
  | "google_analytics"
  | "meta"
  | "linkedin"
  | "operator";

type ConnectionRecord = {
  provider: string;
  status: "connected" | "attention" | "disconnected";
  provider_installation_id: string | null;
  provider_account_id: string | null;
  provider_account_name: string | null;
  provider_account_type: string | null;
  selected_assets: unknown;
  metadata: unknown;
  connected_at: string;
  updated_at: string;
};

type Provider = {
  id: ProviderId;
  name: string;
  category: string;
  description: string;
  usedBy: string[];
  logo: ReactNode;
  logoTone: string;
  connectPath?: string;
  manageUrl?: string;
  platformReady: boolean;
};

type PageProps = {
  searchParams: Promise<{
    integration?: string;
    notice?: string;
    error?: string;
  }>;
};

function statusClass(status: ConnectionStatus) {
  if (status === "connected") return styles.connected;
  if (status === "available") return styles.available;
  return styles.pending;
}

function statusLabel(status: ConnectionStatus) {
  if (status === "connected") return "Connected";
  if (status === "available") return "Ready";
  return "Setup required";
}

function assetList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
    .map((item) => ({
      id: String(item.id ?? item.name ?? item.fullName ?? "asset"),
      name: String(item.fullName ?? item.name ?? "Connected asset"),
      detail:
        typeof item.framework === "string"
          ? item.framework
          : item.private === true
            ? "Private repository"
            : item.private === false
              ? "Repository"
              : "Approved project",
      url: typeof item.url === "string" ? item.url : null,
    }));
}

function messageFor(code: string | undefined) {
  const messages: Record<string, string> = {
    github_connected: "GitHub connected. Orbit can now use only the repositories approved during installation.",
    vercel_connected: "Vercel connected. Orbit stored the installation securely and can use the approved account/projects.",
    github_disconnected: "GitHub access was disconnected from Orbit.",
    vercel_disconnected: "Vercel access was disconnected from Orbit.",
  };
  return code ? messages[code] ?? "Connection updated." : null;
}

function errorFor(code: string | undefined) {
  const messages: Record<string, string> = {
    github_platform_setup: "Orbit's GitHub App still needs its one-time product-owner registration before normal users can connect.",
    vercel_platform_setup: "Orbit's Vercel Integration still needs its one-time product-owner registration before normal users can connect.",
    github_oauth_incomplete: "GitHub did not return a complete installation response. Try connecting again.",
    github_state_mismatch: "GitHub connection validation failed. Start the connection again from Orbit.",
    github_installation_unverified: "Orbit could not verify that GitHub App installation.",
    github_installation_token_failed: "GitHub installed the app, but Orbit could not obtain temporary installation access.",
    github_save_failed: "GitHub was authorized, but Orbit could not save the installation.",
    github_callback_failed: "GitHub connection failed before completion. Try again.",
    vercel_oauth_incomplete: "Vercel did not return a complete authorization response. Try connecting again.",
    vercel_state_mismatch: "Vercel connection validation failed. Start the connection again from Orbit.",
    vercel_oauth_exchange: "Vercel authorization could not be completed. Try again.",
    vercel_save_failed: "Vercel was authorized, but Orbit could not save the installation.",
    vercel_callback_failed: "Vercel connection failed before completion. Try again.",
    integration_disconnect_failed: "Orbit could not safely disconnect that provider. Manage access at the provider and try again.",
  };
  return code ? messages[code] ?? "The integration could not be completed." : null;
}

export default async function OrbitConnectPage({ searchParams }: PageProps) {
  const [query, foundry] = await Promise.all([searchParams, requireFounderFoundry()]);
  const { supabase, workspace, role } = foundry;
  const [keys, connectionsResult] = await Promise.all([
    listOrbitActionKeys(supabase, workspace.id),
    supabase
      .from("integration_connections")
      .select(
        "provider,status,provider_installation_id,provider_account_id,provider_account_name,provider_account_type,selected_assets,metadata,connected_at,updated_at",
      )
      .eq("workspace_id", workspace.id),
  ]);

  const activeKeys = keys.filter((key) => key.is_active);
  const connections = (connectionsResult.data ?? []) as ConnectionRecord[];
  const connectionsByProvider = new Map(connections.map((item) => [item.provider, item]));
  const isOrbitPlatformOwner = role === "owner" && workspace.slug === "urava";

  const providers: Provider[] = [
    {
      id: "github",
      name: "GitHub",
      category: "Code & repositories",
      description: "Authorize repository access with the Orbit GitHub App. Users choose exactly which repositories Orbit may use.",
      usedBy: ["Website Manager", "Delivery", "Automation"],
      logo: <SiGithub aria-hidden="true" />,
      logoTone: styles.github,
      connectPath: "/api/integrations/github/start",
      manageUrl: "https://github.com/settings/installations",
      platformReady: githubAppReady(),
    },
    {
      id: "vercel",
      name: "Vercel",
      category: "Deployments & projects",
      description: "Connect a Vercel account or team and approve the projects Orbit may deploy, inspect and operate.",
      usedBy: ["Website Manager", "Delivery", "Production"],
      logo: <SiVercel aria-hidden="true" />,
      logoTone: styles.vercel,
      connectPath: "/api/integrations/vercel/start",
      manageUrl: "https://vercel.com/dashboard/integrations",
      platformReady: vercelIntegrationReady(),
    },
    {
      id: "google_search_console",
      name: "Search Console",
      category: "SEO & indexing",
      description: "Connect verified website properties for indexing health, search visibility and SEO operations.",
      usedBy: ["Website Manager", "SEO", "Growth"],
      logo: <SiGoogle aria-hidden="true" />,
      logoTone: styles.google,
      platformReady: false,
    },
    {
      id: "google_analytics",
      name: "Google Analytics",
      category: "Traffic & conversion",
      description: "Connect Analytics properties for traffic, behaviour, conversion and acquisition reporting inside Orbit.",
      usedBy: ["Website Manager", "Growth", "Evidence"],
      logo: <SiGoogleanalytics aria-hidden="true" />,
      logoTone: styles.analytics,
      platformReady: false,
    },
    {
      id: "meta",
      name: "Meta",
      category: "Facebook & Instagram",
      description: "Connect Meta Business assets, Facebook Pages and Instagram accounts through one approval flow.",
      usedBy: ["Lead Engine", "Marketing", "Publishing"],
      logo: <SiMeta aria-hidden="true" />,
      logoTone: styles.meta,
      platformReady: false,
    },
    {
      id: "linkedin",
      name: "LinkedIn",
      category: "Professional network",
      description: "Connect approved LinkedIn organisation assets for publishing, outreach and lead operations.",
      usedBy: ["Lead Engine", "Marketing", "Publishing"],
      logo: <SiLinkedin aria-hidden="true" />,
      logoTone: styles.linkedin,
      platformReady: false,
    },
    {
      id: "operator",
      name: "ChatGPT / Orbit Operator",
      category: "AI operator",
      description: "Founder-governed AI actions through revocable organisation-scoped Orbit credentials.",
      usedBy: ["Founder Command", "Orbit Operator", "Automation"],
      logo: <SiOpenai aria-hidden="true" />,
      logoTone: styles.openai,
      manageUrl: schemaUrl,
      platformReady: true,
    },
  ];

  const statusFor = (provider: Provider): ConnectionStatus => {
    if (provider.id === "operator") return activeKeys.length ? "connected" : "available";
    const record = connectionsByProvider.get(provider.id);
    if (record?.status === "connected") return "connected";
    if (provider.connectPath && provider.platformReady) return "available";
    return "pending";
  };

  const selectedId = providers.some((item) => item.id === query.integration)
    ? (query.integration as ProviderId)
    : "github";
  const selected = providers.find((item) => item.id === selectedId) ?? providers[0];
  const selectedStatus = statusFor(selected);
  const selectedRecord = connectionsByProvider.get(selected.id);
  const selectedAssets = assetList(selectedRecord?.selected_assets);
  const connectedCount = providers.filter((item) => statusFor(item) === "connected").length;
  const availableCount = providers.filter((item) => statusFor(item) === "available").length;
  const notice = messageFor(query.notice);
  const error = errorFor(query.error);

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <span className={styles.eyebrow}><Sparkles size={13} aria-hidden="true" /> Universal connections</span>
          <h1>Connect your tools.<br /><span>Orbit handles the complexity.</span></h1>
          <p>One permission model for every service: choose an account, choose assets, approve access, then manage everything from Orbit.</p>
        </div>
        <div className={styles.heroSecurity}>
          <LockKeyhole size={18} aria-hidden="true" />
          <div><strong>No manual API tokens</strong><small>Provider secrets stay server-side and are never shown to normal users.</small></div>
        </div>
      </section>

      {notice ? <div className={`${styles.notice} ${styles.noticeSuccess}`}>{notice}</div> : null}
      {error ? <div className={`${styles.notice} ${styles.noticeError}`}>{error}</div> : null}

      <section className={styles.summary} aria-label="Connection summary">
        <div><strong>{providers.length}</strong><span>Services</span></div>
        <div><strong>{connectedCount}</strong><span>Connected</span></div>
        <div><strong>{availableCount}</strong><span>Ready now</span></div>
        <div><strong>0</strong><span>Tokens to paste</span></div>
      </section>

      <section className={styles.catalog} id="integrations">
        <div className={styles.sectionHeader}>
          <div><span>Integration library</span><h2>Connected services</h2></div>
          <p>Select a service to connect it, review approved assets or manage its access.</p>
        </div>

        <div className={styles.providerGrid}>
          {providers.map((provider) => {
            const status = statusFor(provider);
            return (
              <Link
                key={provider.id}
                href={`/dashboard/connect?integration=${provider.id}#integrations`}
                className={`${styles.providerCard} ${selected.id === provider.id ? styles.providerCardActive : ""}`}
              >
                <span className={`${styles.providerLogo} ${provider.logoTone}`}>{provider.logo}</span>
                <span className={styles.providerIdentity}>
                  <strong>{provider.name}</strong>
                  <small>{provider.category}</small>
                </span>
                <span className={`${styles.statusBadge} ${statusClass(status)}`}>{statusLabel(status)}</span>
                <ArrowRight className={styles.cardArrow} size={15} aria-hidden="true" />
              </Link>
            );
          })}
        </div>
      </section>

      <section className={styles.detailShell}>
        <header className={styles.detailHeader}>
          <div className={styles.detailBrand}>
            <span className={`${styles.detailLogo} ${selected.logoTone}`}>{selected.logo}</span>
            <div>
              <span>{selected.category}</span>
              <h2>{selected.name}</h2>
              <p>{selected.description}</p>
            </div>
          </div>
          <span className={`${styles.detailStatus} ${statusClass(selectedStatus)}`}>
            <i aria-hidden="true" /> {statusLabel(selectedStatus)}
          </span>
        </header>

        {selected.id === "operator" ? (
          <div className={styles.operatorArea}>
            <div className={styles.operatorGrid}>
              <article className={styles.panel}>
                <div className={styles.panelTitle}><KeyRound size={17} aria-hidden="true" /><div><strong>Orbit Operator access</strong><small>Founder-only governed AI connection</small></div></div>
                <p>Generate a revocable organisation-scoped action key for Orbit Operator. Third-party business services continue to use OAuth/App installation instead of manual credentials.</p>
                <OrbitActionKeyManager />
              </article>
              <article className={styles.panel}>
                <div className={styles.panelTitle}><Link2 size={17} aria-hidden="true" /><div><strong>Connection recipe</strong><small>Private operator setup</small></div></div>
                <div className={styles.stepStack}>
                  <span><b>1</b>Create a private Orbit Operator GPT.</span>
                  <span><b>2</b>Import the Orbit OpenAPI schema.</span>
                  <span><b>3</b>Use the founder-only one-time action key.</span>
                  <span><b>4</b>Test read access before governed writes.</span>
                </div>
              </article>
            </div>

            <article className={styles.panel}>
              <div className={styles.panelTitle}><ShieldCheck size={17} aria-hidden="true" /><div><strong>Organisation action keys</strong><small>Revocable AI access</small></div></div>
              {keys.length ? (
                <div className={styles.keyList}>
                  {keys.map((key) => {
                    const inactive = !key.is_active;
                    return (
                      <div className={styles.keyRow} key={key.id}>
                        <span className={`${styles.keyState} ${inactive ? styles.keyInactive : styles.keyActive}`}>{key.revoked_at ? "Revoked" : inactive ? "Expired" : "Active"}</span>
                        <div><strong>{key.name}</strong><small>{key.token_prefix}… · Created {formatFoundryDate(key.created_at)}{key.last_used_at ? ` · Last used ${formatFoundryDate(key.last_used_at)}` : " · Not used yet"}</small></div>
                        {!key.revoked_at ? (
                          <form action={revokeOrbitActionKeyAction}>
                            <input name="keyId" type="hidden" value={key.id} />
                            <button className={styles.iconButton} title="Revoke this Orbit connection" type="submit"><Trash2 aria-hidden="true" size={15} /></button>
                          </form>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : <p>No Orbit Operator connection key has been created yet.</p>}
            </article>
          </div>
        ) : (
          <div className={styles.detailGrid}>
            <article className={styles.panel}>
              <div className={styles.panelTitle}>
                <Link2 size={17} aria-hidden="true" />
                <div><strong>{selectedStatus === "connected" ? "Connected account" : selectedStatus === "available" ? "Connect account" : "Connector setup"}</strong><small>Secure provider authorization</small></div>
              </div>

              {selectedStatus === "connected" && selectedRecord ? (
                <>
                  <div className={styles.accountCard}>
                    <span className={`${styles.accountLogo} ${selected.logoTone}`}>{selected.logo}</span>
                    <div><small>Connected as</small><strong>{selectedRecord.provider_account_name ?? `${selected.name} account`}</strong><span>{selectedRecord.provider_account_type ?? "Authorized installation"}</span></div>
                    <CheckCircle2 size={19} aria-hidden="true" />
                  </div>
                  <p className={styles.bodyCopy}>Orbit stores the provider installation securely. Secret credentials never appear in the browser.</p>
                  <div className={styles.actions}>
                    {selected.manageUrl ? <a className={styles.primaryAction} href={selected.manageUrl} target="_blank" rel="noreferrer">Manage access <ExternalLink size={12} /></a> : null}
                    <form action={`/api/integrations/${selected.id}/disconnect`} method="post"><button className={styles.secondaryAction} type="submit">Disconnect</button></form>
                  </div>
                </>
              ) : selected.connectPath && selected.platformReady ? (
                <>
                  <p className={styles.bodyCopy}>No credentials to copy. Orbit opens {selected.name}, you approve the account and assets, then you return here automatically.</p>
                  <div className={styles.flow}>
                    <span><b>1</b>Connect</span><i />
                    <span><b>2</b>Account</span><i />
                    <span><b>3</b>Assets</span><i />
                    <span><b>4</b>Approve</span><i />
                    <span><b>5</b>Return</span>
                  </div>
                  <div className={styles.actions}><a className={styles.primaryAction} href={selected.connectPath}>Connect {selected.name} <ArrowRight size={13} /></a></div>
                </>
              ) : selected.id === "github" && isOrbitPlatformOwner ? (
                <>
                  <div className={styles.setupCallout}><strong>One-time Orbit platform setup</strong><span>This is only for Urava as the product owner. Normal Orbit users will never see this step.</span></div>
                  <div className={styles.setupSteps}>
                    <span><b>01</b><div><strong>Register the GitHub App</strong><small>Developer Settings → GitHub Apps → New GitHub App</small></div></span>
                    <span><b>02</b><div><strong>Use Orbit as the app identity</strong><small>Homepage: {orbitUrl}</small></div></span>
                    <span><b>03</b><div><strong>Set the setup callback</strong><small>{orbitUrl}/api/integrations/github/callback</small></div></span>
                    <span><b>04</b><div><strong>Choose minimal repository permissions</strong><small>Allow users to install on selected repositories only.</small></div></span>
                  </div>
                  <div className={styles.actions}><a className={styles.primaryAction} href={githubSetupUrl} target="_blank" rel="noreferrer">Register Orbit GitHub App <ExternalLink size={12} /></a></div>
                </>
              ) : (
                <>
                  <div className={styles.setupCallout}><strong>Provider connector not enabled yet</strong><span>Orbit will use the same OAuth/App pattern here. Normal users will not paste API keys.</span></div>
                  <div className={styles.flow}>
                    <span><b>1</b>Connect</span><i />
                    <span><b>2</b>Account</span><i />
                    <span><b>3</b>Assets</span><i />
                    <span><b>4</b>Approve</span><i />
                    <span><b>5</b>Manage</span>
                  </div>
                </>
              )}
            </article>

            <article className={styles.panel}>
              <div className={styles.panelTitle}><ShieldCheck size={17} aria-hidden="true" /><div><strong>{selectedStatus === "connected" ? "Approved assets" : "Permission boundary"}</strong><small>Least-privilege by design</small></div></div>
              {selectedStatus === "connected" ? (
                selectedAssets.length ? (
                  <div className={styles.assetList}>
                    {selectedAssets.slice(0, 12).map((asset) => (
                      <div className={styles.assetRow} key={asset.id}>
                        <CheckCircle2 size={14} aria-hidden="true" />
                        <span><strong>{asset.name}</strong><small>{asset.detail}</small></span>
                        {asset.url ? <a href={asset.url} target="_blank" rel="noreferrer" aria-label={`Open ${asset.name}`}><ExternalLink size={12} /></a> : null}
                      </div>
                    ))}
                  </div>
                ) : <p className={styles.bodyCopy}>The provider installation is connected. Orbit will list approved assets here as soon as the provider exposes them.</p>
              ) : (
                <>
                  <p className={styles.bodyCopy}>Orbit asks only for access required by the modules below. Users can change or revoke provider access later.</p>
                  <div className={styles.usedBy}>{selected.usedBy.map((label) => <span key={label}>{label}</span>)}</div>
                  <div className={styles.securityNote}><LockKeyhole size={15} /><span><strong>Secrets stay private</strong><small>Credentials are stored server-side and never rendered to normal users.</small></span></div>
                </>
              )}
            </article>
          </div>
        )}
      </section>
    </main>
  );
}
