import type { Metadata } from "next";
import { CalendarDays } from "lucide-react";
import { humanize } from "@/lib/format";
import { requireWorkspace } from "@/lib/workspace";
import styles from "../ContentSection.module.css";

export const metadata: Metadata = { title: "Content Calendar · Orbit", robots: { index: false, follow: false } };

type Draft = {
  id: string;
  title: string;
  channel: string;
  format: string;
  status: string;
  scheduled_for: string | null;
};

function dateKey(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}

function dayLabel(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "long", month: "short", day: "numeric" }).format(new Date(value));
}

function timeLabel(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

export default async function ContentCalendarPage() {
  const { supabase, workspace } = await requireWorkspace();
  const { data: profile } = await supabase.from("content_brand_profiles").select("timezone").eq("workspace_id", workspace.id).maybeSingle();
  const timezone = profile?.timezone || "UTC";
  const from = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const until = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  const { data } = await supabase
    .from("content_drafts")
    .select("id,title,channel,format,status,scheduled_for")
    .eq("workspace_id", workspace.id)
    .not("scheduled_for", "is", null)
    .gte("scheduled_for", from.toISOString())
    .lte("scheduled_for", until.toISOString())
    .order("scheduled_for", { ascending: true });

  const drafts = (data ?? []) as Draft[];
  const groups = new Map<string, Draft[]>();
  for (const draft of drafts) {
    if (!draft.scheduled_for) continue;
    const key = dateKey(draft.scheduled_for, timezone);
    groups.set(key, [...(groups.get(key) ?? []), draft]);
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div><span className={styles.eyebrow}><CalendarDays size={13} /> Distribution plan</span><h1>Content Calendar</h1><p>One view of what Orbit plans to publish and when. Approval state stays visible so scheduled never gets confused with published.</p></div>
        <span className={styles.headerMeta}>{timezone} · 14-day window</span>
      </header>

      <section className={styles.grid}>
        <article className={styles.metric}><span>Scheduled items</span><strong>{drafts.length}</strong><small>Across the current window</small></article>
        <article className={styles.metric}><span>Approved</span><strong>{drafts.filter((item) => ["approved","scheduled","published"].includes(item.status)).length}</strong><small>Founder-cleared</small></article>
        <article className={styles.metric}><span>Needs review</span><strong>{drafts.filter((item) => ["draft","review"].includes(item.status)).length}</strong><small>Not eligible to publish</small></article>
        <article className={styles.metric}><span>Published</span><strong>{drafts.filter((item) => item.status === "published").length}</strong><small>Confirmed state only</small></article>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeading}><h2>Upcoming schedule</h2><small>{drafts.length ? `${groups.size} active day${groups.size === 1 ? "" : "s"}` : "No scheduled content"}</small></div>
        {drafts.length ? Array.from(groups.entries()).map(([key, items]) => (
          <div key={key}>
            <div className={styles.panelHeading}><h2>{dayLabel(items[0].scheduled_for!, timezone)}</h2><small>{items.length} item{items.length === 1 ? "" : "s"}</small></div>
            <div className={styles.list}>
              {items.map((item) => (
                <div className={styles.row} key={item.id}>
                  <div className={styles.rowTime}><strong>{timeLabel(item.scheduled_for!, timezone)}</strong><span>{key}</span></div>
                  <div className={styles.rowMain}><strong>{item.title}</strong><span>{humanize(item.channel)} · {humanize(item.format)}</span></div>
                  <span className={styles.rowState}>{humanize(item.status)}</span>
                </div>
              ))}
            </div>
          </div>
        )) : <div className={styles.empty}><strong>No calendar yet</strong><p>Generate the first daily batch from Today. Orbit will place every piece on this calendar using Urava’s local timezone.</p></div>}
      </section>
    </main>
  );
}
