import Link from "next/link";
import {
  ArrowUpRight,
  Check,
  Compass,
  MapPin,
  Phone,
  Search,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { StatusPill } from "@/components/StatusPill";
import { humanize } from "@/lib/format";
import { requireWorkspace } from "@/lib/workspace";
import {
  analyzeFinderResult,
  approveFinderResult,
  rejectFinderResult,
  searchPlaces,
} from "./finder/actions";
import styles from "./LeadDiscoveryPanel.module.css";

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
  target_problem: string | null;
  fit_score: number | null;
  problem_score: number | null;
  contactability_score: number | null;
  commercial_score: number | null;
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

function scoreTone(score: number | null) {
  if (score === null) return styles.scorePending;
  if (score >= 85) return styles.scoreHot;
  if (score >= 70) return styles.scoreWarm;
  return styles.scoreCool;
}

export async function LeadDiscoveryPanel() {
  const { supabase, workspace } = await requireWorkspace();
  const apiReady = Boolean(process.env.GOOGLE_PLACES_API_KEY?.trim());
  const now = new Date().toISOString();

  const [{ data: resultsData }, { data: searchesData }] = await Promise.all([
    supabase
      .from("lead_finder_results")
      .select(
        "id, business_name, formatted_address, primary_type, business_status, google_maps_url, website_url, phone, rating, review_count, niche, target_problem, fit_score, problem_score, contactability_score, commercial_score, total_score, detected_weakness, recommended_offer, status, lead_id, created_at",
      )
      .eq("workspace_id", workspace.id)
      .gt("expires_at", now)
      .order("total_score", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("lead_finder_searches")
      .select("id, query_text, result_count, status, created_at")
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: false })
      .limit(4),
  ]);

  const results = (resultsData ?? []) as FinderResult[];
  const searches = (searchesData ?? []) as FinderSearch[];
  const reviewQueue = results.filter((item) => ["new", "analyzed"].includes(item.status));
  const approved = results.filter((item) => item.status === "approved").length;
  const analyzed = results.filter((item) => item.status === "analyzed").length;

  return (
    <section className={styles.discovery} id="lead-finder" aria-labelledby="lead-finder-title">
      <header className={styles.hero}>
        <div>
          <span className="section-kicker">Discovery inside Growth</span>
          <h2 id="lead-finder-title">Lead Finder</h2>
          <p>Search, verify and approve opportunities without leaving the Lead Engine.</p>
        </div>
        <div className={styles.heroMetrics} aria-label="Lead Finder status">
          <div><strong>{reviewQueue.length}</strong><span>review queue</span></div>
          <div><strong>{analyzed}</strong><span>analyzed</span></div>
          <div><strong>{approved}</strong><span>approved</span></div>
        </div>
      </header>

      {!apiReady ? (
        <div className={styles.setupBanner}>
          <ShieldCheck size={20} aria-hidden="true" />
          <div>
            <strong>Google Places connection required</strong>
            <p>Add the server-only GOOGLE_PLACES_API_KEY in Vercel Production and Preview.</p>
          </div>
        </div>
      ) : null}

      <div className={styles.discoveryGrid}>
        <article className={styles.searchPanel}>
          <div className={styles.panelHead}>
            <div>
              <span>Search brief</span>
              <h3>Find the right businesses</h3>
            </div>
            <Compass size={20} aria-hidden="true" />
          </div>
          <form action={searchPlaces} className={styles.searchForm}>
            <div className="field">
              <label htmlFor="growth-finder-niche">Business type</label>
              <input id="growth-finder-niche" name="niche" minLength={2} maxLength={100} placeholder="Immigration consultants" required />
            </div>
            <div className="field">
              <label htmlFor="growth-finder-location">Location</label>
              <input id="growth-finder-location" name="location" minLength={2} maxLength={160} placeholder="Lahore, Pakistan" required />
            </div>
            <div className={`field ${styles.fieldWide}`}>
              <label htmlFor="growth-finder-problem">Problem to detect</label>
              <textarea id="growth-finder-problem" name="targetProblem" maxLength={500} placeholder="Weak website, missing proof and poor WhatsApp conversion flow" />
            </div>
            <div className="field">
              <label htmlFor="growth-finder-count">Results</label>
              <select id="growth-finder-count" name="requestedCount" defaultValue="10">
                <option value="5">5 results</option>
                <option value="10">10 results</option>
                <option value="20">20 results</option>
              </select>
            </div>
            <button className="button button-primary" type="submit" disabled={!apiReady}>
              <Search size={15} aria-hidden="true" /> Find opportunities
            </button>
          </form>
        </article>

        <aside className={styles.historyPanel}>
          <div className={styles.panelHead}>
            <div>
              <span>Recent searches</span>
              <h3>Discovery history</h3>
            </div>
          </div>
          <div className={styles.historyList}>
            {searches.length ? searches.map((search) => (
              <div className={styles.historyRow} key={search.id}>
                <div>
                  <strong>{search.query_text}</strong>
                  <small>{new Date(search.created_at).toLocaleString("en-PK", { timeZone: "Asia/Karachi" })}</small>
                </div>
                <span>{search.result_count} · {humanize(search.status)}</span>
              </div>
            )) : <p className={styles.emptyCopy}>No discovery search has been run yet.</p>}
          </div>
        </aside>
      </div>

      <div className={styles.resultsHead}>
        <div>
          <span>Founder review queue</span>
          <h3>Discovered opportunities</h3>
        </div>
        <span className={styles.googleAttribution} translate="no">Google Maps</span>
      </div>

      {results.length ? (
        <div className={styles.resultList}>
          {results.map((result) => (
            <article className={styles.resultCard} key={result.id}>
              <div className={styles.resultIdentity}>
                <span className={styles.avatar}>{result.business_name.slice(0, 2).toUpperCase()}</span>
                <div>
                  <div className={styles.titleRow}>
                    <h4>{result.business_name}</h4>
                    <StatusPill value={result.status} />
                  </div>
                  <p>{result.formatted_address ?? "Address not returned"}</p>
                  <div className={styles.signalRow}>
                    <span>{result.niche}</span>
                    <span>{result.primary_type ? humanize(result.primary_type) : "Type unknown"}</span>
                    <span>{result.rating !== null ? `${result.rating.toFixed(1)} · ${result.review_count ?? 0} ratings` : "Not enriched"}</span>
                  </div>
                </div>
              </div>

              <div className={styles.findingBlock}>
                <span>Detected opportunity</span>
                <p>{result.detected_weakness ?? result.target_problem ?? "Analyze this result to calculate fit, visible problem, contactability and commercial signal."}</p>
                {result.recommended_offer ? <strong>{result.recommended_offer}</strong> : null}
              </div>

              <div className={styles.sourceActions}>
                {result.google_maps_url ? <a href={result.google_maps_url} target="_blank" rel="noreferrer"><MapPin size={13} /> Maps <ArrowUpRight size={11} /></a> : null}
                {result.website_url ? <a href={result.website_url} target="_blank" rel="noreferrer">Website <ArrowUpRight size={11} /></a> : null}
                {result.phone ? <a href={`tel:${result.phone}`}><Phone size={13} /> Call</a> : null}
              </div>

              <aside className={styles.scorePanel}>
                <span className={`${styles.totalScore} ${scoreTone(result.total_score)}`}>{result.total_score ?? "—"}</span>
                <small>score</small>
                <div className={styles.decisionActions}>
                  {result.status === "new" ? (
                    <form action={analyzeFinderResult}>
                      <input type="hidden" name="id" value={result.id} />
                      <button className="button button-primary" type="submit"><Sparkles size={14} /> Analyze</button>
                    </form>
                  ) : null}
                  {result.status === "analyzed" ? (
                    <>
                      <form action={approveFinderResult}>
                        <input type="hidden" name="id" value={result.id} />
                        <button className="button button-primary" type="submit"><Check size={14} /> Approve</button>
                      </form>
                      <form action={rejectFinderResult}>
                        <input type="hidden" name="id" value={result.id} />
                        <button className="button button-danger" type="submit"><X size={14} /> Reject</button>
                      </form>
                    </>
                  ) : null}
                  {result.status === "approved" ? (
                    <Link className="button" href={`/dashboard/leads?view=directory&q=${encodeURIComponent(result.business_name)}`}>Open lead</Link>
                  ) : null}
                  {result.status === "rejected" ? <span className={styles.decisionNote}>Rejected</span> : null}
                  {result.status === "duplicate" ? <span className={styles.decisionNote}>Already saved</span> : null}
                </div>
              </aside>
            </article>
          ))}
        </div>
      ) : (
        <div className={styles.emptyState}>
          <Compass size={26} aria-hidden="true" />
          <strong>No opportunities yet.</strong>
          <p>Run a focused search above. Every result stays under founder approval.</p>
        </div>
      )}
    </section>
  );
}
