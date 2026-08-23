import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  Globe2,
  Link2,
  Pause,
  Pencil,
  Play,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
import { notFound } from "next/navigation";
import { Notice } from "@/components/Notice";
import { formatRelativeDate, humanize } from "@/lib/format";
import type { Lead } from "@/lib/types";
import { requireWorkspace } from "@/lib/workspace";
import {
  createLeadSourceAsset,
  deleteLeadSourceAsset,
  setLeadSourceAssetStatus,
  updateLeadSourceAsset,
} from "../actions";
import styles from "../../leads.module.css";
import assetStyles from "./source-assets.module.css";
import { WebsiteControlCenter } from "./WebsiteControlCenter";
import { WebsitePreview } from "./WebsitePreview";

const sources = {
  website: { label: "Website", aliases: ["website"], description: "Website enquiries, forms and conversion-originated opportunities.", defaultType: "website" },
  google: { label: "Local Search", aliases: ["google", "local_search"], description: "Geoapify, Maps and legacy Google-discovered local business opportunities.", defaultType: "business_profile" },
  instagram: { label: "Instagram", aliases: ["instagram"], description: "Instagram DMs, profile actions and campaign-originated opportunities.", defaultType: "profile" },
  linkedin: { label: "LinkedIn", aliases: ["linkedin"], description: "LinkedIn prospecting, inbound messages and professional-network leads.", defaultType: "profile" },
  facebook: { label: "Facebook", aliases: ["facebook"], description: "Facebook page, message and campaign-originated opportunities.", defaultType: "page" },
  youtube: { label: "YouTube", aliases: ["youtube"], description: "YouTube discovery, content and video CTA-originated opportunities.", defaultType: "profile" },
  referrals: { label: "Referrals", aliases: ["referral", "referrals"], description: "Warm introductions, customer referrals and partner-sourced opportunities.", defaultType: "referral_program" },
  "cold-list": { label: "Cold List Upload", aliases: ["other", "cold_list", "upload"], description: "Imported prospect lists that still require verification before outreach.", defaultType: "list" },
} as const;

const assetTypes = ["website", "account", "profile", "page", "business_profile", "list", "referral_program", "link"] as const;
const trackingStatuses = ["connected", "manual", "unverified", "error"] as const;
type SourceSlug = keyof typeof sources;

type SourceAsset = {
  id: string;
  source_slug: SourceSlug;
  asset_type: string;
  name: string;
  url: string | null;
  handle: string | null;
  external_id: string | null;
  status: "active" | "paused" | "disconnected";
  tracking_status: "connected" | "manual" | "unverified" | "error";
  is_primary: boolean;
  notes: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
};

