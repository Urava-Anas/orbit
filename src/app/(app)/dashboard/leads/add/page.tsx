import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FileSpreadsheet,
  Globe2,
  MapPin,
  Phone,
  Search,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  UserPlus,
} from "lucide-react";
import { createLead } from "@/app/(app)/dashboard/lead-actions";
import { Notice } from "@/components/Notice";
import { formatRelativeDate, humanize } from "@/lib/format";
import type { Lead } from "@/lib/types";
import { requireWorkspace } from "@/lib/workspace";
import {
  analyzeFinderResult,
  approveSelectedFinderResults,
  rejectFinderResult,
  searchPlaces,
} from "../finder/actions";
import engineStyles from "../leads.module.css";
import { importCsvLeads } from "./import-actions";
import styles from "./add-lead.module.css";

export const metadata: Metadata = {
  title: "Add Lead",
  robots: { index: false, follow: false },
};

const stages = ["new", "raw", "scored", "qualified", "contacted", "interested", "demo_booked", "proposal", "won", "lost"] as const;
const activeStages = new Set(["new", "raw", "scored", "qualified", "contacted", "interested", "demo_booked", "proposal"]);

type PageProps = {
  searchParams: Promise<{
    error?: string;
    notice?: string;
    mode?: string;
    q?: string;
    stage?: string;
    priority?: string;
  }>;
};

type FinderResult = {
  id: string;
  business_name: string;
  formatted_address: string | null;
  primary_type: string | null;
  business_status: string | null;
  google_maps_url: string | null;
  website_url: string | null;
  phone: string | null;
  rating: number | null;
  review_count: number | null;
  niche: string;
  total_score: number | null;
  detected_weakness: string | null;
  recommended_offer: string | null;
  status: string;
  lead_id: string | null;
  created_at: string;
};

type FinderSearch = {
  id: string;
  query_text: string;
  result_count: number;
  status: string;
  created_at: string;
};

function modeOf(value: string | undefined) {
  return value === "manual" || value === "import" ? value : "google";
}

function stageOf(value: string | undefined) {
  return stages.includes(value as (typeof stages)[number]) ? value : "all";
}

function isOverdue(lead: Lead, now: number) {
  if (!activeStages.has(lead.stage) || !lead.next_action_at) return false;
  const time = new Date(lead.next_action_at).getTime();
  return Number.isFinite(time) && time < now;
}

function stageTone(stage: string) {
  if (stage === "won") return "green";
  if (["proposal", "demo_booked", "interested"].includes(stage)) return "amber";
  if (["contacted", "qualified"].includes(stage)) return "blue";
  if (stage === "lost") return "red";
  return "neutral";
}

function initials(lead: Lead) {
  return (lead.company ?? lead.name)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "L";
}

function sourceLabel(source: string) {
  const labels: Record<string, string> = {
    google: "Google Search",
    referral: "Referral",
    referrals: "Referrals",
    cold_list: "Cold List",
  };
  return labels[source] ?? humanize(source);
}

function sourceHref(source: string) {
  const slug = source === "referral" ? "referrals" : source === "other" ? "cold-list" : source;
  return `/dashboard/leads/sources/${slug}`;
}

function scoreClass(score: number | null) {
  if (score === null) return styles.scorePending;
  if (score >= 85) return styles.scoreHot;
  if (score >= 70) return styles.scoreWarm;
  return styles.scoreCool;
}

