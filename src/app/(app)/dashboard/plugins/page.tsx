import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Blocks,
  CheckCircle2,
  CircleAlert,
  PlugZap,
  Search,
  ShieldCheck,
  Sparkles,
  Workflow,
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
import { getGeoapifyRuntimeStatus } from "@/lib/geoapify";
import { githubAppReady, vercelIntegrationReady } from "@/lib/integration-connections";
import { listOrbitActionKeys } from "@/lib/orbit-actions";
import { getPluginMarketplace } from "@/lib/plugins/catalog";
import {
  getWorkspacePluginConnections,
  providerLabel,
  resolvePluginAppConnections,
} from "@/lib/plugins/connections";
import { requireWorkspace } from "@/lib/workspace";
import {
  approvePluginUpdate,
  disablePlugin,
  enablePlugin,
  installPlugin,
  uninstallPlugin,
} from "./actions";
import { PluginWorkspaceEntry } from "./PluginWorkspaceEntry";
import styles from "./unified-plugins.module.css";

export const metadata: Metadata = {
  title: "Plugins · Orbit",
  robots: { index: false, follow: false },
};

type ConnectionStatus = "connected" | "ready" | "setup";
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
  provider_account_name: string | null;
  provider_account_type: string | null;
  selected_assets: unknown;
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
  platformReady: boolean;
  authType: string;
  setupTime: string;
  unlocks: Array<{ title: string; detail: string }>;
  permissions: string[];
  flow: string[];
};

type PageProps = {
  searchParams: Promise<{
    q?: string;
    category?: string;
    plugin?: string;
    connect?: string;
    notice?: string;
    error?: string;
  }>;
};

const categories = ["all", "connected", "Development", "Growth", "Analytics", "AI", "Plugins"] as const;

function noticeText(value?: string) {
  if (!value) return null;
  const messages: Record<string, string> = {
    github_connected: "GitHub connected. Approved repositories are now available to Orbit.",
    vercel_connected: "Vercel connected. Approved projects are now available to Orbit.",
    github_disconnected: "GitHub was disconnected from this workspace.",
    vercel_disconnected: "Vercel was disconnected from this workspace.",
  };
  return messages[value] ?? value;
}

function errorText(value?: string) {
  if (!value) return null;
  const messages: Record<string, string> = {
    github_platform_setup: "GitHub connector setup is not enabled in production yet.",
    vercel_platform_setup: "Vercel connector setup is not enabled in production yet.",
    github_oauth_incomplete: "GitHub did not return a complete authorization response.",
    github_state_mismatch: "GitHub connection validation failed. Start the connection again.",
    github_installation_unverified: "Orbit could not verify the GitHub installation.",
    github_installation_token_failed: "Orbit could not obtain temporary GitHub installation access.",
    github_save_failed: "GitHub was authorized, but Orbit could not save the connection.",
    github_callback_failed: "GitHub connection failed before completion.",
    vercel_oauth_incomplete: "Vercel did not return a complete authorization response.",
    vercel_state_mismatch: "Vercel connection validation failed. Start the connection again.",
    vercel_oauth_exchange: "Vercel authorization could not be completed.",
    vercel_save_failed: "Vercel was authorized, but Orbit could not save the connection.",
    vercel_callback_failed: "Vercel connection failed before completion.",
    integration_disconnect_failed: "Orbit could not safely disconnect that provider.",
  };
  return messages[value] ?? value;
}

function statusClass(status: ConnectionStatus | "installed" | "available" | "pending") {
  if (status === "connected" || status === "installed") return styles.statusConnected;
  if (status === "ready") return styles.statusReady;
  return styles.statusPending;
}

function statusLabel(status: ConnectionStatus) {
  if (status === "connected") return "Connected";
  if (status === "ready") return "Ready to connect";
  return "Setup required";
}

function pluginStatusLabel(status: string | null, connected = false) {
  if (connected) return "Connected";
  if (status === "installed") return "Installed";
  if (status === "disabled") return "Disabled";
  if (status === "pending_connections") return "Needs connection";
  if (status === "pending_review") return "Update approval";
  return "Available";
}

