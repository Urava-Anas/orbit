import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
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
import { MetricCard } from "@/components/MetricCard";
import { Notice } from "@/components/Notice";
import { PageHeader } from "@/components/PageHeader";
import { StatusPill } from "@/components/StatusPill";
import { humanize } from "@/lib/format";
import { requireWorkspace } from "@/lib/workspace";
import {
  analyzeFinderResult,
  approveFinderResult,
  rejectFinderResult,
  searchPlaces,
} from "./actions";
import styles from "./finder.module.css";

export const metadata: Metadata = {
  title: "Lead Finder",
  robots: { index: false, follow: false },
};

type PageProps = {
  searchParams: Promise<{ error?: string; notice?: string; status?: string }>;
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
  target_problem: string | null;
  fit_score: number | null;
  problem_score: number | null;
  contactability_score: number | null;
  commercial_score: number | null;
  total_score: number | null;
  score_reason: string | null;
  detected_weakness: string | null;
  recommended_offer: string | null;
  suggested_next_action: string | null;
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

const allowedStatuses = ["all", "new", "analyzed", "approved", "rejected", "duplicate"] as const;

function isAllowedStatus(value: string | undefined): value is (typeof allowedStatuses)[number] {
  return allowedStatuses.includes(value as (typeof allowedStatuses)[number]);
}

function scoreTone(score: number | null) {
  if (score === null) return styles.scorePending;
  if (score >= 85) return styles.scoreHot;
  if (score >= 70) return styles.scoreWarm;
  return styles.scoreCool;
}

export default async function LeadFinderPage({ searchParams }: PageProps) {
  const { supabase, workspace } = await requireWorkspace();
  const params = await searchParams;
  const status = isAllowedStatus(params.status) ? params.status : "all";
  const apiReady = Boolean(process.env.GOOGLE_PLACES_API_KEY?.trim());
  const now = new Date().toISOString();

  let resultsQuery = supabase
    .from("lead_finder_results")
    .select("id, business_name, formatted_address, primary_type, business_status, google_maps_url, website_url, phone, rating, review_count, niche, target_problem, fit_score, problem_score, contactability_score, commercial_score, total_score, score_reason, detected_weakness, recommended_offer, suggested_next_action, status, lead_id, created_at")
    .eq("workspace_id", workspace.id)
    .gt("expires_at", now)
    .order("total_score", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (status !== "all") resultsQuery = resultsQuery.eq("status", status);

  const [{ data: resultsData }, { data: searchesData }] = await Promise.all([
    resultsQuery,
    supabase
      .from("lead_finder_searches")
      .select("id, query_text, result_count, status, created_at")
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const results = (resultsData ?? []) as FinderResult[];
  const searches = (searchesData ?? []) as FinderSearch[];
  const queueCount = results.filter((item) => ["new", "analyzed"].includes(item.status)).length;
  const analyzedCount = results.filter((item) => item.status === "analyzed").length;
  const approvedCount = results.filter((item) => item.status === "approved").length;
  const rejectedCount = results.filter((item) => item.status === "rejected").length;

  return (
    <div className="page">
      <PageHeader
        kicker="Controlled discovery"
        title="Lead Finder"
        description="Find local businesses, analyze only the promising ones, and approve verified opportunities into the Lead Engine. Nothing enters the pipeline automatically."
        action={
          <Link className="button" href="/dashboard/leads">
            <ArrowLeft size={15} aria-hidden="true" /> Lead Engine
          </Link>
        }
      />
      <Notice error={params.error} notice={params.notice} />

      <section className="metrics-grid" aria-label="Lead Finder metrics">
        <MetricCard label="Review queue" value={queueCount} note="New and analyzed opportunities" />
        <MetricCard label="Analyzed" value={analyzedCount} note="Ready for founder decision" />
        <MetricCard label="Approved" value={approvedCount} note="Transferred to Lead Engine" />
        <MetricCard label="Rejected" value={rejectedCount} note="Remembered to prevent repetition" />
      </section>

      {!apiReady ? (
        <section className={styles.setupBanner}>
          <ShieldCheck size={22} aria-hidden="true" />
          <div>
            <strong>Google Places connection required</strong>
            <p>Add the server-only <code>GOOGLE_PLACES_API_KEY</code> environment variable in Vercel for Production and Preview. Enable Places API (New) and billing; never expose this key with a NEXT_PUBLIC prefix.</p>
          </div>
        </section>
      ) : null}

      <section className={styles.discoveryGrid}>
        <article className={styles.searchPanel}>
          <div className={styles.panelHead}>
            <div>
              <span>Search brief</span>
              <h2>Define the opportunity</h2>
            </div>
            <Compass size={21} aria-hidden="true" />
          </div>
          <form action={searchPlaces} className={styles.searchForm}>
            <div className="field">
              <label htmlFor="finder-niche">Business type</label>
              <input id="finder-niche" name="niche" minLength={2} maxLength={100} placeholder="Immigration consultants" required />
            </div>
            <div className="field">
              <label htmlFor="finder-location">Location</label>
              <input id="finder-location" name="location" minLength={2} maxLength={160} placeholder="Lahore, Pakistan" required />
            </div>
            <div className="field field-wide">
              <label htmlFor="finder-problem">Problem we want to find</label>
              <textarea id="finder-problem" name="targetProblem" maxLength={500} placeholder="Weak website, missing proof and poor WhatsApp conversion flow" />
            </div>
            <div className="field">
              <label htmlFor="finder-count">Results</label>
              <select id="finder-count" name="requestedCount" defaultValue="10">
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
              <h2>Discovery history</h2>
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
      </section>

      <nav className={styles.filters} aria-label="Lead Finder status filters">
        {allowedStatuses.map((item) => (
          <Link
            className={status === item ? styles.filterActive : styles.filterLink}
            href={item === "all" ? "/dashboard/leads/finder" : `/dashboard/leads/finder?status=${item}`}
            key={item}
          >
            {humanize(item)}
          </Link>
        ))}
      </nav>

      <section className={styles.resultsPanel}>
        <div className={styles.resultsHead}>
          <div>
            <span>Founder review queue</span>
            <h2>Discovered opportunities</h2>
          </div>
          <span className={styles.googleAttribution} translate="no">Google Maps</span>
        </div>

        {results.length ? (
          <div className={styles.resultList}>
            {results.map((result) => (
              <article className={styles.resultCard} key={result.id}>
                <div className={styles.resultMain}>
                  <div className={styles.resultTitle}>
                    <div>
                      <h3>{result.business_name}</h3>
                      <p>{result.formatted_address ?? "Address not returned"}</p>
                    </div>
                    <StatusPill value={result.status} />
                  </div>

                  <div className={styles.signalRow}>
                    <span>{result.niche}</span>
                    <span>{result.primary_type ? humanize(result.primary_type) : "Type unknown"}</span>
                    {result.rating !== null ? <span>{result.rating.toFixed(1)} rating · {result.review_count ?? 0} ratings</span> : <span>Not enriched</span>}
                  </div>

                  <div className={styles.findingBlock}>
                    <span>Detected opportunity</span>
                    <p>{result.detected_weakness ?? result.target_problem ?? "Analyze this result to calculate the visible problem, contactability and commercial signal."}</p>
                  </div>

                  {result.recommended_offer ? (
                    <div className={styles.offerBlock}>
                      <Sparkles size={15} aria-hidden="true" />
                      <div><span>Recommended offer</span><strong>{result.recommended_offer}</strong></div>
                    </div>
                  ) : null}

                  <div className={styles.sourceActions}>
                    {result.google_maps_url ? <a href={result.google_maps_url} target="_blank" rel="noreferrer"><MapPin size={13} /> Google Maps <ArrowUpRight size={11} /></a> : null}
                    {result.website_url ? <a href={result.website_url} target="_blank" rel="noreferrer">Website <ArrowUpRight size={11} /></a> : null}
                    {result.phone ? <a href={`tel:${result.phone}`}><Phone size={13} /> {result.phone}</a> : null}
                  </div>
                  <span className={styles.cardAttribution} translate="no">Google Maps</span>
                </div>

                <aside className={styles.scorePanel}>
                  <span className={`${styles.totalScore} ${scoreTone(result.total_score)}`}>{result.total_score ?? "—"}</span>
                  <small>Opportunity score</small>
                  {result.total_score !== null ? (
                    <div className={styles.breakdown}>
                      <span>Fit <strong>{result.fit_score}/30</strong></span>
                      <span>Problem <strong>{result.problem_score}/30</strong></span>
                      <span>Contact <strong>{result.contactability_score}/20</strong></span>
                      <span>Commercial <strong>{result.commercial_score}/20</strong></span>
                    </div>
                  ) : null}
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
                    {result.status === "rejected" ? <span className={styles.decisionNote}>Rejected and remembered</span> : null}
                    {result.status === "duplicate" ? <span className={styles.decisionNote}>Already in Lead Engine</span> : null}
                  </div>
                </aside>
              </article>
            ))}
          </div>
        ) : (
          <div className={styles.emptyState}>
            <Compass size={28} aria-hidden="true" />
            <strong>No opportunities in this view.</strong>
            <p>Run a focused search or choose another status filter.</p>
          </div>
        )}
      </section>
    </div>
  );
}