export default async function AddLeadPage({ searchParams }: PageProps) {
  const { supabase, workspace } = await requireWorkspace();
  const params = await searchParams;
  const mode = modeOf(params.mode);
  const apiReady = Boolean(process.env.GOOGLE_PLACES_API_KEY?.trim());
  const nowIso = new Date().toISOString();

  const [leadResult, resultQuery, searchQuery] = await Promise.all([
    supabase
      .from("leads")
      .select("id,name,company,email,phone,whatsapp,source,stage,niche,lead_score,estimated_value,currency,pain_point,next_action,next_action_at,google_maps_url,notes,legacy_notion_url,imported_at,created_at")
      .eq("workspace_id", workspace.id)
      .order("lead_score", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("lead_finder_results")
      .select("id,business_name,formatted_address,primary_type,business_status,google_maps_url,website_url,phone,rating,review_count,niche,total_score,detected_weakness,recommended_offer,status,lead_id,created_at")
      .eq("workspace_id", workspace.id)
      .gt("expires_at", nowIso)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("lead_finder_searches")
      .select("id,query_text,result_count,status,created_at")
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const leads = (leadResult.data ?? []) as Lead[];
  const results = (resultQuery.data ?? []) as FinderResult[];
  const searches = (searchQuery.data ?? []) as FinderSearch[];
  const reviewResults = results.filter((item) => ["new", "analyzed"].includes(item.status));
  const q = params.q?.trim().toLowerCase() ?? "";
  const stage = stageOf(params.stage);
  const priority = params.priority ?? "all";
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();

  const visibleLeads = leads.filter((lead) => {
    const text = [lead.company, lead.name, lead.niche, lead.pain_point, lead.next_action].filter(Boolean).join(" ").toLowerCase();
    if (q && !text.includes(q)) return false;
    if (stage !== "all" && lead.stage !== stage) return false;
    if (priority === "hot" && (lead.lead_score ?? 0) < 85) return false;
    if (priority === "overdue" && !isOverdue(lead, now)) return false;
    return true;
  });

  return (
    <main className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <span className={styles.eyebrow}>Lead Engine · Add Lead</span>
          <h1>Add Lead</h1>
          <p>Generate, review or manually add opportunities before they enter the Lead Engine.</p>
        </div>
        <Link className={styles.backButton} href="/dashboard/leads"><ArrowLeft size={15} /> Back to Lead Engine</Link>
      </header>

      <Notice error={params.error} notice={params.notice} />

      <section className={styles.methodPanel} aria-labelledby="add-method-title">
        <div className={styles.sectionHeading}>
          <div><h2 id="add-method-title">Choose how you want to add leads</h2><p>Each intake path ends in the same controlled Lead Engine.</p></div>
        </div>
        <div className={styles.methodGrid}>
          <Link className={`${styles.methodCard} ${mode === "google" ? styles.activeMethod : ""}`} href="/dashboard/leads/add?mode=google">
            <span className={styles.methodIcon}><Search size={21} /></span>
            <strong>Find by Google Profile</strong>
            <small>Search businesses by niche and place, then review before adding.</small>
            {mode === "google" ? <CheckCircle2 className={styles.methodCheck} size={18} /> : null}
          </Link>
          <Link className={`${styles.methodCard} ${mode === "manual" ? styles.activeMethod : ""}`} href="/dashboard/leads/add?mode=manual">
            <span className={styles.methodIcon}><UserPlus size={21} /></span>
            <strong>Manual Lead Entry</strong>
            <small>Add a referral, walk-in, WhatsApp lead or any business you already know.</small>
            {mode === "manual" ? <CheckCircle2 className={styles.methodCheck} size={18} /> : null}
          </Link>
          <Link className={`${styles.methodCard} ${mode === "import" ? styles.activeMethod : ""}`} href="/dashboard/leads/add?mode=import">
            <span className={styles.methodIcon}><FileSpreadsheet size={21} /></span>
            <strong>Import Leads</strong>
            <small>Upload a CSV list; Orbit skips existing companies, emails and phone numbers.</small>
            {mode === "import" ? <CheckCircle2 className={styles.methodCheck} size={18} /> : null}
          </Link>
        </div>
      </section>

      {mode === "google" ? (
        <div className={styles.workspaceGrid}>
          <div className={styles.mainColumn}>
            <section className={styles.panel}>
              <div className={styles.panelTitle}>
                <span className={styles.methodIcon}><Sparkles size={20} /></span>
                <div><h2>Find by Google Profile</h2><p>Discover businesses from Google Places using a focused search brief.</p></div>
              </div>

              {!apiReady ? (
                <div className={styles.setupBanner}><ShieldCheck size={18} /><div><strong>Google Places connection required</strong><p>Add the server-only GOOGLE_PLACES_API_KEY in Vercel to enable live search.</p></div></div>
              ) : null}

              <form action={searchPlaces} className={styles.finderForm}>
                <fieldset className={styles.stepBlock}>
                  <legend><span>1</span> Select niches</legend>
                  <p>Enter one or more business types, separated by commas.</p>
                  <input name="niches" minLength={2} maxLength={500} placeholder="Restaurant, Cafe, Fast Food" required />
                  <small>Up to 8 niches per generation run.</small>
                </fieldset>

                <fieldset className={styles.stepBlock}>
                  <legend><span>2</span> Choose place</legend>
                  <p>Enter a city, area or specific place.</p>
                  <label className={styles.locationInput}><MapPin size={16} /><input name="location" minLength={2} maxLength={160} placeholder="Lahore, Pakistan" required /></label>
                </fieldset>

                <fieldset className={styles.stepBlock}>
                  <legend><span>3</span> Search settings</legend>
                  <p>Control how many leads Orbit finds and what quality signals are required.</p>
                  <div className={styles.inputGrid}>
                    <label><span>Amount of leads</span><select name="requestedCount" defaultValue="50"><option value="10">10</option><option value="20">20</option><option value="30">30</option><option value="50">50</option><option value="75">75</option><option value="100">100</option></select></label>
                    <label><span>Search radius</span><select name="radiusKm" defaultValue="25"><option value="5">5 km</option><option value="10">10 km</option><option value="25">25 km</option><option value="50">50 km</option></select></label>
                    <label><span>Minimum rating</span><select name="minRating" defaultValue="0"><option value="0">Any rating</option><option value="3.5">3.5+</option><option value="4">4.0+</option><option value="4.5">4.5+</option></select></label>
                    <label><span>Minimum reviews</span><select name="minReviews" defaultValue="10"><option value="0">Any</option><option value="5">5+</option><option value="10">10+</option><option value="25">25+</option><option value="50">50+</option><option value="100">100+</option></select></label>
                    <label><span>Sort results</span><select name="sortBy" defaultValue="relevance"><option value="relevance">Relevance</option><option value="rating">Highest rating</option><option value="reviews">Most reviews</option></select></label>
                  </div>
                  <div className={styles.toggleGrid}>
                    <label><input type="checkbox" name="hasPhone" defaultChecked /><span>Has phone number</span></label>
                    <label><input type="checkbox" name="hasWebsite" /><span>Has website</span></label>
                    <label><input type="checkbox" name="openNow" /><span>Open now</span></label>
                    <label><input type="checkbox" name="operationalOnly" defaultChecked /><span>Operational businesses</span></label>
                    <label className={styles.lockedToggle}><input type="checkbox" defaultChecked disabled /><span>Exclude duplicates</span></label>
                  </div>
                  <label className={styles.fullField}><span>Problem to look for <small>Optional</small></span><textarea name="targetProblem" maxLength={500} placeholder="Weak website, poor conversion flow, missing proof..." /></label>
                </fieldset>

                <button className={styles.findButton} type="submit" disabled={!apiReady}><Search size={17} /> Find Businesses</button>
                <p className={styles.buttonNote}>Results are staged for review first. Nothing enters the Lead Engine automatically.</p>
              </form>
            </section>

            <section className={styles.reviewSection} id="review-results">
              <div className={styles.reviewHeading}>
                <div><span className={styles.eyebrow}>Review before adding</span><h2>Google results</h2><p>Verify the business, score and visible opportunity before approving it.</p></div>
                <span className={styles.reviewCount}>{reviewResults.length} awaiting review</span>
              </div>

              {results.length ? (
                <form action={approveSelectedFinderResults}>
                  <div className={styles.resultList}>
                    {results.map((result) => (
                      <article className={`${styles.resultCard} ${!["new", "analyzed"].includes(result.status) ? styles.decidedCard : ""}`} key={result.id}>
                        <div className={styles.resultSelect}>
                          {result.status === "analyzed" ? <input type="checkbox" name="ids" value={result.id} aria-label={`Select ${result.business_name}`} /> : <span />}
                        </div>
                        <div className={styles.resultBody}>
                          <div className={styles.resultTitle}><div><h3>{result.business_name}</h3><p>{result.formatted_address ?? "Address not returned"}</p></div><span className={styles.status}>{humanize(result.status)}</span></div>
                          <div className={styles.resultMeta}>
                            <span>{result.niche}</span>
                            <span>{result.rating !== null ? `${result.rating.toFixed(1)} ★ · ${result.review_count ?? 0} reviews` : "No rating"}</span>
                            <span>{result.phone ? "Phone found" : "No phone"}</span>
                            <span>{result.website_url ? "Website found" : "No website"}</span>
                          </div>
                          <p className={styles.weakness}>{result.detected_weakness ?? "Analyze this result to calculate fit and opportunity."}</p>
                          {result.recommended_offer ? <strong className={styles.offer}>{result.recommended_offer}</strong> : null}
                          <div className={styles.resultLinks}>
                            {result.google_maps_url ? <a href={result.google_maps_url} target="_blank" rel="noreferrer"><MapPin size={13} /> Maps</a> : null}
                            {result.website_url ? <a href={result.website_url} target="_blank" rel="noreferrer"><Globe2 size={13} /> Website</a> : null}
                            {result.phone ? <a href={`tel:${result.phone}`}><Phone size={13} /> Call</a> : null}
                          </div>
                        </div>
                        <aside className={styles.resultScore}>
                          <strong className={scoreClass(result.total_score)}>{result.total_score ?? "—"}</strong><small>score</small>
                          {result.status === "new" ? (
                            <button formAction={analyzeFinderResult} name="id" value={result.id} className={styles.smallButton}>Analyze</button>
                          ) : null}
                          {result.status === "analyzed" ? (
                            <button formAction={rejectFinderResult} name="id" value={result.id} className={styles.rejectButton}>Reject</button>
                          ) : null}
                        </aside>
                      </article>
                    ))}
                  </div>
                  {reviewResults.some((item) => item.status === "analyzed") ? (
                    <div className={styles.bulkBar}><div><strong>Add selected leads</strong><span>Only checked, analyzed businesses enter the Lead Engine.</span></div><button type="submit">Add selected to Lead Engine <ArrowRight size={15} /></button></div>
                  ) : null}
                </form>
              ) : (
                <div className={styles.emptyResults}><Search size={23} /><strong>No generated businesses yet.</strong><p>Run a niche + place search above. Results will appear here for review.</p></div>
              )}
            </section>
          </div>

          <aside className={styles.sideColumn}>
            <section className={styles.sideCard}><h2>What happens next?</h2><ol><li><span>1</span><div><strong>Find Businesses</strong><p>Orbit searches Google profiles using your niche, place and filters.</p></div></li><li><span>2</span><div><strong>Verify & Score</strong><p>Duplicates are removed and quality/contact signals are scored.</p></div></li><li><span>3</span><div><strong>Review Results</strong><p>You choose which businesses are worth keeping.</p></div></li><li><span>4</span><div><strong>Add to Lead Engine</strong><p>Only approved records move into the active pipeline.</p></div></li></ol></section>
            <section className={styles.sideCard}><h2>Recent generations</h2>{searches.length ? <div className={styles.historyList}>{searches.map((search) => <div key={search.id}><strong>{search.query_text}</strong><span>{search.result_count} results · {humanize(search.status)}</span><small>{formatRelativeDate(search.created_at)}</small></div>)}</div> : <p className={styles.muted}>No Google generation history yet.</p>}</section>
            <section className={styles.sideCard}><h2>Built-in guardrails</h2><div className={styles.guardList}><p><ShieldCheck size={15} /> Place-ID duplicate prevention</p><p><ShieldCheck size={15} /> Founder review before pipeline entry</p><p><ShieldCheck size={15} /> Workspace-isolated records</p><p><ShieldCheck size={15} /> Rejected businesses are remembered</p></div></section>
          </aside>
        </div>
      ) : null}

      {mode === "manual" ? (
        <section className={styles.panel}>
          <div className={styles.panelTitle}><span className={styles.methodIcon}><UserPlus size={20} /></span><div><h2>Manual Lead Entry</h2><p>Add a lead you found through networking, referral, WhatsApp, walk-in or another source.</p></div></div>
          <form action={createLead} className={styles.manualForm}>
            <label><span>Business name *</span><input name="businessName" required minLength={2} /></label>
            <label><span>Owner or contact</span><input name="ownerName" /></label>
            <label><span>Email</span><input name="email" type="email" /></label>
            <label><span>Phone</span><input name="phone" type="tel" /></label>
            <label><span>WhatsApp</span><input name="whatsapp" type="tel" /></label>
            <label><span>Niche</span><input name="niche" /></label>
            <label><span>Source</span><select name="source" defaultValue="direct"><option value="direct">Direct</option><option value="referral">Referral</option><option value="website">Website</option><option value="google">Google</option><option value="whatsapp">WhatsApp</option><option value="instagram">Instagram</option><option value="linkedin">LinkedIn</option><option value="facebook">Facebook</option><option value="other">Other</option></select></label>
            <label><span>Stage</span><select name="stage" defaultValue="raw"><option value="raw">Raw</option><option value="scored">Scored</option><option value="contacted">Contacted</option><option value="interested">Interested</option><option value="demo_booked">Demo booked</option><option value="won">Won</option><option value="lost">Lost</option></select></label>
            <label><span>Lead score</span><input name="leadScore" type="number" min="0" max="100" /></label>
            <label><span>Estimated value</span><input name="estimatedValue" type="number" min="0" defaultValue="0" /></label>
            <label><span>Currency</span><select name="currency" defaultValue="PKR"><option>PKR</option><option>USD</option><option>GBP</option><option>EUR</option><option>AED</option><option>SAR</option></select></label>
            <label><span>Follow-up date</span><input name="nextActionAt" type="datetime-local" /></label>
            <label className={styles.fullField}><span>Pain point</span><textarea name="painPoint" /></label>
            <label className={styles.fullField}><span>Next action</span><input name="nextAction" /></label>
            <label className={styles.fullField}><span>Source link</span><input name="googleMapsUrl" type="url" placeholder="Profile, listing or page where this lead was found" /></label>
            <label className={styles.fullField}><span>Notes</span><textarea name="notes" /></label>
            <div className={styles.formActions}><Link href="/dashboard/leads">Cancel</Link><button type="submit">Save Lead</button></div>
          </form>
        </section>
      ) : null}

      {mode === "import" ? (
        <section className={styles.panel}>
          <div className={styles.panelTitle}><span className={styles.methodIcon}><UploadCloud size={20} /></span><div><h2>Import Leads</h2><p>Bring an existing cold list into Orbit without re-entering every business.</p></div></div>
          <div className={styles.importGrid}>
            <form action={importCsvLeads} className={styles.importBox}><FileSpreadsheet size={34} /><h3>Upload CSV</h3><p>Maximum 500 lead rows per file. Existing companies, emails and phone numbers are skipped.</p><input type="file" name="file" accept=".csv,text/csv" required /><button type="submit"><UploadCloud size={15} /> Import Leads</button></form>
            <div className={styles.columnGuide}><h3>Recommended columns</h3><code>business_name</code><code>owner_name</code><code>email</code><code>phone</code><code>whatsapp</code><code>niche</code><code>source</code><code>stage</code><code>lead_score</code><code>pain_point</code><code>next_action</code><code>source_link</code><p>Only business name is required. Unknown sources/stages fall back to safe defaults.</p></div>
          </div>
        </section>
      ) : null}

      <section className={`${engineStyles.leadsPanel} ${styles.directory}`} aria-labelledby="lead-directory-title">
        <div className={engineStyles.tabs}>
          <span className={engineStyles.activeTab}>All Leads</span>
          <Link href="/dashboard/leads/add?priority=hot">Hot Leads</Link>
          <Link href="/dashboard/leads/add?stage=contacted">Outreach</Link>
          <Link href="/dashboard/leads/add?stage=interested">Responses</Link>
          <Link href="/dashboard/leads/add?stage=proposal">Opportunities</Link>
          <Link href="/dashboard/sales">Won → Sales Desk</Link>
        </div>
        <form className={engineStyles.filterBar} action="/dashboard/leads/add" method="get">
          <input type="hidden" name="mode" value={mode} />
          <label className={engineStyles.searchBox}><Search size={15} /><input name="q" defaultValue={params.q ?? ""} placeholder="Search business, niche, pain or next action" /></label>
          <select name="stage" defaultValue={stage}><option value="all">All stages</option>{stages.map((item) => <option value={item} key={item}>{humanize(item)}</option>)}</select>
          <select name="priority" defaultValue={priority}><option value="all">All priorities</option><option value="hot">Hot leads</option><option value="overdue">Overdue</option></select>
          <button type="submit">Apply</button><Link href={`/dashboard/leads/add?mode=${mode}`}>Clear</Link>
        </form>
        <div className={engineStyles.tableWrap}>
          <table className={engineStyles.leadTable}>
            <thead><tr><th id="lead-directory-title">Lead</th><th>Source</th><th>Score</th><th>Status</th><th>Created</th><th>Next action</th><th>Priority</th><th aria-label="Actions" /></tr></thead>
            <tbody>
              {visibleLeads.slice(0, 25).map((lead) => {
                const overdue = isOverdue(lead, now);
                const score = lead.lead_score ?? 0;
                return <tr key={lead.id}>
                  <td><div className={engineStyles.leadIdentity}><span>{initials(lead)}</span><div><strong>{lead.company ?? lead.name}</strong><small>{lead.niche ?? "Niche not set"}</small></div></div></td>
                  <td>{lead.google_maps_url ? <a href={lead.google_maps_url} target="_blank" rel="noreferrer">{sourceLabel(lead.source)} ↗</a> : <Link href={sourceHref(lead.source)}>{sourceLabel(lead.source)} →</Link>}</td>
                  <td><span className={engineStyles.scorePill}>{lead.lead_score ?? "—"}</span></td>
                  <td><span className={`${engineStyles.statusPill} ${engineStyles[`status_${stageTone(lead.stage)}`]}`}>{humanize(lead.stage)}</span></td>
                  <td>{formatRelativeDate(lead.created_at)}</td>
                  <td><strong className={engineStyles.nextActionText}>{lead.next_action ?? "Set next action"}</strong>{lead.next_action_at ? <small>{formatRelativeDate(lead.next_action_at)}</small> : null}</td>
                  <td><span className={`${engineStyles.priorityPill} ${overdue || score >= 90 ? engineStyles.priorityHigh : score >= 75 ? engineStyles.priorityMedium : ""}`}>{overdue || score >= 90 ? "High" : score >= 75 ? "Medium" : "Normal"}</span></td>
                  <td><Link className={engineStyles.rowAction} href={lead.stage === "won" ? "/dashboard/sales" : `/dashboard/leads/add?q=${encodeURIComponent(lead.company ?? lead.name)}`}><ArrowRight size={15} /></Link></td>
                </tr>;
              })}
            </tbody>
          </table>
          {!visibleLeads.length ? <div className={engineStyles.emptyState}>No leads match these filters.</div> : null}
        </div>
      </section>
    </main>
  );
}
