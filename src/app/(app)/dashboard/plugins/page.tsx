import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Blocks,
  CheckCircle2,
  ExternalLink,
  LockKeyhole,
  PlugZap,
  Search,
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
import { formatFoundryDate } from "@/lib/foundry";
import { githubAppReady, vercelIntegrationReady } from "@/lib/integration-connections";
import { listOrbitActionKeys } from "@/lib/orbit-actions";
import { getPluginMarketplace } from "@/lib/plugins/catalog";
import {
  getWorkspacePluginConnections,
  resolvePluginAppConnections,
} from "@/lib/plugins/connections";
import { requireWorkspace } from "@/lib/workspace";
import { revokeOrbitActionKeyAction } from "../foundry/integrations/actions";
import styles from "./plugins-hub.module.css";

export const metadata: Metadata = {
  title: "Plugins · Orbit",
  robots: { index: false, follow: false },
};

const orbitUrl = "https://orbit-two-delta.vercel.app";
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
  bucket: "Development" | "Analytics" | "Growth" | "AI";
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
    q?: string;
    category?: string;
    connection?: string;
    notice?: string;
    error?: string;
  }>;
};

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
              : "Approved asset",
      url: typeof item.url === "string" ? item.url : null,
    }));
}

function messageFor(code: string | undefined) {
  const messages: Record<string, string> = {
    github_connected:
      "GitHub connected. Orbit can now use only the repositories approved during installation.",
    vercel_connected:
      "Vercel connected. Orbit stored the installation securely and can use the approved account and projects.",
    github_disconnected: "GitHub access was disconnected from Orbit.",
    vercel_disconnected: "Vercel access was disconnected from Orbit.",
  };
  return code ? messages[code] ?? "Connection updated." : null;
}

function errorFor(code: string | undefined) {
  const messages: Record<string, string> = {
    github_platform_setup:
      "Orbit's GitHub App still needs its one-time product-owner registration before normal users can connect.",
    vercel_platform_setup:
      "Orbit's Vercel Integration still needs its one-time product-owner registration before normal users can connect.",
    github_oauth_incomplete: "GitHub did not return a complete installation response. Try connecting again.",
    github_state_mismatch: "GitHub connection validation failed. Start the connection again from Orbit.",
    github_installation_unverified: "Orbit could not verify that GitHub App installation.",
    github_installation_token_failed:
      "GitHub installed the app, but Orbit could not obtain temporary installation access.",
    github_save_failed: "GitHub was authorized, but Orbit could not save the installation.",
    github_callback_failed: "GitHub connection failed before completion. Try again.",
    vercel_oauth_incomplete: "Vercel did not return a complete authorization response. Try connecting again.",
    vercel_state_mismatch: "Vercel connection validation failed. Start the connection again from Orbit.",
    vercel_oauth_exchange: "Vercel authorization could not be completed. Try again.",
    vercel_save_failed: "Vercel was authorized, but Orbit could not save the installation.",
    vercel_callback_failed: "Vercel connection failed before completion. Try again.",
    integration_disconnect_failed:
      "Orbit could not safely disconnect that provider. Manage access at the provider and try again.",
  };
  return code ? messages[code] ?? "The integration could not be completed." : null;
}

function connectionStatusClass(status: ConnectionStatus) {
  if (status === "connected") return styles.connectionConnected;
  if (status === "available") return styles.connectionAvailable;
  return styles.connectionPending;
}

function connectionStatusLabel(status: ConnectionStatus) {
  if (status === "connected") return "Connected";
  if (status === "available") return "Ready";
  return "Setup required";
}

function pluginStatusLabel(status: string | null) {
  if (status === "installed") return "Installed";
  if (status === "disabled") return "Disabled";
  if (status === "pending_connections") return "Needs connection";
  if (status === "pending_review") return "Update approval";
  return "Available";
}

