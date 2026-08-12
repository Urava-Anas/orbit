import Link from "next/link";
import {
  Activity,
  BarChart3,
  Code2,
  ExternalLink,
  Gauge,
  Github,
  Globe2,
  Link2,
  LockKeyhole,
  MousePointerClick,
  Rocket,
  Search,
  Settings2,
  ShieldCheck,
  Workflow,
  Zap,
} from "lucide-react";
import styles from "./WebsiteControlCenter.module.css";

type WebsiteControlCenterProps = {
  asset: {
    name: string;
    url: string | null;
    handle: string | null;
    external_id: string | null;
    status: "active" | "paused" | "disconnected";
    tracking_status: "connected" | "manual" | "unverified" | "error";
    is_primary: boolean;
  };
  leadCount: number;
  hotLeadCount: number;
};

function urlWithPath(url: string | null, path: string) {
  if (!url) return null;
  try {
    const target = new URL(url);
    target.pathname = path;
    target.search = "";
    target.hash = "";
    return target.toString();
  } catch {
    return null;
  }
}

function host(url: string | null) {
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function repoUrl(handle: string | null) {
  if (!handle) return null;
  const clean = handle.replace(/^@/, "").trim();
  return /^[\w.-]+\/[\w.-]+$/.test(clean) ? `https://github.com/${clean}` : null;
}

export function WebsiteControlCenter({ asset, leadCount, hotLeadCount }: WebsiteControlCenterProps) {
  const hostname = host(asset.url);
  const sitemap = urlWithPath(asset.url, "/sitemap.xml");
  const robots = urlWithPath(asset.url, "/robots.txt");
  const repository = repoUrl(asset.handle);
  const isVercel = Boolean(hostname?.endsWith(".vercel.app"));
  const https = Boolean(asset.url?.startsWith("https://"));
  const pageSpeed = asset.url ? `https://pagespeed.web.dev/analysis?url=${encodeURIComponent(asset.url)}` : null;

  return (
    <section className={styles.controlCenter} aria-label={`${asset.name} website controls`}>
      <div className={styles.controlCenterHead}>
        <div>
          <span>Website control center</span>
          <h4>Operate the site from one place.</h4>
          <p>Production, code, SEO, performance, lead capture and integrations stay visible without turning this page into a developer console.</p>
        </div>
        <div className={styles.controlHealth}>
          <span className={asset.status === "active" ? styles.healthDotGood : styles.healthDotWarn} />
          <div><strong>{asset.status === "active" ? "Operational" : "Needs attention"}</strong><small>{https ? "HTTPS protected" : "HTTPS not detected"}</small></div>
        </div>
      </div>

      <nav className={styles.managerNav} aria-label="Website manager sections">
        <a href="#site-production">Production</a>
        <a href="#site-seo">SEO</a>
        <a href="#site-performance">Performance</a>
        <a href="#website-leads">Leads</a>
        <a href="#site-integrations">Integrations</a>
        <a href="#site-settings">Settings</a>
      </nav>

      <div className={styles.managerModules}>
        <article className={styles.managerModule} id="site-production">
          <div className={styles.moduleTitle}><span><Rocket size={15} /></span><div><strong>Production & deployments</strong><small>Live environment and release controls</small></div></div>
          <div className={styles.moduleMetrics}>
            <div><small>Environment</small><strong>Production</strong></div>
            <div><small>Provider</small><strong>{isVercel ? "Vercel" : "External"}</strong></div>
            <div><small>Domain</small><strong>{hostname ?? "Not set"}</strong></div>
          </div>
          <div className={styles.moduleActions}>
            {isVercel ? <a href="https://vercel.com/dashboard" target="_blank" rel="noreferrer"><Workflow size={13} /> Deployments <ExternalLink size={11} /></a> : null}
            {asset.url ? <a href={asset.url} target="_blank" rel="noreferrer"><Globe2 size={13} /> Production site <ExternalLink size={11} /></a> : null}
            <Link href="/dashboard/connect"><Link2 size={13} /> Connect deployment API</Link>
          </div>
        </article>

        <article className={styles.managerModule}>
          <div className={styles.moduleTitle}><span><Code2 size={15} /></span><div><strong>Source code</strong><small>Repository and release source</small></div></div>
          <div className={styles.moduleMetrics}>
            <div><small>Repository</small><strong>{repository ? asset.handle : "Not linked"}</strong></div>
            <div><small>Project ID</small><strong>{asset.external_id ?? "Not set"}</strong></div>
            <div><small>Primary</small><strong>{asset.is_primary ? "Yes" : "No"}</strong></div>
          </div>
          <div className={styles.moduleActions}>
            {repository ? <a href={repository} target="_blank" rel="noreferrer"><Github size={13} /> Open repository <ExternalLink size={11} /></a> : null}
            <Link href="/dashboard/connect"><Link2 size={13} /> Connect GitHub</Link>
          </div>
        </article>

        <article className={styles.managerModule} id="site-seo">
          <div className={styles.moduleTitle}><span><Search size={15} /></span><div><strong>Pages & SEO</strong><small>Indexability and search controls</small></div></div>
          <div className={styles.moduleMetrics}>
            <div><small>Sitemap</small><strong>{sitemap ? "Available" : "URL required"}</strong></div>
            <div><small>Robots</small><strong>{robots ? "Check live" : "URL required"}</strong></div>
            <div><small>Tracking</small><strong>{asset.tracking_status}</strong></div>
          </div>
          <div className={styles.moduleActions}>
            {sitemap ? <a href={sitemap} target="_blank" rel="noreferrer">Sitemap <ExternalLink size={11} /></a> : null}
            {robots ? <a href={robots} target="_blank" rel="noreferrer">Robots.txt <ExternalLink size={11} /></a> : null}
            <a href="https://search.google.com/search-console" target="_blank" rel="noreferrer">Search Console <ExternalLink size={11} /></a>
          </div>
        </article>

        <article className={styles.managerModule} id="site-performance">
          <div className={styles.moduleTitle}><span><Gauge size={15} /></span><div><strong>Performance & quality</strong><small>Speed, experience and technical health</small></div></div>
          <div className={styles.moduleMetrics}>
            <div><small>HTTPS</small><strong>{https ? "Secure" : "Review"}</strong></div>
            <div><small>Preview</small><strong>Desktop / tablet / mobile</strong></div>
            <div><small>Performance data</small><strong>On demand</strong></div>
          </div>
          <div className={styles.moduleActions}>
            {pageSpeed ? <a href={pageSpeed} target="_blank" rel="noreferrer"><Zap size={13} /> Run PageSpeed <ExternalLink size={11} /></a> : null}
            <Link href="/dashboard/connect"><Activity size={13} /> Connect monitoring</Link>
          </div>
        </article>

        <article className={styles.managerModule}>
          <div className={styles.moduleTitle}><span><MousePointerClick size={15} /></span><div><strong>Lead capture</strong><small>Conversion and acquisition flow</small></div></div>
          <div className={styles.moduleMetrics}>
            <div><small>Website leads</small><strong>{leadCount}</strong></div>
            <div><small>Hot leads</small><strong>{hotLeadCount}</strong></div>
            <div><small>Capture</small><strong>{asset.status === "active" ? "Enabled" : asset.status}</strong></div>
          </div>
          <div className={styles.moduleActions}>
            <a href="#website-leads"><BarChart3 size={13} /> View lead records</a>
            <Link href="/dashboard/leads"><MousePointerClick size={13} /> Lead Engine</Link>
          </div>
        </article>

        <article className={styles.managerModule} id="site-integrations">
          <div className={styles.moduleTitle}><span><Link2 size={15} /></span><div><strong>Integrations</strong><small>Services that power this website</small></div></div>
          <div className={styles.integrationRows}>
            <div><span><Rocket size={13} /> Vercel</span><strong>{isVercel ? "Detected" : "Not detected"}</strong></div>
            <div><span><Github size={13} /> GitHub</span><strong>{repository ? "Linked" : "Not linked"}</strong></div>
            <div><span><BarChart3 size={13} /> Analytics</span><strong>{asset.tracking_status === "connected" ? "Connected" : "Not connected"}</strong></div>
          </div>
          <div className={styles.moduleActions}>
            <Link href="/dashboard/connect"><Link2 size={13} /> Manage integrations</Link>
            <a href="https://analytics.google.com" target="_blank" rel="noreferrer">Google Analytics <ExternalLink size={11} /></a>
          </div>
        </article>

        <article className={styles.managerModule}>
          <div className={styles.moduleTitle}><span><ShieldCheck size={15} /></span><div><strong>Security</strong><small>Public-site protection and access</small></div></div>
          <div className={styles.securityRows}>
            <div><LockKeyhole size={14} /><span><strong>Transport security</strong><small>{https ? "HTTPS is enabled on the managed URL." : "Use an HTTPS production URL."}</small></span></div>
            <div><ShieldCheck size={14} /><span><strong>Technical credentials</strong><small>Authentication and API secrets stay in Connect, not inside lead records.</small></span></div>
          </div>
          <div className={styles.moduleActions}><Link href="/dashboard/connect"><LockKeyhole size={13} /> Security connections</Link></div>
        </article>

        <article className={styles.managerModule} id="site-settings">
          <div className={styles.moduleTitle}><span><Settings2 size={15} /></span><div><strong>Website settings</strong><small>Identity, source state and ownership</small></div></div>
          <div className={styles.moduleMetrics}>
            <div><small>Status</small><strong>{asset.status}</strong></div>
            <div><small>Primary website</small><strong>{asset.is_primary ? "Yes" : "No"}</strong></div>
            <div><small>Lead attribution</small><strong>Website</strong></div>
          </div>
          <div className={styles.moduleActions}><a href="#website-edit"><Settings2 size={13} /> Edit website settings</a></div>
        </article>
      </div>
    </section>
  );
}
