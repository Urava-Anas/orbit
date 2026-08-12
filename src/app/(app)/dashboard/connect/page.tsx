import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import {
  BarChart3,
  Bot,
  CheckCircle2,
  Code2,
  ExternalLink,
  KeyRound,
  Link2,
  MessageCircle,
  Rocket,
  Search,
  Share2,
  ShieldCheck,
  Trash2,
} from "lucide-react";
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

const schemaUrl = "https://orbit-two-delta.vercel.app/orbit-gpt-actions.openapi.json";

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
  icon: ReactNode;
  connectPath?: string;
  providerUrl?: string;
  providerLabel?: string;
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
  if (status === "available") return styles.partial;
  return styles.notConnected;
}

function dotClass(status: ConnectionStatus) {
  if (status === "connected") return styles.dotConnected;
  if (status === "available") return styles.dotPartial;
  return styles.dotOff;
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
              : "Project",
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
    github_platform_setup: "GitHub connection is not available yet because the Orbit GitHub App still needs its one-time platform registration.",
    vercel_platform_setup: "Vercel connection is not available yet because the Orbit Vercel Integration still needs its one-time platform registration.",
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
  const { supabase, workspace } = foundry;
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

  const providers: Provider[] = [
    {
      id: "github",
      name: "GitHub",
      category: "Code & repositories",
      description: "Install the Orbit GitHub App, choose the repositories Orbit may access, and manage that permission from one place.",
      usedBy: ["Website Manager", "Delivery", "Automation"],
      icon: <Code2 aria-hidden="true" size={18} />,
      connectPath: "/api/integrations/github/start",
      providerUrl: "https://github.com/settings/installations",
      providerLabel: "Manage on GitHub",
      platformReady: githubAppReady(),
    },
    {
      id: "vercel",
      name: "Vercel",
      category: "Deployments & projects",
      description: "Authorize Orbit through Vercel, choose the account/team and project access, then return to Orbit automatically.",
      usedBy: ["Website Manager", "Delivery", "Production"],
      icon: <Rocket aria-hidden="true" size={18} />,
      connectPath: "/api/integrations/vercel/start",
      providerUrl: "https://vercel.com/dashboard/integrations",
      providerLabel: "Manage on Vercel",
      platformReady: vercelIntegrationReady(),
    },
    {
      id: "google_search_console",
      name: "Search Console",
      category: "SEO & indexing",
      description: "Choose a Google account and the verified website properties Orbit may read and manage.",
      usedBy: ["Website Manager", "SEO", "Growth"],
      icon: <Search aria-hidden="true" size={18} />,
      providerUrl: "https://search.google.com/search-console",
      providerLabel: "Open Search Console",
      platformReady: false,
    },
    {
      id: "google_analytics",
      name: "Google Analytics",
      category: "Traffic & conversion",
      description: "Choose the Google Analytics account and properties Orbit may use for traffic and conversion reporting.",
      usedBy: ["Website Manager", "Growth", "Evidence"],
      icon: <BarChart3 aria-hidden="true" size={18} />,
      providerUrl: "https://analytics.google.com",
      providerLabel: "Open Analytics",
      platformReady: false,
    },
    {
      id: "meta",
      name: "Meta",
      category: "Facebook & Instagram",
      description: "Authorize Meta once, then choose the Pages, Instagram accounts and business assets Orbit may use.",
      usedBy: ["Lead Engine", "Marketing", "Publishing"],
      icon: <Share2 aria-hidden="true" size={18} />,
      providerUrl: "https://business.facebook.com/settings",
      providerLabel: "Open Meta Business",
      platformReady: false,
    },
    {
      id: "linkedin",
      name: "LinkedIn",
      category: "Professional network",
      description: "Authorize LinkedIn and choose the organisation pages and approved account access Orbit may use.",
      usedBy: ["Lead Engine", "Marketing", "Publishing"],
      icon: <MessageCircle aria-hidden="true" size={18} />,
      providerUrl: "https://www.linkedin.com/mypreferences/d/third-party-applications",
      providerLabel: "Open LinkedIn",
      platformReady: false,
    },
    {
      id: "operator",
      name: "Orbit Operator / ChatGPT",
      category: "AI operator",
      description: "Advanced founder connection for governed AI actions through revocable organisation-scoped action keys.",
      usedBy: ["Founder Command", "Orbit Operator", "Automation"],
      icon: <Bot aria-hidden="true" size={18} />,
      providerUrl: schemaUrl,
      providerLabel: "Open Orbit schema",
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
    <main className={styles.hub}>
      <section className={styles.hero}>
        <div>
          <span>Organisation connections</span>
          <h1>Connect</h1>
          <p>
            Orbit uses one consistent connection flow: Connect → choose account → choose assets → approve → return to Orbit. Normal users never copy API tokens or see provider secrets.
          </p>
        </div>
        <div className={styles.heroActions}>
          <Link href="/dashboard/connect?integration=github#integrations">Manage integrations</Link>
          <Link href="/dashboard/security"><ShieldCheck aria-hidden="true" size={14} /> Security</Link>
        </div>
      </section>

      {notice ? <div className={`${styles.connectionNotice} ${styles.connectionSuccess}`}>{notice}</div> : null}
      {error ? <div className={`${styles.connectionNotice} ${styles.connectionError}`}>{error}</div> : null}

      <section className={styles.summary} aria-label="Connection summary">
        <article><small>Providers</small><strong>{providers.length}</strong><p>One organisation connection surface</p></article>
        <article><small>Connected</small><strong>{connectedCount}</strong><p>Authorized and available to Orbit</p></article>
        <article><small>Ready to connect</small><strong>{availableCount}</strong><p>One click starts provider authorization</p></article>
        <article><small>Manual API tokens</small><strong>0</strong><p>Normal users never paste secrets</p></article>
      </section>

      <section className={styles.workspace} id="integrations">
        <aside className={styles.rail}>
          <div className={styles.railHead}>
            <strong>Integrations</strong>
            <small>Any Orbit module with missing access deep-links here and opens the exact provider automatically.</small>
          </div>
          <nav className={styles.railNav} aria-label="Integration tabs">
            {providers.map((item) => {
              const status = statusFor(item);
              return (
                <Link key={item.id} href={`/dashboard/connect?integration=${item.id}#integrations`} data-active={selected.id === item.id}>
                  <span className={styles.railIdentity}>
                    <span className={styles.railIcon}>{item.icon}</span>
                    <span className={styles.railText}><strong>{item.name}</strong><small>{item.category}</small></span>
                  </span>
                  <span className={`${styles.railStatus} ${dotClass(status)}`} aria-label={status} />
                </Link>
              );
            })}
          </nav>
        </aside>

        <div className={styles.content}>
          <article className={styles.detail}>
            <header className={styles.detailHead}>
              <div className={styles.detailIdentity}>
                <span className={styles.detailIcon}>{selected.icon}</span>
                <div><h2>{selected.name}</h2><p>{selected.description}</p></div>
              </div>
              <span className={`${styles.statusPill} ${statusClass(selectedStatus)}`}>
                {selectedStatus === "connected" ? "Connected" : selectedStatus === "available" ? "Ready to connect" : "OAuth connector pending"}
              </span>
            </header>

            {selected.id === "operator" ? (
              <div className={styles.operator}>
                <section className="foundry-split-layout">
                  <article className="foundry-card">
                    <div className="foundry-card-head"><div><span className="foundry-card-eyebrow">Orbit Operator</span><h2>Generate a private key</h2></div><KeyRound aria-hidden="true" size={20} /></div>
                    <p>This is an advanced founder-only connection. Third-party services use OAuth/App installation instead of manual tokens.</p>
                    <OrbitActionKeyManager />
                  </article>
                  <aside className="foundry-card">
                    <div className="foundry-card-head"><div><span className="foundry-card-eyebrow">Connection recipe</span><h2>Connect ChatGPT</h2></div><Link2 aria-hidden="true" size={20} /></div>
                    <ol className={styles.setupList}>
                      <li><CheckCircle2 aria-hidden="true" size={17} />Create a private Orbit Operator GPT.</li>
                      <li><CheckCircle2 aria-hidden="true" size={17} />Import the Orbit OpenAPI schema.</li>
                      <li><CheckCircle2 aria-hidden="true" size={17} />Use the founder-only one-time Orbit action key.</li>
                      <li><CheckCircle2 aria-hidden="true" size={17} />Test read access before governed writes.</li>
                    </ol>
                  </aside>
                </section>

                <section className={`foundry-card ${styles.keys}`}>
                  <div className="foundry-card-head"><div><span className="foundry-card-eyebrow">Access control</span><h2>Organisation action keys</h2></div><ShieldCheck aria-hidden="true" size={20} /></div>
                  {keys.length ? (
                    <div className="foundry-attention-list">
                      {keys.map((key) => {
                        const inactive = !key.is_active;
                        return (
                          <article className="foundry-attention-row" key={key.id}>
                            <span className={`task-state ${inactive ? "task-state-cancelled" : "task-state-completed"}`}>{key.revoked_at ? "revoked" : inactive ? "expired" : "active"}</span>
                            <div><strong>{key.name}</strong><p>{key.token_prefix}… · Created {formatFoundryDate(key.created_at)}{key.last_used_at ? ` · Last used ${formatFoundryDate(key.last_used_at)}` : " · Not used yet"}</p></div>
                            {!key.revoked_at ? (
                              <form action={revokeOrbitActionKeyAction}>
                                <input name="keyId" type="hidden" value={key.id} />
                                <button className="foundry-icon-link" title="Revoke this Orbit connection" type="submit"><Trash2 aria-hidden="true" size={16} /></button>
                              </form>
                            ) : null}
                          </article>
                        );
                      })}
                    </div>
                  ) : <p>No Orbit connection key has been created yet.</p>}
                </section>
              </div>
            ) : (
              <div className={styles.detailBody}>
                <section className={styles.block}>
                  <h3>{selectedStatus === "connected" ? "Connected account" : "Connect account"}</h3>
                  {selectedStatus === "connected" && selectedRecord ? (
                    <>
                      <div className={styles.accountCard}>
                        <div><small>Account</small><strong>{selectedRecord.provider_account_name ?? `${selected.name} account`}</strong><span>{selectedRecord.provider_account_type ?? "Authorized installation"}</span></div>
                        <CheckCircle2 aria-hidden="true" size={19} />
                      </div>
                      <p>Orbit stores the provider installation server-side. Secret credentials are never displayed in the browser.</p>
                      <div className={styles.detailActions}>
                        {selected.providerUrl ? <a className={styles.primary} href={selected.providerUrl} target="_blank" rel="noreferrer">Manage access <ExternalLink size={11} /></a> : null}
                        <form action={`/api/integrations/${selected.id}/disconnect`} method="post">
                          <button className={styles.disconnectButton} type="submit">Disconnect</button>
                        </form>
                      </div>
                    </>
                  ) : selected.connectPath && selected.platformReady ? (
                    <>
                      <p>No credentials are required. Orbit will send you to {selected.name}, where you choose the account and assets you want to approve.</p>
                      <div className={styles.flowSteps}>
                        <span>1. Connect</span><span>2. Choose account</span><span>3. Choose assets</span><span>4. Approve</span><span>5. Return to Orbit</span>
                      </div>
                      <div className={styles.detailActions}><a className={styles.primary} href={selected.connectPath}>Connect {selected.name}</a></div>
                    </>
                  ) : (
                    <>
                      <p>The Orbit-side OAuth/App connector for {selected.name} is being prepared. Normal users will not be asked for API keys when it becomes available.</p>
                      <div className={styles.flowSteps}>
                        <span>Connect</span><span>Choose account</span><span>Choose assets</span><span>Approve</span><span>Manage</span>
                      </div>
                      {selected.providerUrl ? <div className={styles.detailActions}><a href={selected.providerUrl} target="_blank" rel="noreferrer">Open {selected.name} <ExternalLink size={11} /></a></div> : null}
                    </>
                  )}
                </section>

                <section className={styles.block}>
                  <h3>{selectedStatus === "connected" ? "Approved assets" : "Permission model"}</h3>
                  {selectedStatus === "connected" ? (
                    selectedAssets.length ? (
                      <div className={styles.assetList}>
                        {selectedAssets.slice(0, 12).map((asset) => (
                          <div key={asset.id}>
                            <CheckCircle2 aria-hidden="true" size={14} />
                            <span><strong>{asset.name}</strong><small>{asset.detail}</small></span>
                            {asset.url ? <a href={asset.url} target="_blank" rel="noreferrer"><ExternalLink size={11} /></a> : null}
                          </div>
                        ))}
                      </div>
                    ) : <p>The provider installation is connected. Orbit will refresh the approved asset list when the provider exposes it.</p>
                  ) : (
                    <>
                      <p>Orbit asks only for the permissions needed by the modules below. Users can change or revoke provider access later.</p>
                      <div className={styles.usedBy}>{selected.usedBy.map((label) => <span key={label}>{label}</span>)}</div>
                    </>
                  )}
                </section>
              </div>
            )}
          </article>
        </div>
      </section>
    </main>
  );
}
