import type { Metadata } from "next";
import { BarChart3, BrainCircuit } from "lucide-react";
import { humanize } from "@/lib/format";
import { requireWorkspace } from "@/lib/workspace";
import styles from "../ContentSection.module.css";

export const metadata: Metadata = { title: "Content Intelligence · Orbit", robots: { index: false, follow: false } };

type Metric = { content_id: string; reach: number | string; engagements: number | string; clicks: number | string; leads: number | string };
type Draft = { id: string; channel: string; goal: string; format: string };
type Learning = { id: string; learned_on: string; signal_type: string; insight: string; action: string; confidence: number | string };

function num(value: number | string | null | undefined) { return Number(value || 0); }
function compact(value: number) { return new Intl.NumberFormat("en", { notation: value >= 10_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value); }

export default async function ContentIntelligencePage() {
  const { supabase, workspace } = await requireWorkspace();
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const [metricResult, learningResult] = await Promise.all([
    supabase.from("content_metric_snapshots").select("content_id,reach,engagements,clicks,leads").eq("workspace_id", workspace.id).gte("captured_at", since),
    supabase.from("content_learning_notes").select("id,learned_on,signal_type,insight,action,confidence").eq("workspace_id", workspace.id).order("learned_on", { ascending: false }).order("created_at", { ascending: false }).limit(20),
  ]);
  const metrics = (metricResult.data ?? []) as Metric[];
  const ids = [...new Set(metrics.map((item) => item.content_id))];
  let drafts: Draft[] = [];
  if (ids.length) {
    const draftResult = await supabase.from("content_drafts").select("id,channel,goal,format").eq("workspace_id", workspace.id).in("id", ids);
    drafts = (draftResult.data ?? []) as Draft[];
  }
  const draftById = new Map(drafts.map((item) => [item.id, item]));
  const totals = metrics.reduce((sum, item) => ({ reach: sum.reach + num(item.reach), engagements: sum.engagements + num(item.engagements), clicks: sum.clicks + num(item.clicks), leads: sum.leads + num(item.leads) }), { reach: 0, engagements: 0, clicks: 0, leads: 0 });
  const byChannel = new Map<string, { reach: number; engagements: number; clicks: number; leads: number }>();
  for (const metric of metrics) {
    const channel = draftById.get(metric.content_id)?.channel || "unknown";
    const current = byChannel.get(channel) ?? { reach: 0, engagements: 0, clicks: 0, leads: 0 };
    current.reach += num(metric.reach); current.engagements += num(metric.engagements); current.clicks += num(metric.clicks); current.leads += num(metric.leads);
    byChannel.set(channel, current);
  }
  const channelRows = [...byChannel.entries()].map(([channel, value]) => ({ channel, ...value, score: value.leads * 10 + value.clicks * 2 + value.engagements + value.reach * 0.01 })).sort((a, b) => b.score - a.score);
  const maxScore = Math.max(1, ...channelRows.map((item) => item.score));
  const learnings = (learningResult.data ?? []) as Learning[];

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div><span className={styles.eyebrow}><BarChart3 size={13} /> Real performance only</span><h1>Content Intelligence</h1><p>Orbit measures what actually happened, then turns repeated signals into tomorrow’s content decisions. No vanity numbers are invented when providers have not returned data.</p></div>
        <span className={styles.headerMeta}>Rolling 30 days</span>
      </header>

      <section className={styles.grid}>
        <article className={styles.metric}><span>Reach</span><strong>{compact(totals.reach)}</strong><small>Provider snapshots</small></article>
        <article className={styles.metric}><span>Engagements</span><strong>{compact(totals.engagements)}</strong><small>Measured interactions</small></article>
        <article className={styles.metric}><span>Clicks</span><strong>{compact(totals.clicks)}</strong><small>Measured outbound intent</small></article>
        <article className={styles.metric}><span>Leads</span><strong>{compact(totals.leads)}</strong><small>Attributed conversions</small></article>
      </section>

      <section className={styles.split}>
        <article className={styles.panel}>
          <div className={styles.panelHeading}><h2>Platform response</h2><small>Weighted by leads, clicks, engagement and reach</small></div>
          {channelRows.length ? <div className={styles.bars}>{channelRows.map((item) => (
            <div className={styles.barRow} key={item.channel}><span>{humanize(item.channel)}</span><div className={styles.barTrack}><div className={styles.barFill} style={{ width: `${Math.max(4, Math.round((item.score / maxScore) * 100))}%` }} /></div><strong>{compact(item.leads)} leads</strong></div>
          ))}</div> : <div className={styles.empty}><strong>No performance data yet</strong><p>Once real provider metrics arrive, this view will rank platforms without guessing or backfilling fake analytics.</p></div>}
        </article>

        <article className={styles.panel}>
          <div className={styles.panelHeading}><h2><BrainCircuit size={13} /> Learning memory</h2><small>{learnings.length} stored signals</small></div>
          {learnings.length ? <div className={styles.learningList}>{learnings.map((item) => (
            <div className={styles.learning} key={item.id}><span>{humanize(item.signal_type)} · {item.learned_on}</span><strong>{item.insight}</strong>{item.action ? <small>Next action: {item.action}</small> : null}</div>
          ))}</div> : <div className={styles.empty}><strong>Orbit has not learned anything yet</strong><p>That is intentional. A learning appears only after measurable performance or an explicit founder-entered signal exists.</p></div>}
        </article>
      </section>
    </main>
  );
}
