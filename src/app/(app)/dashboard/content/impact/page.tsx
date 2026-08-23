import type { Metadata } from "next";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  BarChart3,
  BrainCircuit,
  CheckCircle2,
  Clock3,
  FileCheck2,
  Gauge,
  Rocket,
  ShieldCheck,
  Sparkles,
  Target,
} from "lucide-react";
import { humanize } from "@/lib/format";
import { serverTimeOffset } from "@/lib/server-clock";
import { requireWorkspace } from "@/lib/workspace";
import styles from "./impact.module.css";

export const metadata: Metadata = {
  title: "Content Impact · Orbit",
  description: "Real operational and business impact created by Orbit Content Engine.",
  robots: { index: false, follow: false },
};

type Draft = {
  id: string;
  channel: string;
  status: string;
  source_type: string;
  created_at: string;
};

type Asset = {
  id: string;
  content_id: string;
  status: string;
  source: string;
  created_at: string;
};

type Publication = {
  id: string;
  content_id: string;
  provider: string;
  status: string;
  created_at: string;
  published_at: string | null;
  last_error: string | null;
};

type Metric = {
  content_id: string;
  captured_at: string;
  reach: number | string;
  engagements: number | string;
  clicks: number | string;
  leads: number | string;
};

type ReviewEvent = {
  event_type: string;
  actor_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
};

type Learning = {
  id: string;
  signal_type: string;
  learned_on: string;
  created_at: string;
};

type Batch = {
  id: string;
  status: string;
  batch_date: string;
  generated_at: string | null;
  approved_at: string | null;
};

type Connection = {
  provider: string;
  status: string;
};