type PageProps = {
  params: Promise<{ source: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
};

export async function generateMetadata({ params }: { params: Promise<{ source: string }> }): Promise<Metadata> {
  const { source } = await params;
  const config = sources[source as SourceSlug];
  const title = source === "website" ? "Website Manager — Lead Engine" : config ? `${config.label} — Lead Engine` : "Lead Source — Lead Engine";
  return { title, robots: { index: false, follow: false } };
}

function initials(lead: Lead) {
  return (lead.company ?? lead.name)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "L";
}

function statusClass(status: SourceAsset["status"]) {
  if (status === "active") return assetStyles.active;
  if (status === "paused") return assetStyles.paused;
  return assetStyles.disconnected;
}

function siteHost(url: string | null) {
  if (!url) return "No domain";
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function AssetFields({ asset, source, defaultType }: { asset?: SourceAsset; source: SourceSlug; defaultType: string }) {
  return (
    <>
      <input name="source" type="hidden" value={source} />
      {asset ? <input name="id" type="hidden" value={asset.id} /> : null}
      <label className={assetStyles.field}><span>Name</span><input name="name" defaultValue={asset?.name ?? ""} required minLength={2} placeholder="e.g. Urava Website" /></label>
      <label className={assetStyles.field}><span>Type</span><select name="assetType" defaultValue={asset?.asset_type ?? defaultType}>{assetTypes.map((type) => <option key={type} value={type}>{humanize(type)}</option>)}</select></label>
      <label className={`${assetStyles.field} ${assetStyles.wide}`}><span>Real URL / account link</span><input name="url" type="url" defaultValue={asset?.url ?? ""} placeholder="https://..." /></label>
      <label className={assetStyles.field}><span>Repository / handle</span><input name="handle" defaultValue={asset?.handle ?? ""} placeholder="owner/repository or @account" /></label>
      <label className={assetStyles.field}><span>External project ID</span><input name="externalId" defaultValue={asset?.external_id ?? ""} placeholder="e.g. Vercel project slug" /></label>
      <label className={assetStyles.field}><span>Status</span><select name="status" defaultValue={asset?.status ?? "active"}><option value="active">Active</option><option value="paused">Paused</option><option value="disconnected">Disconnected</option></select></label>
      <label className={assetStyles.field}><span>Tracking</span><select name="trackingStatus" defaultValue={asset?.tracking_status ?? "manual"}>{trackingStatuses.map((status) => <option key={status} value={status}>{humanize(status)}</option>)}</select></label>
      <label className={`${assetStyles.field} ${assetStyles.wide}`}><span>Notes</span><textarea name="notes" defaultValue={asset?.notes ?? ""} placeholder="What is this source used for?" /></label>
      <label className={`${assetStyles.checkField} ${assetStyles.wide}`}><input name="isPrimary" type="checkbox" defaultChecked={asset?.is_primary ?? false} /> Make this the primary {sources[source].label} source</label>
    </>
  );
}

export default async function LeadSourcePage({ params, searchParams }: PageProps) {
  const [{ source }, query] = await Promise.all([params, searchParams]);
  const config = sources[source as SourceSlug];
  if (!config) notFound();
  const sourceSlug = source as SourceSlug;
  const isWebsiteManager = sourceSlug === "website";

  const { supabase, workspace } = await requireWorkspace();
  const [leadResult, assetResult] = await Promise.all([
    supabase
      .from("leads")
      .select("id,name,company,email,phone,whatsapp,contact_person,contact_role,website_url,enrichment_status,enrichment_confidence,enrichment_source,enriched_at,source,stage,niche,lead_score,estimated_value,currency,pain_point,next_action,next_action_at,google_maps_url,notes,legacy_notion_url,imported_at,created_at")
      .eq("workspace_id", workspace.id)
      .in("source", [...config.aliases])
      .order("lead_score", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("lead_source_assets")
      .select("id,source_slug,asset_type,name,url,handle,external_id,status,tracking_status,is_primary,notes,last_synced_at,created_at,updated_at")
      .eq("workspace_id", workspace.id)
      .eq("source_slug", sourceSlug)
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: true }),
  ]);

  const leads = (leadResult.data ?? []) as Lead[];
  const assets = (assetResult.data ?? []) as SourceAsset[];
  const active = leads.filter((lead) => !["won", "lost"].includes(lead.stage));
  const hot = active.filter((lead) => (lead.lead_score ?? 0) >= 85);
  const won = leads.filter((lead) => lead.stage === "won");
  const scored = leads.filter((lead) => lead.lead_score !== null);
  const averageScore = scored.length ? Math.round(scored.reduce((sum, lead) => sum + (lead.lead_score ?? 0), 0) / scored.length) : 0;
  const activeAssets = assets.filter((asset) => asset.status === "active").length;

  return (
    <main className={styles.sourceWorkspace}>
      <header className={styles.sourceWorkspaceHeader}>
        <div>
          <Link href="/dashboard/leads"><ArrowLeft size={14} aria-hidden="true" /> Lead Engine</Link>
          <h1>{isWebsiteManager ? "Website Manager" : config.label}</h1>
          <p>{isWebsiteManager ? "Preview, operate and improve every website that feeds Orbit's Lead Engine." : config.description}</p>
        </div>
        <div className={assetStyles.headerActions}>
          <Link className={assetStyles.technicalButton} href="/dashboard/connect"><Link2 size={14} /> Technical connection</Link>
          <a className={assetStyles.addButton} href="#add-source-asset"><Plus size={14} /> {isWebsiteManager ? "Add website" : "Add account / site"}</a>
        </div>
      </header>

      <Notice error={query.error} notice={query.notice} />

      {isWebsiteManager ? (
        <section className={styles.sourceStats}>
          <article className={styles.sourceStat}><span>Websites</span><strong>{assets.length}</strong><small>Sites managed by Orbit</small></article>
          <article className={styles.sourceStat}><span>Active sites</span><strong>{activeAssets}</strong><small>Lead capture currently enabled</small></article>
          <article className={styles.sourceStat}><span>Website leads</span><strong>{leads.length}</strong><small>Attributed acquisition records</small></article>
          <article className={styles.sourceStat}><span>Hot leads</span><strong>{hot.length}</strong><small>Score 85 or higher</small></article>
        </section>
      ) : (
        <section className={styles.sourceStats}>
          <article className={styles.sourceStat}><span>Total leads</span><strong>{leads.length}</strong><small>All records from this source</small></article>
          <article className={styles.sourceStat}><span>Managed sources</span><strong>{assets.length}</strong><small>{activeAssets} active account{activeAssets === 1 ? "" : "s"} / link{activeAssets === 1 ? "" : "s"}</small></article>
          <article className={styles.sourceStat}><span>Hot leads</span><strong>{hot.length}</strong><small>Score 85 or higher</small></article>
          <article className={styles.sourceStat}><span>Average score</span><strong>{averageScore || "—"}</strong><small>{won.length} won and handed to Sales Desk</small></article>
        </section>
      )}

      {isWebsiteManager ? (
        <section className={assetStyles.websiteManagerPanel} aria-labelledby="website-manager-heading">
          <div className={assetStyles.websiteManagerHeader}>
            <div>
              <h2 id="website-manager-heading">Managed websites</h2>
              <p>Live preview, production controls, code, SEO, performance, integrations, security and lead capture in one operating surface.</p>
            </div>
            <a className={assetStyles.addButton} href="#add-source-asset"><Plus size={14} /> Add website</a>
          </div>

          {assets.length ? (
            <div className={assetStyles.websiteStack}>
              {assets.map((asset) => (
                <article className={assetStyles.websiteManagerCard} key={asset.id}>
                  <WebsitePreview name={asset.name} url={asset.url} />

                  <div className={assetStyles.websiteManagerDetails}>
                    <div className={assetStyles.websiteManagerIdentity}>
                      <div>
                        <h3>{asset.name}</h3>
                        <p>{asset.url ?? "No live URL added"}</p>
                      </div>
                      <div className={assetStyles.badges}>
                        {asset.is_primary ? <span className={`${assetStyles.badge} ${assetStyles.primary}`}>Primary</span> : null}
                        <span className={`${assetStyles.badge} ${statusClass(asset.status)}`}>{humanize(asset.status)}</span>
                      </div>
                    </div>

                    <div className={assetStyles.websiteStatusGrid}>
                      <div><small>Domain</small><strong>{siteHost(asset.url)}</strong></div>
                      <div><small>Lead capture</small><strong>{asset.status === "active" ? "Enabled" : asset.status === "paused" ? "Paused" : "Disconnected"}</strong></div>
                      <div><small>Tracking</small><strong>{humanize(asset.tracking_status)}</strong></div>
                      <div><small>Last sync</small><strong>{asset.last_synced_at ? formatRelativeDate(asset.last_synced_at) : "Manual"}</strong></div>
                    </div>

                    <div className={assetStyles.websiteControlGrid}>
                      {asset.url ? (
                        <a className={assetStyles.websiteControl} href={asset.url} target="_blank" rel="noreferrer">
                          <ExternalLink size={16} /><div><strong>Visit website</strong><small>Open the live production site.</small></div>
                        </a>
                      ) : (
                        <div className={assetStyles.websiteControl}><Globe2 size={16} /><div><strong>Website URL</strong><small>Add a live URL from Edit before visiting.</small></div></div>
                      )}
                      <a className={assetStyles.websiteControl} href="#website-leads"><Search size={16} /><div><strong>Website leads</strong><small>View every lead attributed to this site source.</small></div></a>
                      <Link className={assetStyles.websiteControl} href="/dashboard/connect"><Link2 size={16} /><div><strong>Technical connection</strong><small>Manage authentication, APIs and provider access.</small></div></Link>
                      <form action={setLeadSourceAssetStatus}>
                        <input name="id" type="hidden" value={asset.id} />
                        <input name="source" type="hidden" value={sourceSlug} />
                        <input name="status" type="hidden" value={asset.status === "active" ? "paused" : "active"} />
                        <button className={assetStyles.websiteControlButton} type="submit">
                          {asset.status === "active" ? <Pause size={16} /> : <Play size={16} />}
                          <div><strong>{asset.status === "active" ? "Pause lead capture" : "Activate lead capture"}</strong><small>{asset.status === "active" ? "Stop this site from participating in acquisition." : "Return this site to active acquisition."}</small></div>
                        </button>
                      </form>
                    </div>

                    <WebsiteControlCenter asset={asset} leadCount={leads.length} hotLeadCount={hot.length} />

                    <div className={assetStyles.websiteManagerActions}>
                      {asset.url ? <a className={assetStyles.visitButton} href={asset.url} target="_blank" rel="noreferrer"><ExternalLink size={12} /> Visit website</a> : null}
                      <details className={assetStyles.editDetails} id="website-edit">
                        <summary><Pencil size={12} /> Edit website</summary>
                        <form action={updateLeadSourceAsset} className={assetStyles.websiteManagerEdit}>
                          <AssetFields asset={asset} source={sourceSlug} defaultType={config.defaultType} />
                          <div className={assetStyles.formActions}><button type="submit">Save changes</button></div>
                        </form>
                      </details>
                      <form action={deleteLeadSourceAsset}>
                        <input name="id" type="hidden" value={asset.id} />
                        <input name="source" type="hidden" value={sourceSlug} />
                        <button className={assetStyles.dangerButton} type="submit"><Trash2 size={12} /> Remove website</button>
                      </form>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className={assetStyles.emptyAssets}>
              <strong>No website is managed yet.</strong>
              <p>Add the first website and Orbit will give it a live preview, management controls and its attributed lead history.</p>
            </div>
          )}
        </section>
      ) : (
        <section className={assetStyles.assetPanel} aria-labelledby="managed-sources-heading">
          <div className={assetStyles.assetHeading}>
            <div>
              <h2 id="managed-sources-heading">Managed websites / accounts / links</h2>
              <p>Manage the real business-facing sources that produce {config.label} leads. Authentication and API credentials stay under Connect.</p>
            </div>
            <a className={assetStyles.addButton} href="#add-source-asset"><Plus size={14} /> Add source</a>
          </div>

          {assets.length ? (
            <div className={assetStyles.assetGrid}>
              {assets.map((asset) => (
                <article className={assetStyles.assetCard} key={asset.id}>
                  <div className={assetStyles.assetTop}>
                    <div className={assetStyles.assetIdentity}>
                      <span className={assetStyles.assetIcon}>{asset.asset_type === "website" ? <Globe2 size={17} /> : <Link2 size={17} />}</span>
                      <div><strong>{asset.name}</strong><small>{asset.handle ?? humanize(asset.asset_type)}</small></div>
                    </div>
                    <div className={assetStyles.badges}>
                      {asset.is_primary ? <span className={`${assetStyles.badge} ${assetStyles.primary}`}>Primary</span> : null}
                      <span className={`${assetStyles.badge} ${statusClass(asset.status)}`}>{humanize(asset.status)}</span>
                    </div>
                  </div>

                  {asset.url ? <a className={assetStyles.assetLink} href={asset.url} target="_blank" rel="noreferrer"><ExternalLink size={13} /><span>{asset.url}</span></a> : <div className={assetStyles.assetLink}><Link2 size={13} /><span>No public URL added</span></div>}

                  <div className={assetStyles.assetMeta}>
                    <div><small>Tracking</small><strong>{humanize(asset.tracking_status)}</strong></div>
                    <div><small>Account ID</small><strong>{asset.external_id ?? "Not set"}</strong></div>
                    <div><small>Last sync</small><strong>{asset.last_synced_at ? formatRelativeDate(asset.last_synced_at) : "Manual"}</strong></div>
                  </div>

                  <div className={assetStyles.assetActions}>
                    <details className={assetStyles.editDetails}>
                      <summary><Pencil size={12} /> Edit</summary>
                      <form action={updateLeadSourceAsset} className={assetStyles.editForm}>
                        <AssetFields asset={asset} source={sourceSlug} defaultType={config.defaultType} />
                        <div className={assetStyles.formActions}><button type="submit">Save changes</button></div>
                      </form>
                    </details>
                    <form action={setLeadSourceAssetStatus}>
                      <input name="id" type="hidden" value={asset.id} />
                      <input name="source" type="hidden" value={sourceSlug} />
                      <input name="status" type="hidden" value={asset.status === "active" ? "paused" : "active"} />
                      <button type="submit">{asset.status === "active" ? <Pause size={12} /> : <Play size={12} />}{asset.status === "active" ? "Pause" : "Activate"}</button>
                    </form>
                    <form action={deleteLeadSourceAsset}>
                      <input name="id" type="hidden" value={asset.id} />
                      <input name="source" type="hidden" value={sourceSlug} />
                      <button className={assetStyles.dangerButton} type="submit"><Trash2 size={12} /> Remove</button>
                    </form>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className={assetStyles.emptyAssets}>
              <strong>No {config.label} account, website or link is managed yet.</strong>
              <p>Add the real source first. Orbit will keep business-facing source management here while Connect handles technical authentication.</p>
            </div>
          )}
        </section>
      )}

      <section className={`${styles.sourceWorkspaceGrid} ${isWebsiteManager ? assetStyles.websiteLeadAnchor : ""}`} id={isWebsiteManager ? "website-leads" : undefined}>
        <article className={styles.leadsPanel} style={isWebsiteManager ? { gridColumn: "1 / -1" } : undefined}>
          <div className={styles.panelHeadingRow} style={{ padding: "15px 16px" }}>
            <div><h2>{config.label} leads</h2><p>Verified source-specific acquisition records.</p></div>
            <Link href="/dashboard/leads">Back to all leads</Link>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.leadTable}>
              <thead><tr><th>Lead</th><th>Contact</th><th>Score</th><th>Status</th><th>Next action</th><th>Source link</th><th>Added</th></tr></thead>
              <tbody>
                {leads.map((lead) => (
                  <tr key={lead.id}>
                    <td><div className={styles.leadIdentity}><span>{initials(lead)}</span><div><strong>{lead.company ?? lead.name}</strong><small>{lead.niche ?? "Niche not set"}</small></div></div></td>
                    <td><strong>{lead.contact_person ?? "Not verified"}</strong><small>{lead.contact_role ? humanize(lead.contact_role) : lead.phone ?? lead.email ?? "No public contact"}</small></td>
                    <td><span className={styles.scorePill}>{lead.lead_score ?? "—"}</span></td>
                    <td>{humanize(lead.stage)}</td>
                    <td><strong className={styles.nextActionText}>{lead.next_action ?? "Set next action"}</strong>{lead.next_action_at ? <small>{formatRelativeDate(lead.next_action_at)}</small> : null}</td>
                    <td>{lead.google_maps_url ? <a href={lead.google_maps_url} target="_blank" rel="noreferrer">Open <ExternalLink size={11} /></a> : "—"}</td>
                    <td>{formatRelativeDate(lead.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!leads.length ? <div className={styles.emptyState}>No leads yet from this source. Manage the real source above, then new attributed leads will appear here.</div> : null}
          </div>
        </article>

        {!isWebsiteManager ? (
          <aside className={styles.sideCard}>
            <h2>Source controls</h2>
            <div className={styles.sourceControls}>
              <div className={styles.controlItem}><ShieldCheck size={17} /><p><strong>Verify before outreach</strong><small>Deduplicate and confirm a valid business contact before any outbound action.</small></p></div>
              <div className={styles.controlItem}><Sparkles size={17} /><p><strong>Score against ICP</strong><small>Prioritise fit, intent, proof gap and delivery feasibility.</small></p></div>
              <div className={styles.controlItem}><Search size={17} /><p><strong>Keep attribution</strong><small>Every lead retains this source through qualification and the Won handoff.</small></p></div>
              <div className={styles.controlItem}><CheckCircle2 size={17} /><p><strong>Won boundary</strong><small>When the deal is won, the client record moves to Sales Desk.</small></p></div>
            </div>
          </aside>
        ) : null}
      </section>

      <section className={assetStyles.modal} id="add-source-asset" aria-label={`Add ${config.label} source`}>
        <div className={assetStyles.modalCard}>
          <div className={assetStyles.modalHead}>
            <div><h2>{isWebsiteManager ? "Add website" : `Add ${config.label} source`}</h2><p>{isWebsiteManager ? "Add a live website for Orbit to preview, manage and attribute leads to." : "Add the real website, account, profile, list or link that Orbit should manage."}</p></div>
            <Link className={assetStyles.closeButton} href={`/dashboard/leads/sources/${sourceSlug}`}>×</Link>
          </div>
          <form action={createLeadSourceAsset} className={assetStyles.addForm}>
            <AssetFields source={sourceSlug} defaultType={config.defaultType} />
            <div className={assetStyles.formActions}><button type="submit">{isWebsiteManager ? "Save website" : "Save source"}</button></div>
          </form>
        </div>
      </section>
    </main>
  );
}
