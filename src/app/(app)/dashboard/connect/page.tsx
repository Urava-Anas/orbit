import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import {
  BarChart3,
  Bot,
  CheckCircle2,
  Code2,
  Database,
  ExternalLink,
  FileText,
  Globe2,
  KeyRound,
  Link2,
  Mail,
  MessageCircle,
  Rocket,
  Search,
  Settings2,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { OrbitActionKeyManager } from "@/components/foundry/OrbitActionKeyManager";
import { formatFoundryDate, requireFounderFoundry } from "@/lib/foundry";
import { listOrbitActionKeys } from "@/lib/orbit-actions";
import { revokeOrbitActionKeyAction } from "../foundry/integrations/actions";
import styles from "./connect.module.css";

export const metadata: Metadata = {
  title: "Connect · Orbit",
  robots: { index: false, follow: false },
};

const schemaUrl = "https://orbit-two-delta.vercel.app/orbit-gpt-actions.openapi.json";
const vercelEnvironmentUrl = "https://vercel.com/urava-pros/orbit/settings/environment-variables";

type IntegrationStatus = "connected" | "partial" | "not_connected";
type Integration = {
  id: string;
  name: string;
  description: string;
  category: string;
  status: IntegrationStatus;
  statusLabel: string;
  usedBy: string[];
  required: string[];
  providerUrl: string;
  providerLabel: string;
  icon: ReactNode;
};

type PageProps = {
  searchParams: Promise<{ integration?: string }>;
};

function has(...keys: string[]) {
  return keys.every((key) => Boolean(process.env[key]));
}

function statusClass(status: IntegrationStatus) {
  if (status === "connected") return styles.connected;
  if (status === "partial") return styles.partial;
  return styles.notConnected;
}

function dotClass(status: IntegrationStatus) {
  if (status === "connected") return styles.dotConnected;
  if (status === "partial") return styles.dotPartial;
  return styles.dotOff;
}

export default async function OrbitConnectPage({ searchParams }: PageProps) {
  const [{ integration }, foundry] = await Promise.all([searchParams, requireFounderFoundry()]);
  const { supabase, workspace } = foundry;
  const keys = await listOrbitActionKeys(supabase, workspace.id);
  const activeKeys = keys.filter((key) => key.is_active);

  const supabaseConnected = has("NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") && Boolean(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY);
  const airtableConnected = has("AIRTABLE_API_TOKEN", "AIRTABLE_BASE_ID");
  const notionConnected = has("NOTION_API_KEY", "NOTION_DATA_SOURCE_ID");
  const emailConnected = has("RESEND_API_KEY", "FOUNDRY_EMAIL_FROM");
  const whatsappConnected = has("WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID");
  const githubApiConnected = Boolean(process.env.GITHUB_TOKEN);
  const vercelApiConnected = Boolean(process.env.VERCEL_TOKEN);
  const searchConsoleConnected = Boolean(process.env.GOOGLE_SEARCH_CONSOLE_CREDENTIALS || process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const analyticsConnected = Boolean(process.env.GOOGLE_ANALYTICS_PROPERTY_ID && (process.env.GOOGLE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_ANALYTICS_CREDENTIALS));

  const integrations: Integration[] = [
    {
      id: "vercel",
      name: "Vercel",
      description: "Production deployments, domains, build health, redeploy and rollback controls.",
      category: "Infrastructure",
      status: vercelApiConnected ? "connected" : "partial",
      statusLabel: vercelApiConnected ? "API connected" : "Git deployment linked",
      usedBy: ["Website Manager", "Delivery", "Orbit production"],
      required: ["VERCEL_TOKEN", "VERCEL_PROJECT_ID", "VERCEL_TEAM_ID"],
      providerUrl: "https://vercel.com/urava-pros",
      providerLabel: "Open Vercel",
      icon: <Rocket aria-hidden="true" size={18} />,
    },
    {
      id: "github",
      name: "GitHub",
      description: "Repositories, branches, commits and governed code changes from Orbit.",
      category: "Infrastructure",
      status: githubApiConnected ? "connected" : "partial",
      statusLabel: githubApiConnected ? "API connected" : "Repository link only",
      usedBy: ["Website Manager", "Delivery", "Automation"],
      required: ["GITHUB_TOKEN"],
      providerUrl: "https://github.com/Urava-Anas",
      providerLabel: "Open GitHub",
      icon: <Code2 aria-hidden="true" size={18} />,
    },
    {
      id: "supabase",
      name: "Supabase",
      description: "Orbit database, authentication, workspace state and server-side operations.",
      category: "Data",
      status: supabaseConnected ? "connected" : "not_connected",
      statusLabel: supabaseConnected ? "Connected" : "Needs setup",
      usedBy: ["Orbit Core", "Lead Engine", "Sales Desk", "Foundry"],
      required: ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY"],
      providerUrl: "https://supabase.com/dashboard",
      providerLabel: "Open Supabase",
      icon: <Database aria-hidden="true" size={18} />,
    },
    {
      id: "airtable",
      name: "Airtable",
      description: "Operational data synchronization for Foundry and legacy workflows.",
      category: "Data",
      status: airtableConnected ? "connected" : "not_connected",
      statusLabel: airtableConnected ? "Connected" : "Not connected",
      usedBy: ["Foundry", "Background sync"],
      required: ["AIRTABLE_API_TOKEN", "AIRTABLE_BASE_ID"],
      providerUrl: "https://airtable.com",
      providerLabel: "Open Airtable",
      icon: <Globe2 aria-hidden="true" size={18} />,
    },
    {
      id: "notion",
      name: "Notion",
      description: "Knowledge and Foundry data synchronization with the organisation workspace.",
      category: "Data",
      status: notionConnected ? "connected" : "not_connected",
      statusLabel: notionConnected ? "Connected" : "Not connected",
      usedBy: ["Foundry", "Knowledge sync"],
      required: ["NOTION_API_KEY", "NOTION_DATA_SOURCE_ID"],
      providerUrl: "https://www.notion.so/my-integrations",
      providerLabel: "Open Notion integrations",
      icon: <FileText aria-hidden="true" size={18} />,
    },
    {
      id: "email",
      name: "Transactional Email",
      description: "System emails, class notices, task alerts and operational notifications through Resend.",
      category: "Communication",
      status: emailConnected ? "connected" : "not_connected",
      statusLabel: emailConnected ? "Connected" : "Not connected",
      usedBy: ["Foundry", "Sales Desk", "Notifications"],
      required: ["RESEND_API_KEY", "FOUNDRY_EMAIL_FROM"],
      providerUrl: "https://resend.com",
      providerLabel: "Open Resend",
      icon: <Mail aria-hidden="true" size={18} />,
    },
    {
      id: "whatsapp",
      name: "WhatsApp Cloud API",
      description: "Template notifications and governed client or student communication automation.",
      category: "Communication",
      status: whatsappConnected ? "connected" : "not_connected",
      statusLabel: whatsappConnected ? "Connected" : "Not connected",
      usedBy: ["Lead Engine", "Sales Desk", "Foundry"],
      required: ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID"],
      providerUrl: "https://developers.facebook.com/apps/",
      providerLabel: "Open Meta Developer",
      icon: <MessageCircle aria-hidden="true" size={18} />,
    },
    {
      id: "search-console",
      name: "Google Search Console",
      description: "Indexing, sitemap, search-query and SEO visibility for managed websites.",
      category: "Growth",
      status: searchConsoleConnected ? "connected" : "not_connected",
      statusLabel: searchConsoleConnected ? "Connected" : "Not connected",
      usedBy: ["Website Manager", "SEO", "Growth"],
      required: ["GOOGLE_SEARCH_CONSOLE_CREDENTIALS"],
      providerUrl: "https://search.google.com/search-console",
      providerLabel: "Open Search Console",
      icon: <Search aria-hidden="true" size={18} />,
    },
    {
      id: "analytics",
      name: "Google Analytics",
      description: "Website traffic, acquisition and conversion data for Orbit dashboards.",
      category: "Growth",
      status: analyticsConnected ? "connected" : "not_connected",
      statusLabel: analyticsConnected ? "Connected" : "Not connected",
      usedBy: ["Website Manager", "Growth", "Evidence"],
      required: ["GOOGLE_ANALYTICS_PROPERTY_ID", "GOOGLE_SERVICE_ACCOUNT_JSON"],
      providerUrl: "https://analytics.google.com",
      providerLabel: "Open Google Analytics",
      icon: <BarChart3 aria-hidden="true" size={18} />,
    },
    {
      id: "operator",
      name: "Orbit Operator / ChatGPT",
      description: "Governed AI actions through revocable organisation-scoped Orbit action keys.",
      category: "AI",
      status: activeKeys.length ? "connected" : "not_connected",
      statusLabel: activeKeys.length ? `${activeKeys.length} active key${activeKeys.length === 1 ? "" : "s"}` : "No active key",
      usedBy: ["Founder Command", "Orbit Operator", "Automation"],
      required: ["Orbit Action Key", "OpenAPI schema"],
      providerUrl: schemaUrl,
      providerLabel: "Open Orbit schema",
      icon: <Bot aria-hidden="true" size={18} />,
    },
  ];

  const selectedId = integrations.some((item) => item.id === integration) ? integration! : "all";
  const selected = selectedId === "all" ? null : integrations.find((item) => item.id === selectedId) ?? null;
  const connectedCount = integrations.filter((item) => item.status === "connected").length;
  const attentionCount = integrations.filter((item) => item.status !== "connected").length;

  return (
    <main className={styles.hub}>
      <section className={styles.hero}>
        <div>
          <span>Organisation connections</span>
          <h1>Connect</h1>
          <p>One control centre for every service Orbit depends on. Any module that needs a missing integration sends you here and opens the exact provider tab automatically.</p>
        </div>
        <div className={styles.heroActions}>
          <Link href="/dashboard/connect?integration=all">All integrations</Link>
          <a href={vercelEnvironmentUrl} target="_blank" rel="noreferrer"><Settings2 aria-hidden="true" size={14} /> Secret manager</a>
        </div>
      </section>

      <section className={styles.summary} aria-label="Connection summary">
        <article><small>Integrations</small><strong>{integrations.length}</strong><p>Organisation-wide connection surface</p></article>
        <article><small>Connected</small><strong>{connectedCount}</strong><p>Ready for Orbit workflows</p></article>
        <article><small>Needs attention</small><strong>{attentionCount}</strong><p>Partial or not connected</p></article>
        <article><small>Operator keys</small><strong>{activeKeys.length}</strong><p>Revocable AI action access</p></article>
      </section>

      <section className={styles.workspace} id="integrations">
        <aside className={styles.rail}>
          <div className={styles.railHead}><strong>Integrations</strong><small>Select a provider. Deep links from Orbit modules land directly on the right tab.</small></div>
          <nav className={styles.railNav} aria-label="Integration tabs">
            <Link href="/dashboard/connect?integration=all#integrations" data-active={selectedId === "all"}>
              <span className={styles.railIdentity}><span className={styles.railIcon}><Link2 size={14} /></span><span className={styles.railText}><strong>All connections</strong><small>Overview</small></span></span>
            </Link>
            {integrations.map((item) => (
              <Link key={item.id} href={`/dashboard/connect?integration=${item.id}#integrations`} data-active={selectedId === item.id}>
                <span className={styles.railIdentity}><span className={styles.railIcon}>{item.icon}</span><span className={styles.railText}><strong>{item.name}</strong><small>{item.category}</small></span></span>
                <span className={`${styles.railStatus} ${dotClass(item.status)}`} aria-label={item.statusLabel} />
              </Link>
            ))}
          </nav>
        </aside>

        <div className={styles.content}>
          {selected ? (
            <article className={styles.detail}>
              <header className={styles.detailHead}>
                <div className={styles.detailIdentity}><span className={styles.detailIcon}>{selected.icon}</span><div><h2>{selected.name}</h2><p>{selected.description}</p></div></div>
                <span className={`${styles.statusPill} ${statusClass(selected.status)}`}>{selected.statusLabel}</span>
              </header>
              <div className={styles.detailBody}>
                <section className={styles.block}>
                  <h3>Connection control</h3>
                  <p>Orbit keeps secrets server-side. Open the provider to create or verify access, then manage the corresponding environment values in the Orbit project.</p>
                  <div className={styles.required}>
                    {selected.required.map((key) => <div key={key}><code>{key}</code><span>Server-side</span></div>)}
                  </div>
                  <div className={styles.detailActions}>
                    <a className={styles.primary} href={selected.providerUrl} target="_blank" rel="noreferrer">{selected.providerLabel}<ExternalLink size={11} /></a>
                    <a href={vercelEnvironmentUrl} target="_blank" rel="noreferrer"><Settings2 size={12} /> Manage Orbit secrets</a>
                  </div>
                </section>
                <section className={styles.block}>
                  <h3>Used across Orbit</h3>
                  <p>Once connected, these modules can consume the provider under organisation permissions.</p>
                  <div className={styles.usedBy}>{selected.usedBy.map((label) => <span key={label}>{label}</span>)}</div>
                  <div className={styles.detailActions}><Link href="/dashboard/security"><ShieldCheck size={12} /> Security & permissions</Link></div>
                </section>
              </div>
            </article>
          ) : (
            <div className={styles.allGrid}>
              {integrations.map((item) => (
                <Link key={item.id} href={`/dashboard/connect?integration=${item.id}#integrations`}>
                  <div className={styles.allGridHead}><span className={styles.railIdentity}><span className={styles.railIcon}>{item.icon}</span><strong>{item.name}</strong></span><span className={`${styles.statusPill} ${statusClass(item.status)}`}>{item.statusLabel}</span></div>
                  <p>{item.description}</p>
                </Link>
              ))}
            </div>
          )}

          {selectedId === "operator" ? (
            <div className={styles.operator}>
              <section className="foundry-split-layout">
                <article className="foundry-card">
                  <div className="foundry-card-head"><div><span className="foundry-card-eyebrow">Orbit Operator</span><h2>Generate a private key</h2></div><KeyRound aria-hidden="true" size={20} /></div>
                  <p>Orbit shows a plaintext key once. Only its secure hash is stored and every action checks scope, expiry and revocation.</p>
                  <OrbitActionKeyManager />
                </article>
                <aside className="foundry-card">
                  <div className="foundry-card-head"><div><span className="foundry-card-eyebrow">Connection recipe</span><h2>Connect ChatGPT</h2></div><Link2 aria-hidden="true" size={20} /></div>
                  <ol className={styles.setupList}>
                    <li><CheckCircle2 size={15} />Create a private Orbit Operator GPT.</li>
                    <li><CheckCircle2 size={15} />Import the Orbit OpenAPI schema.</li>
                    <li><CheckCircle2 size={15} />Choose API key → Bearer and paste the one-time key.</li>
                    <li><CheckCircle2 size={15} />Test a read action before governed writes.</li>
                  </ol>
                </aside>
              </section>
            </div>
          ) : null}
        </div>
      </section>

      <section className={`foundry-card ${styles.keys}`}>
        <div className="foundry-card-head"><div><span className="foundry-card-eyebrow">Access control</span><h2>Organisation connection keys</h2></div><ShieldCheck aria-hidden="true" size={20} /></div>
        {keys.length ? (
          <div className="foundry-attention-list">
            {keys.map((key) => {
              const inactive = !key.is_active;
              return (
                <article className="foundry-attention-row" key={key.id}>
                  <span className={`task-state ${inactive ? "task-state-cancelled" : "task-state-completed"}`}>{key.revoked_at ? "revoked" : inactive ? "expired" : "active"}</span>
                  <div><strong>{key.name}</strong><p>{key.token_prefix}… · Created {formatFoundryDate(key.created_at)}{key.last_used_at ? ` · Last used ${formatFoundryDate(key.last_used_at)}` : " · Not used yet"}</p></div>
                  {!key.revoked_at ? <form action={revokeOrbitActionKeyAction}><input name="keyId" type="hidden" value={key.id} /><button className="foundry-icon-link" title="Revoke this Orbit connection" type="submit"><Trash2 aria-hidden="true" size={16} /></button></form> : null}
                </article>
              );
            })}
          </div>
        ) : <p>No Orbit connection key has been created yet.</p>}
      </section>
    </main>
  );
}