function number(value: number | string | null | undefined) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function compact(value: number) {
  return new Intl.NumberFormat("en", {
    notation: value >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
}

function ratio(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "—";
  return `${value < 10 ? value.toFixed(1) : Math.round(value)}×`;
}

export default async function ContentImpactPage() {
  const { supabase, workspace } = await requireWorkspace();
  const since = serverTimeOffset(-30 * 24 * 60 * 60 * 1000).toISOString();

  const [draftResult, assetResult, publicationResult, metricResult, eventResult, learningResult, batchResult, connectionResult] = await Promise.all([
    supabase
      .from("content_drafts")
      .select("id,channel,status,source_type,created_at")
      .eq("workspace_id", workspace.id)
      .gte("created_at", since),
    supabase
      .from("content_assets")
      .select("id,content_id,status,source,created_at")
      .eq("workspace_id", workspace.id)
      .eq("source", "generated")
      .gte("created_at", since),
    supabase
      .from("content_publications")
      .select("id,content_id,provider,status,created_at,published_at,last_error")
      .eq("workspace_id", workspace.id)
      .gte("created_at", since),
    supabase
      .from("content_metric_snapshots")
      .select("content_id,captured_at,reach,engagements,clicks,leads")
      .eq("workspace_id", workspace.id)
      .gte("captured_at", since)
      .order("captured_at", { ascending: false }),
    supabase
      .from("content_review_events")
      .select("event_type,actor_id,details,created_at")
      .eq("workspace_id", workspace.id)
      .gte("created_at", since),
    supabase
      .from("content_learning_notes")
      .select("id,signal_type,learned_on,created_at")
      .eq("workspace_id", workspace.id)
      .gte("created_at", since),
    supabase
      .from("content_batches")
      .select("id,status,batch_date,generated_at,approved_at")
      .eq("workspace_id", workspace.id)
      .gte("batch_date", since.slice(0, 10)),
    supabase
      .from("integration_connections")
      .select("provider,status")
      .eq("workspace_id", workspace.id)
      .in("provider", ["meta", "linkedin", "tiktok"]),
  ]);

  if (
    draftResult.error
    || assetResult.error
    || publicationResult.error
    || metricResult.error
    || eventResult.error
    || learningResult.error
    || batchResult.error
    || connectionResult.error
  ) {
    throw new Error("Content Engine impact could not be loaded completely.");
  }

  const drafts = (draftResult.data ?? []) as Draft[];
  const assets = (assetResult.data ?? []) as Asset[];
  const publications = (publicationResult.data ?? []) as Publication[];
  const metrics = (metricResult.data ?? []) as Metric[];
  const events = (eventResult.data ?? []) as ReviewEvent[];
  const learnings = (learningResult.data ?? []) as Learning[];
  const batches = (batchResult.data ?? []) as Batch[];
  const connections = (connectionResult.data ?? []) as Connection[];

  const latestMetricByContent = new Map<string, Metric>();
  for (const metric of metrics) {
    if (!latestMetricByContent.has(metric.content_id)) latestMetricByContent.set(metric.content_id, metric);
  }
  const latestMetrics = [...latestMetricByContent.values()];
  const outcomes = latestMetrics.reduce(
    (sum, metric) => ({
      reach: sum.reach + number(metric.reach),
      engagements: sum.engagements + number(metric.engagements),
      clicks: sum.clicks + number(metric.clicks),
      leads: sum.leads + number(metric.leads),
    }),
    { reach: 0, engagements: 0, clicks: 0, leads: 0 },
  );

  const generatedContent = drafts.filter((item) => item.source_type !== "manual").length;
  const readyVisuals = assets.filter((item) => item.status === "ready").length;
  const published = publications.filter((item) => item.status === "published").length;
  const queued = publications.filter((item) => item.status === "queued" || item.status === "publishing").length;
  const guarded = publications.filter((item) => item.status === "blocked" || item.status === "failed").length;
  const metricChecks = metrics.length;
  const learningSignals = learnings.length;
  const generatedDays = batches.filter((item) => Boolean(item.generated_at)).length;
  const approvedDays = batches.filter((item) => Boolean(item.approved_at)).length;

  const founderDecisions = events.filter((event) => {
    if (!event.actor_id) return false;
    if (event.event_type === "batch_approved" || event.event_type === "content_rejected") return true;
    if (event.event_type !== "content_approved") return false;
    return event.details?.approval_mode !== "batch";
  }).length;

  const automatedWorkUnits = generatedContent + readyVisuals + published + metricChecks + learningSignals;
  const leverage = founderDecisions > 0 ? automatedWorkUnits / founderDecisions : 0;

  const draftStatusById = new Map(drafts.map((item) => [item.id, item.status]));
  const unsafePublicationStates = publications.filter((publication) => {
    if (!["queued", "publishing", "published"].includes(publication.status)) return false;
    const status = draftStatusById.get(publication.content_id);
    return status !== "approved" && status !== "scheduled" && status !== "published";
  }).length;

  const activeChannels = [...new Set(drafts.map((item) => item.channel))];
  const connectedProviders = connections.filter((item) => item.status === "connected").map((item) => item.provider);
  const outcomeDataAvailable = latestMetrics.length > 0;

  const loop = [
    {
      label: "Plan",
      value: generatedDays,
      detail: "daily strategies generated",
      icon: Target,
      state: generatedDays ? "active" : "waiting",
    },
    {
      label: "Create",
      value: generatedContent,
      detail: "content pieces prepared",
      icon: Sparkles,
      state: generatedContent ? "active" : "waiting",
    },
    {
      label: "Visualize",
      value: readyVisuals,
      detail: "generated visuals ready",
      icon: FileCheck2,
      state: readyVisuals ? "active" : "waiting",
    },
    {
      label: "Approve",
      value: approvedDays,
      detail: "daily approval envelopes",
      icon: CheckCircle2,
      state: approvedDays ? "human" : "waiting",
    },
    {
      label: "Publish",
      value: published,
      detail: queued ? `${queued} more moving through queue` : "provider-confirmed posts",
      icon: Rocket,
      state: published || queued ? "active" : "waiting",
    },
    {
      label: "Learn",
      value: learningSignals,
      detail: "stored performance learnings",
      icon: BrainCircuit,
      state: learningSignals ? "active" : "waiting",
    },
  ] as const;

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroGlow} aria-hidden="true" />
        <div className={styles.heroCopy}>
          <span className={styles.eyebrow}><Gauge size={14} /> Real impact · rolling 30 days</span>
          <h1>This is what Orbit is taking off your plate.</h1>
          <p>
            Not a demo score. Every number below comes from Content Engine records, provider responses, approval history or measured platform data.
            It shows the work Orbit completed, the decisions you still controlled, and the outcomes the connected channels actually returned.
          </p>
          <div className={styles.heroActions}>
            <Link className={styles.primaryAction} href="/dashboard/content">Open today’s engine <ArrowRight size={14} /></Link>
            <Link className={styles.secondaryAction} href="/dashboard/content/intelligence">Inspect intelligence</Link>
          </div>
        </div>
        <div className={styles.leverageCard}>
          <span>System leverage</span>
          <strong>{ratio(leverage)}</strong>
          <p>{automatedWorkUnits} recorded automation actions around {founderDecisions} founder decision{founderDecisions === 1 ? "" : "s"}.</p>
          <div className={styles.leverageBar}><span style={{ width: `${Math.min(100, Math.max(6, leverage * 10))}%` }} /></div>
          <small>Transparent formula: generated content + generated visuals + confirmed publications + metric checks + learning signals ÷ founder review decisions.</small>
        </div>
      </section>

      <section className={styles.outcomeGrid} aria-label="Measured business outcomes">
        <article className={styles.outcomeCard}>
          <span><BarChart3 size={14} /> Provider-confirmed reach</span>
          <strong>{outcomeDataAvailable ? compact(outcomes.reach) : "—"}</strong>
          <small>{outcomeDataAvailable ? "Latest snapshot per measured post" : "Appears only after a provider returns real data"}</small>
        </article>
        <article className={styles.outcomeCard}>
          <span><Activity size={14} /> Engagements</span>
          <strong>{outcomeDataAvailable ? compact(outcomes.engagements) : "—"}</strong>
          <small>Measured interactions, never invented</small>
        </article>
        <article className={styles.outcomeCard}>
          <span><Target size={14} /> Clicks</span>
          <strong>{outcomeDataAvailable ? compact(outcomes.clicks) : "—"}</strong>
          <small>Only attributed data supplied by connected rails</small>
        </article>
        <article className={`${styles.outcomeCard} ${styles.leadCard}`}>
          <span><Rocket size={14} /> Attributed leads</span>
          <strong>{outcomeDataAvailable ? compact(outcomes.leads) : "—"}</strong>
          <small>Business outcome, not a vanity metric</small>
        </article>
      </section>

      <section className={styles.storyPanel}>
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.sectionEyebrow}><Sparkles size={13} /> The operating story</span>
            <h2>One controlled loop instead of six disconnected jobs.</h2>
          </div>
          <small>{generatedDays} active content day{generatedDays === 1 ? "" : "s"} in this window</small>
        </div>
        <div className={styles.loop}>
          {loop.map(({ label, value, detail, icon: Icon, state }, index) => (
            <article className={styles.loopStep} data-state={state} key={label}>
              <div className={styles.loopTop}><span><Icon size={15} /></span><i>0{index + 1}</i></div>
              <strong>{label}</strong>
              <b>{value}</b>
              <small>{detail}</small>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.split}>
        <article className={styles.panel}>
          <div className={styles.sectionHeading}>
            <div><span className={styles.sectionEyebrow}><ShieldCheck size={13} /> Safety impact</span><h2>Automation that knows when to stop.</h2></div>
          </div>
          <div className={styles.safetyHero}>
            <span className={unsafePublicationStates === 0 ? styles.safeMark : styles.dangerMark}>
              {unsafePublicationStates === 0 ? <CheckCircle2 size={18} /> : <ShieldCheck size={18} />}
            </span>
            <div>
              <strong>{unsafePublicationStates === 0 ? "Approval boundary intact" : `${unsafePublicationStates} integrity issue${unsafePublicationStates === 1 ? "" : "s"}`}</strong>
              <p>{unsafePublicationStates === 0 ? "No queued, publishing or published item in this window bypassed an approved content state." : "Orbit detected publication states that require engineering review before release."}</p>
            </div>
          </div>
          <div className={styles.safetyRows}>
            <div><span>Safely blocked / failed rails</span><strong>{guarded}</strong><small>Orbit stopped instead of pretending delivery succeeded.</small></div>
            <div><span>Founder-controlled decisions</span><strong>{founderDecisions}</strong><small>Human judgment remains at the approval boundary.</small></div>
            <div><span>Connected providers</span><strong>{connectedProviders.length}</strong><small>{connectedProviders.length ? connectedProviders.map(humanize).join(" · ") : "No live provider connection recorded yet"}</small></div>
          </div>
        </article>

        <article className={styles.panel}>
          <div className={styles.sectionHeading}>
            <div><span className={styles.sectionEyebrow}><Clock3 size={13} /> Work removed</span><h2>The repetitive layer Orbit absorbs.</h2></div>
          </div>
          <div className={styles.removedWork}>
            <div><CheckCircle2 size={14} /><span><strong>Multi-channel planning</strong><small>Brand Brain + daily strategy turn one operating standard into a content day.</small></span></div>
            <div><CheckCircle2 size={14} /><span><strong>First-draft production</strong><small>{generatedContent} generated piece{generatedContent === 1 ? "" : "s"} recorded in this window.</small></span></div>
            <div><CheckCircle2 size={14} /><span><strong>Visual preparation</strong><small>{readyVisuals} generated visual{readyVisuals === 1 ? "" : "s"} reached review-ready state.</small></span></div>
            <div><CheckCircle2 size={14} /><span><strong>Queue + delivery bookkeeping</strong><small>{publications.length} publication record{publications.length === 1 ? "" : "s"} managed with idempotency and delivery states.</small></span></div>
            <div><CheckCircle2 size={14} /><span><strong>Performance collection</strong><small>{metricChecks} provider metric snapshot{metricChecks === 1 ? "" : "s"} captured automatically.</small></span></div>
            <div><CheckCircle2 size={14} /><span><strong>Learning memory</strong><small>{learningSignals} real signal{learningSignals === 1 ? "" : "s"} stored for future content decisions.</small></span></div>
          </div>
        </article>
      </section>

      <section className={styles.proofPanel}>
        <div>
          <span className={styles.sectionEyebrow}><BrainCircuit size={13} /> Why this compounds</span>
          <h2>Every cycle leaves Orbit smarter than the previous one.</h2>
          <p>Creation is only the first layer. The durable advantage is that approval history, provider delivery, real metrics and learning notes remain attached to the workspace instead of disappearing across chats, spreadsheets and social apps.</p>
        </div>
        <div className={styles.proofStats}>
          <span><strong>{activeChannels.length}</strong><small>channels used</small></span>
          <span><strong>{latestMetrics.length}</strong><small>posts with current measured snapshots</small></span>
          <span><strong>{learningSignals}</strong><small>learning signals stored</small></span>
        </div>
      </section>
    </main>
  );
}
