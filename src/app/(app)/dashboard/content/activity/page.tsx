import type { Metadata } from "next";
import { Activity, ShieldCheck } from "lucide-react";
import { humanize } from "@/lib/format";
import { requireWorkspace } from "@/lib/workspace";
import styles from "../ContentSection.module.css";

export const metadata: Metadata = { title: "Content Activity · Orbit", robots: { index: false, follow: false } };

type ReviewEvent = {
  id: number;
  event_type: string;
  actor_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
  content_drafts: { title: string } | null;
  content_batches: { batch_date: string; focus: string } | null;
};

function eventSummary(event: ReviewEvent) {
  const contentTitle = event.content_drafts?.title;
  if (contentTitle) return contentTitle;
  if (event.content_batches?.focus) return event.content_batches.focus;
  if (event.event_type === "brand_brain_updated") return "Brand Brain settings changed";
  return humanize(event.event_type);
}

function eventDetail(event: ReviewEvent) {
  const detail = event.details ?? {};
  if (typeof detail.reason === "string" && detail.reason) return detail.reason;
  if (typeof detail.provider === "string" && detail.provider) {
    const provider = humanize(detail.provider);
    if (event.event_type === "publication_blocked") return `${provider} publishing was blocked safely.`;
    if (event.event_type === "publication_queued") return `${provider} publishing entered the durable queue.`;
  }
  if (event.event_type === "batch_generated") {
    const count = Number(detail.item_count || 0);
    return `${count} item${count === 1 ? "" : "s"} passed the generation quality gate and entered founder review.`;
  }
  if (event.event_type === "batch_approved") {
    const ready = Number(detail.queue_ready || 0);
    const blocked = Number(detail.queue_blocked || 0);
    return `${ready} queued · ${blocked} blocked downstream.`;
  }
  if (event.event_type === "content_edited") return "Content changed and prior approval was reset.";
  if (event.event_type === "content_approved") return "Founder approval recorded.";
  if (event.event_type === "content_rejected") return "Founder rejection recorded. The item cannot publish.";
  if (event.event_type === "brand_brain_updated") return "Future generation will use the updated brand rules.";
  return "Append-only Content Engine event.";
}

function timeLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export default async function ContentActivityPage() {
  const { supabase, workspace } = await requireWorkspace();
  const { data } = await supabase
    .from("content_review_events")
    .select("id,event_type,actor_id,details,created_at,content_drafts(title),content_batches(batch_date,focus)")
    .eq("workspace_id", workspace.id)
    .order("created_at", { ascending: false })
    .limit(150);
  const events = (data ?? []) as unknown as ReviewEvent[];

  const approvals = events.filter((item) => item.event_type === "content_approved" || item.event_type === "batch_approved").length;
  const blocks = events.filter((item) => item.event_type === "publication_blocked" || item.event_type === "publication_failed").length;
  const edits = events.filter((item) => item.event_type === "content_edited").length;
  const generations = events.filter((item) => item.event_type === "batch_generated").length;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div><span className={styles.eyebrow}><Activity size={13} /> Append-only review history</span><h1>Content Activity</h1><p>Every important generation, edit, founder decision and publishing transition is recorded here so the daily loop stays attributable instead of becoming hidden automation.</p></div>
        <span className={styles.headerMeta}><ShieldCheck size={12} /> Members can read · only admins append</span>
      </header>

      <section className={styles.grid}>
        <article className={styles.metric}><span>Recent events</span><strong>{events.length}</strong><small>Latest audit window</small></article>
        <article className={styles.metric}><span>Approvals</span><strong>{approvals}</strong><small>Item + batch decisions</small></article>
        <article className={styles.metric}><span>Edits</span><strong>{edits}</strong><small>Approval-resetting changes</small></article>
        <article className={styles.metric}><span>Blocks / failures</span><strong>{blocks}</strong><small>Visible instead of silently skipped</small></article>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeading}><h2>Audit timeline</h2><small>{generations} generated batch{generations === 1 ? "" : "es"} in this window</small></div>
        {events.length ? <div className={styles.list}>{events.map((event) => (
          <div className={styles.activity} key={event.id}>
            <span className={styles.activityTime}>{timeLabel(event.created_at)}</span>
            <div className={styles.activityMain}><strong>{eventSummary(event)}</strong><span>{eventDetail(event)}</span></div>
            <span className={styles.activityType}>{humanize(event.event_type)}</span>
          </div>
        ))}</div> : <div className={styles.empty}><strong>No activity has been written yet</strong><p>The first Brand Brain change or generated daily batch will create the beginning of this append-only trail.</p></div>}
      </section>
    </main>
  );
}