export default async function PluginsPage({ searchParams }: PageProps) {
  const query = await searchParams;
  const { supabase, workspace, role } = await requireWorkspace();

  const [plugins, workspacePluginConnections, keys, connectionsResult] = await Promise.all([
    getPluginMarketplace(supabase, workspace.id),
    getWorkspacePluginConnections(supabase, workspace.id),
    listOrbitActionKeys(supabase, workspace.id),
    supabase
      .from("integration_connections")
      .select(
        "provider,status,provider_installation_id,provider_account_id,provider_account_name,provider_account_type,selected_assets,metadata,connected_at,updated_at",
      )
      .eq("workspace_id", workspace.id),
  ]);

  const canManage = role === "owner" || role === "admin";
  const activeKeys = keys.filter((key) => key.is_active);
  const connectionRows = (connectionsResult.data ?? []) as ConnectionRecord[];
  const connectionsByProvider = new Map(connectionRows.map((item) => [item.provider, item]));
  const isOrbitPlatformOwner = role === "owner" && workspace.slug === "urava";

  const providers: Provider[] = [
    {
      id: "github",
      name: "GitHub",
      category: "Code & repositories",
      bucket: "Development",
      description:
        "Authorize repository access with the Orbit GitHub App. Choose exactly which repositories Orbit may use.",
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
      bucket: "Development",
      description:
        "Connect a Vercel account or team and approve the projects Orbit may deploy, inspect and operate.",
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
      bucket: "Analytics",
      description:
        "Connect verified website properties for indexing health, search visibility and SEO operations.",
      usedBy: ["Website Manager", "SEO", "Growth"],
      logo: <SiGoogle aria-hidden="true" />,
      logoTone: styles.google,
      platformReady: false,
    },
    {
      id: "google_analytics",
      name: "Google Analytics",
      category: "Traffic & conversion",
      bucket: "Analytics",
      description:
        "Connect Analytics properties for traffic, behaviour, conversion and acquisition reporting inside Orbit.",
      usedBy: ["Website Manager", "Growth", "Evidence"],
      logo: <SiGoogleanalytics aria-hidden="true" />,
      logoTone: styles.analytics,
      platformReady: false,
    },
    {
      id: "meta",
      name: "Meta",
      category: "Facebook & Instagram",
      bucket: "Growth",
      description:
        "Connect Meta Business assets, Facebook Pages and Instagram accounts through one approval flow.",
      usedBy: ["Lead Engine", "Marketing", "Publishing"],
      logo: <SiMeta aria-hidden="true" />,
      logoTone: styles.meta,
      platformReady: false,
    },
    {
      id: "linkedin",
      name: "LinkedIn",
      category: "Professional network",
      bucket: "Growth",
      description:
        "Connect approved LinkedIn organisation assets for publishing, outreach and lead operations.",
      usedBy: ["Lead Engine", "Marketing", "Publishing"],
      logo: <SiLinkedin aria-hidden="true" />,
      logoTone: styles.linkedin,
      platformReady: false,
    },
    {
      id: "operator",
      name: "ChatGPT / Orbit Operator",
      category: "AI operator",
      bucket: "AI",
      description:
        "Founder-governed AI actions through revocable organisation-scoped Orbit credentials.",
      usedBy: ["Founder Command", "Orbit Operator", "Automation"],
      logo: <SiOpenai aria-hidden="true" />,
      logoTone: styles.openai,
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

  const selected = providers.find((item) => item.id === query.connection) ?? null;
  const selectedStatus = selected ? statusFor(selected) : null;
  const selectedRecord = selected ? connectionsByProvider.get(selected.id) : null;
  const selectedAssets = assetList(selectedRecord?.selected_assets);

  const searchTerm = (query.q ?? "").trim().toLowerCase();
  const category = query.category ?? "all";
  const categories = ["all", "connected", "Development", "Growth", "Analytics", "AI", "Plugins"];

  const providerMatches = (provider: Provider) => {
    const queryMatches =
      !searchTerm ||
      `${provider.name} ${provider.category} ${provider.description} ${provider.usedBy.join(" ")}`
        .toLowerCase()
        .includes(searchTerm);
    if (!queryMatches) return false;
    if (category === "all") return true;
    if (category === "connected") return statusFor(provider) === "connected";
    if (category === "Plugins") return false;
    return provider.bucket === category;
  };

  const pluginMatches = (plugin: (typeof plugins)[number]) => {
    const { catalog, manifest, installation } = plugin;
    const queryMatches =
      !searchTerm ||
      `${catalog.name} ${catalog.developer_name} ${catalog.short_description} ${manifest.category} ${manifest.orbit_modules.join(" ")}`
        .toLowerCase()
        .includes(searchTerm);
    if (!queryMatches) return false;
    if (category === "all") return true;
    if (category === "connected") return installation?.status === "installed";
    return category === "Plugins";
  };

  const visibleProviders = providers.filter(providerMatches);
  const visiblePlugins = plugins.filter(pluginMatches);
  const connectedProviders = providers.filter((provider) => statusFor(provider) === "connected");
  const installedPlugins = plugins.filter((plugin) => plugin.installation?.status === "installed");
  const connectedCount = connectedProviders.length;
  const installedCount = installedPlugins.length;

  const buildHref = (updates: {
    q?: string | null;
    category?: string | null;
    connection?: string | null;
    notice?: string | null;
    error?: string | null;
  }) => {
    const params = new URLSearchParams();
    const next = {
      q: query.q,
      category: query.category,
      connection: query.connection,
      notice: query.notice,
      error: query.error,
      ...updates,
    };
    if (next.q) params.set("q", next.q);
    if (next.category && next.category !== "all") params.set("category", next.category);
    if (next.connection) params.set("connection", next.connection);
    if (next.notice) params.set("notice", next.notice);
    if (next.error) params.set("error", next.error);
    const suffix = params.toString();
    return suffix ? `/dashboard/plugins?${suffix}` : "/dashboard/plugins";
  };

  const notice = messageFor(query.notice);
  const error = errorFor(query.error);

  return (
    <main className={styles.hubPage}>
      <section className={styles.hubHero}>
        <div>
          <div className={styles.hubEyebrow}>
            <Blocks size={14} aria-hidden="true" /> Orbit · System · Plugins
          </div>
          <h1>Plugins</h1>
          <p>
            Connect Orbit to the tools your organisation already uses, install approved capabilities,
            and manage every permission from one place.
          </p>
        </div>
        <div className={styles.heroMetrics} aria-label="Plugin and connection summary">
          <div><strong>{connectedCount}</strong><span>Connected apps</span></div>
          <div><strong>{installedCount}</strong><span>Active plugins</span></div>
        </div>
      </section>

      {notice ? <div className={`${styles.hubNotice} ${styles.hubNoticeSuccess}`}>{notice}</div> : null}
      {error ? <div className={`${styles.hubNotice} ${styles.hubNoticeError}`}>{error}</div> : null}

      <section className={styles.hubCommand}>
        <form className={styles.searchBar} action="/dashboard/plugins" method="get">
          <Search size={17} aria-hidden="true" />
          <input
            aria-label="Search plugins and connections"
            defaultValue={query.q}
            name="q"
            placeholder="Search plugins, tools or capabilities…"
          />
          {category !== "all" ? <input name="category" type="hidden" value={category} /> : null}
          <button type="submit">Search</button>
        </form>
        <Link className={styles.addButton} href="/dashboard/plugins/develop">
          <Sparkles size={15} aria-hidden="true" /> Add custom plugin
        </Link>
      </section>

      <section className={styles.connectedPanel}>
        <div className={styles.connectedHeader}>
          <div>
            <strong>Connected</strong>
            <span>Live in {workspace.name}</span>
          </div>
          <Link href={buildHref({ category: "connected", connection: null })}>Manage all</Link>
        </div>

        <div className={styles.connectedRail}>
          {connectedProviders.map((provider) => (
            <Link
              className={styles.connectedMini}
              href={buildHref({ connection: provider.id, notice: null, error: null })}
              key={provider.id}
            >
              <span className={`${styles.miniLogo} ${provider.logoTone}`}>{provider.logo}</span>
              <span><strong>{provider.name}</strong><small><i /> Connected</small></span>
            </Link>
          ))}
          {installedPlugins.map(({ catalog }) => (
            <Link className={styles.connectedMini} href={`/dashboard/plugins/${catalog.slug}`} key={catalog.id}>
              <span className={`${styles.miniLogo} ${styles.pluginLogo}`}><Blocks size={16} /></span>
              <span><strong>{catalog.name}</strong><small><i /> Installed</small></span>
            </Link>
          ))}
          {!connectedProviders.length && !installedPlugins.length ? (
            <div className={styles.connectedEmpty}>
              Nothing connected yet. Start with GitHub, Vercel or an approved Orbit plugin.
            </div>
          ) : null}
        </div>
      </section>

      <nav className={styles.filterRail} aria-label="Plugin categories">
        {categories.map((item) => {
          const active = category === item || (item === "all" && category === "all");
          return (
            <Link
              className={active ? styles.filterActive : styles.filterChip}
              href={buildHref({ category: item, connection: null, notice: null, error: null })}
              key={item}
            >
              {item === "all" ? "All" : item === "connected" ? "Connected" : item}
            </Link>
          );
        })}
      </nav>

      <section className={styles.libraryHeader}>
        <div>
          <span>Plugin library</span>
          <h2>{category === "connected" ? "Connected to Orbit" : "Discover and connect"}</h2>
          <p>Apps and Orbit plugins use one consistent discovery, approval and management model.</p>
        </div>
        <span className={styles.resultCount}>{visibleProviders.length + visiblePlugins.length} results</span>
      </section>

      <section className={styles.libraryGrid} aria-label="Plugins and app connections">
        {visibleProviders.map((provider) => {
          const status = statusFor(provider);
          const drawerHref = buildHref({ connection: provider.id, notice: null, error: null });
          return (
            <article className={styles.libraryCard} key={`provider-${provider.id}`}>
              <div className={styles.libraryCardTop}>
                <span className={`${styles.libraryLogo} ${provider.logoTone}`}>{provider.logo}</span>
                <span className={`${styles.statusBadge} ${connectionStatusClass(status)}`}>
                  {connectionStatusLabel(status)}
                </span>
              </div>
              <div className={styles.libraryIdentity}>
                <h3>{provider.name}</h3>
                <small>{provider.category}</small>
              </div>
              <p>{provider.description}</p>
              <div className={styles.cardFooter}>
                <span>{provider.bucket}</span>
                {status === "available" && provider.connectPath ? (
                  <a className={styles.cardActionPrimary} href={provider.connectPath}>
                    Connect
                  </a>
                ) : (
                  <Link className={styles.cardAction} href={drawerHref}>
                    {status === "connected" ? "Manage" : "View setup"}
                  </Link>
                )}
              </div>
            </article>
          );
        })}

        {visiblePlugins.map(({ catalog, manifest, installation }) => {
          const effectiveStatus = installation?.status === "revoked" ? null : installation?.status ?? null;
          const appConnections = resolvePluginAppConnections(manifest, workspacePluginConnections);
          const connectedRequired = appConnections.filter((app) => app.connected).length;
          return (
            <article className={styles.libraryCard} key={`plugin-${catalog.id}`}>
              <div className={styles.libraryCardTop}>
                <span className={`${styles.libraryLogo} ${styles.pluginLogo}`}><Blocks size={20} /></span>
                <span className={`${styles.statusBadge} ${effectiveStatus === "installed" ? styles.connectionConnected : styles.connectionPending}`}>
                  {pluginStatusLabel(effectiveStatus)}
                </span>
              </div>
              <div className={styles.libraryIdentity}>
                <h3>{catalog.name}</h3>
                <small>{catalog.developer_name} · {manifest.category}</small>
              </div>
              <p>{catalog.short_description}</p>
              <div className={styles.cardMeta}>
                <span>{manifest.skills.length} skills</span>
                <span>{connectedRequired}/{manifest.apps.length} apps ready</span>
                <span>v{catalog.current_version}</span>
              </div>
              <div className={styles.cardFooter}>
                <span>Orbit plugin</span>
                <Link
                  className={effectiveStatus === "installed" ? styles.cardAction : styles.cardActionPrimary}
                  href={`/dashboard/plugins/${catalog.slug}`}
                >
                  {effectiveStatus === "installed" ? "Manage" : "Review & install"}
                </Link>
              </div>
            </article>
          );
        })}

        {!visibleProviders.length && !visiblePlugins.length ? (
          <div className={styles.hubEmpty}>
            <Search size={20} aria-hidden="true" />
            <strong>No plugins found</strong>
            <span>Try another search or category.</span>
          </div>
        ) : null}
      </section>

      <section className={styles.securityStrip}>
        <ShieldCheck size={15} aria-hidden="true" />
        <div>
          <strong>Permissioned by default</strong>
          <span>Orbit shows the account, assets and permission boundary before a connection or plugin is approved.</span>
        </div>
      </section>

      {selected && selectedStatus ? (
        <>
          <Link
            aria-label="Close connection details"
            className={styles.drawerBackdrop}
            href={buildHref({ connection: null, notice: null, error: null })}
          />
          <aside className={styles.connectionDrawer} aria-label={`${selected.name} connection details`}>
            <div className={styles.drawerTop}>
              <Link
                aria-label="Close connection details"
                className={styles.drawerClose}
                href={buildHref({ connection: null, notice: null, error: null })}
              >
                ×
              </Link>
            </div>

            <div className={styles.drawerBrand}>
              <span className={`${styles.drawerLogo} ${selected.logoTone}`}>{selected.logo}</span>
              <div>
                <small>{selected.category}</small>
                <h2>{selected.name}</h2>
                <span className={`${styles.detailState} ${connectionStatusClass(selectedStatus)}`}>
                  <i /> {connectionStatusLabel(selectedStatus)}
                </span>
              </div>
            </div>

            <p className={styles.drawerDescription}>{selected.description}</p>

            {selected.id === "operator" ? (
              <div className={styles.drawerStack}>
                <section className={styles.drawerPanel}>
                  <div className={styles.drawerPanelTitle}>
                    <LockKeyhole size={16} />
                    <div><strong>Orbit Operator access</strong><small>Founder-governed AI connection</small></div>
                  </div>
                  <p>Create revocable organisation-scoped access. Normal business integrations continue to use OAuth or provider app installation.</p>
                  {canManage ? <OrbitActionKeyManager /> : <p>Owner or admin access is required to manage this connection.</p>}
                </section>

                <section className={styles.drawerPanel}>
                  <div className={styles.drawerPanelTitle}>
                    <ShieldCheck size={16} />
                    <div><strong>Active credentials</strong><small>{activeKeys.length} active</small></div>
                  </div>
                  <div className={styles.keyList}>
                    {keys.length ? keys.map((key) => (
                      <div className={styles.keyRow} key={key.id}>
                        <span>
                          <strong>{key.name}</strong>
                          <small>{key.token_prefix}… · Created {formatFoundryDate(key.created_at)}</small>
                        </span>
                        {!key.revoked_at && canManage ? (
                          <form action={revokeOrbitActionKeyAction}>
                            <input name="keyId" type="hidden" value={key.id} />
                            <button aria-label={`Revoke ${key.name}`} type="submit"><Trash2 size={14} /></button>
                          </form>
                        ) : null}
                      </div>
                    )) : <p>No Orbit Operator credential has been created yet.</p>}
                  </div>
                </section>
              </div>
            ) : (
              <div className={styles.drawerStack}>
                <section className={styles.drawerPanel}>
                  <div className={styles.drawerPanelTitle}>
                    <PlugZap size={16} />
                    <div>
                      <strong>{selectedStatus === "connected" ? "Connected account" : selectedStatus === "available" ? "Connect account" : "Connector setup"}</strong>
                      <small>Secure provider authorization</small>
                    </div>
                  </div>

                  {selectedStatus === "connected" && selectedRecord ? (
                    <>
                      <div className={styles.accountCard}>
                        <span className={`${styles.accountLogo} ${selected.logoTone}`}>{selected.logo}</span>
                        <div>
                          <small>Connected as</small>
                          <strong>{selectedRecord.provider_account_name ?? `${selected.name} account`}</strong>
                          <span>{selectedRecord.provider_account_type ?? "Authorized installation"}</span>
                        </div>
                        <CheckCircle2 size={18} />
                      </div>
                      <div className={styles.drawerActions}>
                        {selected.manageUrl ? (
                          <a href={selected.manageUrl} rel="noreferrer" target="_blank">
                            Manage access <ExternalLink size={12} />
                          </a>
                        ) : null}
                        {canManage ? (
                          <form action={`/api/integrations/${selected.id}/disconnect`} method="post">
                            <button type="submit">Disconnect</button>
                          </form>
                        ) : null}
                      </div>
                    </>
                  ) : selected.connectPath && selected.platformReady ? (
                    <>
                      <p>No API token to paste. Orbit opens {selected.name}, you approve the account and assets, then you return here automatically.</p>
                      <div className={styles.permissionFlow}>
                        <span>Connect</span><i /><span>Account</span><i /><span>Assets</span><i /><span>Approve</span>
                      </div>
                      <div className={styles.drawerActions}>
                        <a href={selected.connectPath}>Connect {selected.name} <ArrowRight size={13} /></a>
                      </div>
                    </>
                  ) : selected.id === "github" && isOrbitPlatformOwner ? (
                    <>
                      <div className={styles.setupBox}>
                        <strong>One-time Orbit platform setup</strong>
                        <span>This is only for Urava as the product owner. Normal Orbit users will never see this step.</span>
                      </div>
                      <div className={styles.setupList}>
                        <span><b>01</b> Register the Orbit GitHub App</span>
                        <span><b>02</b> Homepage: {orbitUrl}</span>
                        <span><b>03</b> Callback: {orbitUrl}/api/integrations/github/callback</span>
                        <span><b>04</b> Use selected-repository permissions</span>
                      </div>
                      <div className={styles.drawerActions}>
                        <a href={githubSetupUrl} rel="noreferrer" target="_blank">Register GitHub App <ExternalLink size={12} /></a>
                      </div>
                    </>
                  ) : (
                    <div className={styles.setupBox}>
                      <strong>Connector not enabled yet</strong>
                      <span>It will use the same account → assets → approve pattern. Users will not paste raw API keys.</span>
                    </div>
                  )}
                </section>

                <section className={styles.drawerPanel}>
                  <div className={styles.drawerPanelTitle}>
                    <ShieldCheck size={16} />
                    <div><strong>{selectedStatus === "connected" ? "Approved assets" : "Permission boundary"}</strong><small>Least privilege</small></div>
                  </div>
                  {selectedStatus === "connected" && selectedAssets.length ? (
                    <div className={styles.assetList}>
                      {selectedAssets.slice(0, 12).map((asset) => (
                        <div className={styles.assetRow} key={asset.id}>
                          <CheckCircle2 size={13} />
                          <span><strong>{asset.name}</strong><small>{asset.detail}</small></span>
                          {asset.url ? <a href={asset.url} rel="noreferrer" target="_blank"><ExternalLink size={11} /></a> : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className={styles.usedBy}>
                      {selected.usedBy.map((label) => <span key={label}>{label}</span>)}
                    </div>
                  )}
                </section>
              </div>
            )}
          </aside>
        </>
      ) : null}
    </main>
  );
}