function assetCount(value: unknown) {
  return Array.isArray(value) ? value.length : 0;
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
      .select("provider,status,provider_account_name,provider_account_type,selected_assets,updated_at")
      .eq("workspace_id", workspace.id),
  ]);

  const canManage = role === "owner" || role === "admin";
  const activeOperator = keys.some((key) => key.is_active);
  const connectionRows = (connectionsResult.data ?? []) as ConnectionRecord[];
  const connectionsByProvider = new Map(connectionRows.map((item) => [item.provider, item]));

  const providers: Provider[] = [
    {
      id: "github",
      name: "GitHub",
      category: "Code & repositories",
      bucket: "Development",
      description: "Give Orbit approved repository access for delivery, website operations and governed automation.",
      usedBy: ["Delivery", "Website Manager", "Automation"],
      logo: <SiGithub aria-hidden="true" />,
      platformReady: githubAppReady(),
      authType: "OAuth / GitHub App",
      setupTime: "2–3 minutes",
      unlocks: [
        { title: "Repository-aware delivery", detail: "Use only repositories you explicitly approve." },
        { title: "Website operations", detail: "Connect source code to delivery and production workflows." },
        { title: "Governed automation", detail: "Let approved Orbit actions operate inside the repository boundary." },
      ],
      permissions: ["Approved repositories only", "Installation-scoped access", "No GitHub password stored"],
      flow: ["GitHub", "Approved repositories", "Orbit Delivery", "Automation"],
    },
    {
      id: "vercel",
      name: "Vercel",
      category: "Deployments & projects",
      bucket: "Development",
      description: "Connect approved Vercel projects for production delivery, deployment visibility and website operations.",
      usedBy: ["Delivery", "Production", "Website Manager"],
      logo: <SiVercel aria-hidden="true" />,
      platformReady: vercelIntegrationReady(),
      authType: "OAuth integration",
      setupTime: "1–2 minutes",
      unlocks: [
        { title: "Production deployments", detail: "Operate approved projects from Orbit delivery workflows." },
        { title: "Project visibility", detail: "See the projects Orbit is allowed to work with." },
        { title: "Delivery handoff", detail: "Move approved work from source to production with a clear boundary." },
      ],
      permissions: ["Approved Vercel account", "Approved projects", "Provider token stays server-side"],
      flow: ["Vercel", "Approved projects", "Orbit Delivery", "Production"],
    },
    {
      id: "google_search_console",
      name: "Search Console",
      category: "SEO & indexing",
      bucket: "Analytics",
      description: "Bring verified search properties into Orbit for indexing health, visibility and SEO operations.",
      usedBy: ["Growth", "SEO", "Website Manager"],
      logo: <SiGoogle aria-hidden="true" />,
      platformReady: false,
      authType: "Google OAuth",
      setupTime: "1–2 minutes",
      unlocks: [
        { title: "Indexing visibility", detail: "Understand which approved properties are visible in search." },
        { title: "SEO operations", detail: "Power search-health workflows inside Growth." },
        { title: "Website evidence", detail: "Connect verified property data to website decisions." },
      ],
      permissions: ["Verified properties only", "Read-focused search data", "Explicit Google authorization"],
      flow: ["Search Console", "Verified properties", "Orbit Growth", "SEO actions"],
    },
    {
      id: "google_analytics",
      name: "Google Analytics",
      category: "Traffic & conversion",
      bucket: "Analytics",
      description: "Measure traffic, acquisition, behaviour and conversion inside Orbit Growth and Evidence.",
      usedBy: ["Growth", "Evidence", "Website Manager"],
      logo: <SiGoogleanalytics aria-hidden="true" />,
      platformReady: false,
      authType: "Google OAuth",
      setupTime: "1–2 minutes",
      unlocks: [
        { title: "Traffic intelligence", detail: "Bring approved property traffic into Orbit." },
        { title: "Conversion evidence", detail: "Use real conversion signals instead of invented metrics." },
        { title: "Growth reporting", detail: "Support acquisition and performance decisions." },
      ],
      permissions: ["Approved Analytics properties", "Read analytics data", "Explicit Google authorization"],
      flow: ["Google Analytics", "Approved properties", "Orbit Growth", "Evidence"],
    },
    {
      id: "meta",
      name: "Meta",
      category: "Facebook & Instagram",
      bucket: "Growth",
      description: "Connect approved Meta business assets for marketing, publishing and lead operations.",
      usedBy: ["Marketing", "Publishing", "Lead Engine"],
      logo: <SiMeta aria-hidden="true" />,
      platformReady: false,
      authType: "Meta OAuth",
      setupTime: "2–3 minutes",
      unlocks: [
        { title: "Approved social assets", detail: "Use only Pages and business assets you select." },
        { title: "Publishing workflows", detail: "Connect social distribution to Orbit Publishing." },
        { title: "Lead operations", detail: "Support permissioned acquisition workflows." },
      ],
      permissions: ["Approved business assets", "Explicit Meta permissions", "No account password stored"],
      flow: ["Meta", "Approved assets", "Orbit Growth", "Publishing"],
    },
    {
      id: "linkedin",
      name: "LinkedIn",
      category: "Professional network",
      bucket: "Growth",
      description: "Use approved LinkedIn organisation assets for B2B publishing, outreach and lead workflows.",
      usedBy: ["Lead Engine", "Marketing", "Publishing"],
      logo: <SiLinkedin aria-hidden="true" />,
      platformReady: false,
      authType: "LinkedIn OAuth",
      setupTime: "2–3 minutes",
      unlocks: [
        { title: "B2B presence", detail: "Connect approved organisation assets to Orbit." },
        { title: "Professional publishing", detail: "Use LinkedIn inside permissioned content workflows." },
        { title: "Lead workflows", detail: "Support B2B acquisition without widening access silently." },
      ],
      permissions: ["Approved organisation assets", "Explicit LinkedIn scopes", "No password stored"],
      flow: ["LinkedIn", "Organisation assets", "Orbit Growth", "Lead Engine"],
    },
    {
      id: "operator",
      name: "ChatGPT / Orbit Operator",
      category: "AI operator",
      bucket: "AI",
      description: "Enable founder-governed AI actions through revocable organisation-scoped Orbit credentials.",
      usedBy: ["Founder Command", "Automation", "Operations"],
      logo: <SiOpenai aria-hidden="true" />,
      platformReady: true,
      authType: "Revocable Orbit credential",
      setupTime: "Under 1 minute",
      unlocks: [
        { title: "Founder-governed actions", detail: "Use explicit workspace-scoped Orbit credentials." },
        { title: "Revocable access", detail: "Disable operator access without changing the rest of Orbit." },
        { title: "Auditable execution", detail: "Keep AI actions inside Orbit's permission boundary." },
      ],
      permissions: ["Workspace-scoped credential", "Founder/admin controlled", "Revocable at any time"],
      flow: ["Orbit Operator", "Approved credential", "Governed actions", "Audit trail"],
    },
  ];

  const statusFor = (provider: Provider): ConnectionStatus => {
    if (provider.id === "operator") return activeOperator ? "connected" : "ready";
    if (connectionsByProvider.get(provider.id)?.status === "connected") return "connected";
    return provider.platformReady ? "ready" : "setup";
  };

  const selectedKey = query.plugin ?? null;
  const selectedProvider = selectedKey?.startsWith("app:")
    ? providers.find((provider) => provider.id === selectedKey.slice(4)) ?? null
    : null;
  const selectedPlugin = selectedKey?.startsWith("plugin:")
    ? plugins.find(({ catalog }) => catalog.slug === selectedKey.slice(7)) ?? null
    : null;

  const notice = noticeText(query.notice);
  const error = errorText(query.error);

  if (selectedProvider) {
    const status = statusFor(selectedProvider);
    const record = connectionsByProvider.get(selectedProvider.id);
    const connectHref = `/dashboard/plugins?plugin=${encodeURIComponent(`app:${selectedProvider.id}`)}&connect=${encodeURIComponent(selectedProvider.id)}`;

    return (
      <main className={styles.page}>
        <Link className={styles.back} href="/dashboard/plugins"><ArrowLeft size={13} /> All plugins</Link>
        {notice ? <div className={styles.notice}><CheckCircle2 size={13} /> {notice}</div> : null}
        {error ? <div className={`${styles.notice} ${styles.noticeError}`}><CircleAlert size={13} /> {error}</div> : null}

        <section className={styles.overviewHero}>
          <div className={styles.identity}>
            <span className={styles.heroLogo}>{selectedProvider.logo}</span>
            <div>
              <div className={styles.eyebrow}>Orbit connection · {selectedProvider.bucket}</div>
              <h1>{selectedProvider.name}</h1>
              <p>{selectedProvider.description}</p>
              <div className={styles.identityMeta}>
                <span>{selectedProvider.category}</span>
                <span className={statusClass(status)}>{statusLabel(status)}</span>
                {record?.provider_account_name ? <span>{record.provider_account_name}</span> : null}
                {record ? <span>{assetCount(record.selected_assets)} approved assets</span> : null}
              </div>
            </div>
          </div>
          <div className={styles.heroActions}>
            {selectedProvider.id === "operator" ? (
              <Link className={styles.primary} href="/dashboard/foundry/integrations"><PlugZap size={14} /> Manage Operator access</Link>
            ) : canManage ? (
              <Link className={styles.primary} href={connectHref}><PlugZap size={14} /> {status === "connected" ? "Manage connection" : `Connect ${selectedProvider.name}`}</Link>
            ) : (
              <span className={styles.secondary}>Owner or admin required</span>
            )}
            <span className={styles.micro}>Nothing changes until you approve the connection flow.</span>
          </div>
        </section>

        <section className={styles.overviewGrid}>
          <article className={styles.panel}>
            <h2>What this unlocks</h2>
            <p>Outcomes first. Orbit keeps the technical setup behind the connection step.</p>
            <div className={styles.unlockList}>
              {selectedProvider.unlocks.map((item) => (
                <div className={styles.unlock} key={item.title}><Sparkles size={14} /><span><strong>{item.title}</strong><small>{item.detail}</small></span></div>
              ))}
            </div>
          </article>
          <article className={styles.panel}>
            <h2>What Orbit needs</h2>
            <p>A plain-language permission boundary before you connect.</p>
            <div className={styles.permissionList}>
              {selectedProvider.permissions.map((permission) => <div className={styles.permission} key={permission}><CheckCircle2 size={12} /><span>{permission}</span></div>)}
            </div>
            <div className={styles.security}><ShieldCheck size={14} /><span><strong>Server-side security</strong><span>Provider credentials are kept on Orbit's server boundary and are never returned as frontend secrets.</span></span></div>
          </article>
        </section>

        <section className={`${styles.panel} ${styles.flowPanel}`}>
          <h2>How Orbit uses it</h2>
          <p>One predictable path from provider to the Orbit module that needs it.</p>
          <div className={styles.flow}>
            {selectedProvider.flow.map((step, index) => (
              <span style={{display:"contents"}} key={step}>
                <span className={styles.flowStep}><span>Step {index + 1}</span><strong>{step}</strong></span>
                {index < selectedProvider.flow.length - 1 ? <ArrowRight className={styles.flowArrow} size={14} /> : null}
              </span>
            ))}
          </div>
        </section>

        <section className={`${styles.panel} ${styles.flowPanel}`}>
          <h2>Connection requirements</h2>
          <p>Know exactly what the setup needs before starting.</p>
          <div className={styles.requirements}>
            <div className={styles.requirement}><span>Authorization</span><strong>{selectedProvider.authType}</strong></div>
            <div className={styles.requirement}><span>Setup time</span><strong>{selectedProvider.setupTime}</strong></div>
            <div className={styles.requirement}><span>Workspace role</span><strong>Owner or admin</strong></div>
            <div className={styles.requirement}><span>Used by</span><strong>{selectedProvider.usedBy.join(" · ")}</strong></div>
          </div>
        </section>
      </main>
    );
  }

  if (selectedPlugin) {
    const { catalog, manifest } = selectedPlugin;
    const installation = selectedPlugin.installation?.status === "revoked" ? null : selectedPlugin.installation;
    const appConnections = resolvePluginAppConnections(manifest, workspacePluginConnections);
    const requiredMissing = appConnections.filter((app) => app.required && !app.connected);
    const isGeoapify = catalog.slug === "geoapify-lead-discovery";
    const geoapify = isGeoapify ? await getGeoapifyRuntimeStatus(workspace.id) : null;
    const connected = Boolean(geoapify?.connected);
    const currentStatus = pluginStatusLabel(installation?.status ?? null, connected);
    const connectHref = `/dashboard/plugins?plugin=${encodeURIComponent(`plugin:${catalog.slug}`)}&connect=geoapify`;

    return (
      <main className={styles.page}>
        <Link className={styles.back} href="/dashboard/plugins"><ArrowLeft size={13} /> All plugins</Link>
        {notice ? <div className={styles.notice}><CheckCircle2 size={13} /> {notice}</div> : null}
        {error ? <div className={`${styles.notice} ${styles.noticeError}`}><CircleAlert size={13} /> {error}</div> : null}

        <section className={styles.overviewHero}>
          <div className={styles.identity}>
            <span className={`${styles.heroLogo} ${styles.heroPluginLogo}`}><Blocks size={28} /></span>
            <div>
              <div className={styles.eyebrow}>{catalog.verified ? "Marketplace reviewed" : "Orbit plugin"} · {manifest.category}</div>
              <h1>{catalog.name}</h1>
              <p>{catalog.short_description}</p>
              <div className={styles.identityMeta}>
                <span>{catalog.developer_name}</span>
                <span>v{catalog.current_version}</span>
                <span className={connected || installation?.status === "installed" ? styles.statusConnected : styles.statusPending}>{currentStatus}</span>
                <span>{catalog.first_party ? "First-party" : "Marketplace"}</span>
              </div>
            </div>
          </div>
          <div className={styles.heroActions}>
            {!canManage ? (
              <span className={styles.secondary}>Owner or admin required</span>
            ) : !installation ? (
              <form action={installPlugin}><input name="pluginSlug" type="hidden" value={catalog.slug} /><button className={styles.primary} type="submit"><ShieldCheck size={14} /> Install plugin</button></form>
            ) : installation.status === "pending_review" ? (
              <form action={approvePluginUpdate}><input name="pluginSlug" type="hidden" value={catalog.slug} /><button className={styles.primary} type="submit">Approve v{catalog.current_version}</button></form>
            ) : installation.status === "disabled" ? (
              <form action={enablePlugin}><input name="pluginSlug" type="hidden" value={catalog.slug} /><button className={styles.primary} type="submit">Enable plugin</button></form>
            ) : isGeoapify ? (
              <Link className={styles.primary} href={connectHref}><PlugZap size={14} /> {connected ? "Manage connection" : "Connect Geoapify"}</Link>
            ) : requiredMissing.length && providers.some((provider) => provider.id === requiredMissing[0]?.provider) ? (
              <Link className={styles.primary} href={`/dashboard/plugins?plugin=${encodeURIComponent(`app:${requiredMissing[0].provider}`)}`}>Connect required app</Link>
            ) : (
              <span className={styles.secondary}>Ready in Orbit</span>
            )}
            <span className={styles.micro}>Review first. Install or connect only when you choose.</span>
          </div>
        </section>

        <section className={styles.overviewGrid}>
          <article className={styles.panel}>
            <h2>What this unlocks</h2>
            <p>Capabilities declared by the reviewed plugin manifest.</p>
            <div className={styles.unlockList}>
              {manifest.skills.map((skill) => <div className={styles.unlock} key={skill.id}><Sparkles size={14} /><span><strong>{skill.name}</strong><small>{skill.description}</small></span></div>)}
              {manifest.workflows.map((workflow) => <div className={styles.unlock} key={workflow.id}><Workflow size={14} /><span><strong>{workflow.name}</strong><small>{workflow.description}</small></span></div>)}
            </div>
          </article>
          <article className={styles.panel}>
            <h2>What Orbit needs</h2>
            <p>The reviewed permission boundary. Orbit does not silently widen it.</p>
            <div className={styles.permissionList}>
              {manifest.permissions.map((permission) => <div className={styles.permission} key={permission}><CheckCircle2 size={12} /><code>{permission}</code></div>)}
            </div>
            <div className={styles.security}><ShieldCheck size={14} /><span><strong>Permissioned by default</strong><span>Installation grants only this reviewed manifest. External credentials remain server-side.</span></span></div>
          </article>
        </section>

        <section className={`${styles.panel} ${styles.flowPanel}`}>
          <h2>How Orbit uses it</h2>
          <p>A single visible route from provider capability to the Orbit modules that use it.</p>
          <div className={styles.flow}>
            {[catalog.name, ...manifest.orbit_modules.map((module) => module.replaceAll("_", " ")), "Orbit workflow"].map((step, index, list) => (
              <span style={{display:"contents"}} key={`${step}-${index}`}>
                <span className={styles.flowStep}><span>Step {index + 1}</span><strong>{step}</strong></span>
                {index < list.length - 1 ? <ArrowRight className={styles.flowArrow} size={14} /> : null}
              </span>
            ))}
          </div>
        </section>

        <section className={`${styles.panel} ${styles.flowPanel}`}>
          <h2>Connection requirements</h2>
          <p>Everything needed to get this plugin from overview to a working state.</p>
          <div className={styles.requirements}>
            <div className={styles.requirement}><span>Plugin version</span><strong>v{catalog.current_version}</strong></div>
            <div className={styles.requirement}><span>Required apps</span><strong>{appConnections.length ? appConnections.map((app) => providerLabel(app.provider)).join(" · ") : "None"}</strong></div>
            <div className={styles.requirement}><span>Workspace role</span><strong>Owner or admin</strong></div>
            <div className={styles.requirement}><span>Orbit modules</span><strong>{manifest.orbit_modules.map((module) => module.replaceAll("_", " ")).join(" · ")}</strong></div>
          </div>
          {installation && canManage ? (
            <div className={styles.adminRow}>
              <span>Administrative controls stay secondary to the product overview.</span>
              <div className={styles.adminActions}>
                {installation.status === "installed" && !isGeoapify ? <form action={disablePlugin}><input name="pluginSlug" type="hidden" value={catalog.slug} /><button className={styles.secondary} type="submit">Disable</button></form> : null}
                <form action={uninstallPlugin}><input name="pluginSlug" type="hidden" value={catalog.slug} /><button className={styles.danger} type="submit">Uninstall</button></form>
              </div>
            </div>
          ) : null}
        </section>
      </main>
    );
  }

  const searchTerm = (query.q ?? "").trim().toLowerCase();
  const category = query.category ?? "all";
  const connectedProviders = providers.filter((provider) => statusFor(provider) === "connected");
  const installedPlugins = plugins.filter(({ installation }) => installation?.status === "installed");

  const providerMatches = (provider: Provider) => {
    const queryMatches = !searchTerm || `${provider.name} ${provider.category} ${provider.description} ${provider.usedBy.join(" ")}`.toLowerCase().includes(searchTerm);
    if (!queryMatches) return false;
    if (category === "all") return true;
    if (category === "connected") return statusFor(provider) === "connected";
    if (category === "Plugins") return false;
    return provider.bucket === category;
  };

  const pluginMatches = (plugin: (typeof plugins)[number]) => {
    const queryMatches = !searchTerm || `${plugin.catalog.name} ${plugin.catalog.developer_name} ${plugin.catalog.short_description} ${plugin.manifest.category} ${plugin.manifest.orbit_modules.join(" ")}`.toLowerCase().includes(searchTerm);
    if (!queryMatches) return false;
    if (category === "all") return true;
    if (category === "connected") return plugin.installation?.status === "installed";
    return category === "Plugins";
  };

  const visibleProviders = providers.filter(providerMatches);
  const visiblePlugins = plugins.filter(pluginMatches);

  function filterHref(nextCategory: string) {
    const params = new URLSearchParams();
    if (query.q) params.set("q", query.q);
    if (nextCategory !== "all") params.set("category", nextCategory);
    const suffix = params.toString();
    return suffix ? `/dashboard/plugins?${suffix}` : "/dashboard/plugins";
  }

  return (
    <main className={styles.page}>
      <section className={styles.topbar}>
        <div>
          <div className={styles.eyebrow}><Blocks size={13} /> Orbit · Plugins</div>
          <h1>Plugins</h1>
          <p>Choose a tool yourself or let Orbit recommend the right capability for this workspace. Every selection opens the same overview before setup.</p>
        </div>
        <div className={styles.metrics}>
          <div className={styles.metric}><strong>{connectedProviders.length}</strong><span>Connected apps</span></div>
          <div className={styles.metric}><strong>{installedPlugins.length}</strong><span>Installed plugins</span></div>
        </div>
      </section>

      {notice ? <div className={styles.notice}><CheckCircle2 size={13} /> {notice}</div> : null}
      {error ? <div className={`${styles.notice} ${styles.noticeError}`}><CircleAlert size={13} /> {error}</div> : null}

      <PluginWorkspaceEntry />

      <section className={styles.command}>
        <form className={styles.search} action="/dashboard/plugins" method="get">
          <Search size={16} />
          <input aria-label="Search plugins" defaultValue={query.q} name="q" placeholder="Search plugins, apps or capabilities…" />
          {category !== "all" ? <input name="category" type="hidden" value={category} /> : null}
          <button type="submit">Search</button>
        </form>
        <Link className={styles.custom} href="/dashboard/plugins/develop"><Sparkles size={14} /> Add custom plugin</Link>
      </section>

      <nav className={styles.filters} aria-label="Plugin categories">
        {categories.map((item) => <Link className={category === item ? styles.filterActive : styles.filter} href={filterHref(item)} key={item}>{item === "all" ? "All" : item === "connected" ? "Connected" : item}</Link>)}
      </nav>

      <section className={styles.libraryHead}>
        <div><h2>Plugin library</h2><p>One card → one overview → one connection flow.</p></div>
        <span className={styles.resultCount}>{visibleProviders.length + visiblePlugins.length} results</span>
      </section>

      <section className={styles.grid} id="plugin-library">
        {visibleProviders.map((provider) => {
          const status = statusFor(provider);
          return (
            <Link className={styles.card} href={`/dashboard/plugins?plugin=${encodeURIComponent(`app:${provider.id}`)}`} key={`app-${provider.id}`}>
              <div className={styles.cardTop}><span className={styles.logo}>{provider.logo}</span><span className={`${styles.status} ${statusClass(status)}`}>{statusLabel(status)}</span></div>
              <h3>{provider.name}</h3><span className={styles.category}>{provider.category}</span><p>{provider.description}</p>
              <div className={styles.cardFoot}><span>{provider.bucket}</span><span className={styles.open}>View overview <ArrowRight size={12} /></span></div>
            </Link>
          );
        })}

        {visiblePlugins.map(({ catalog, manifest, installation }) => {
          const effectiveStatus = installation?.status === "revoked" ? null : installation?.status ?? null;
          const label = pluginStatusLabel(effectiveStatus);
          const className = effectiveStatus === "installed" ? styles.statusConnected : styles.statusPending;
          return (
            <Link className={styles.card} href={`/dashboard/plugins?plugin=${encodeURIComponent(`plugin:${catalog.slug}`)}`} key={`plugin-${catalog.id}`}>
              <div className={styles.cardTop}><span className={`${styles.logo} ${styles.pluginLogo}`}><Blocks size={19} /></span><span className={`${styles.status} ${className}`}>{label}</span></div>
              <h3>{catalog.name}</h3><span className={styles.category}>{catalog.developer_name} · {manifest.category}</span><p>{catalog.short_description}</p>
              <div className={styles.cardFoot}><span>v{catalog.current_version}</span><span className={styles.open}>View overview <ArrowRight size={12} /></span></div>
            </Link>
          );
        })}

        {!visibleProviders.length && !visiblePlugins.length ? <div className={styles.empty}><Search size={18} /><strong>No plugins found</strong><span>Try another search or category.</span></div> : null}
      </section>
    </main>
  );
}
