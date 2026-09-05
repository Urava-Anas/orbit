import type { Metadata } from "next";
import { Library } from "lucide-react";
import { humanize } from "@/lib/format";
import { requireWorkspace } from "@/lib/workspace";
import styles from "../ContentSection.module.css";

export const metadata: Metadata = { title: "Content Library · Orbit", robots: { index: false, follow: false } };

type Draft = {
  id: string;
  title: string;
  body: string;
  channel: string;
  format: string;
  goal: string;
  source_type: string;
  status: string;
  created_at: string;
  scheduled_for: string | null;
};

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

export default async function ContentLibraryPage() {
  const { supabase, workspace } = await requireWorkspace();
  const { data } = await supabase
    .from("content_drafts")
    .select("id,title,body,channel,format,goal,source_type,status,created_at,scheduled_for")
    .eq("workspace_id", workspace.id)
    .order("created_at", { ascending: false })
    .limit(100);
  const drafts = (data ?? []) as Draft[];

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div><span className={styles.eyebrow}><Library size={13} /> Reusable content memory</span><h1>Content Library</h1><p>Every generated, edited, approved and published piece stays searchable as part of Urava’s content memory instead of disappearing after the day ends.</p></div>
        <span className={styles.headerMeta}>Latest {Math.min(drafts.length, 100)} items</span>
      </header>

      <section className={styles.grid}>
        <article className={styles.metric}><span>Total items</span><strong>{drafts.length}</strong><small>Current library window</small></article>
        <article className={styles.metric}><span>Published</span><strong>{drafts.filter((item) => item.status === "published").length}</strong><small>Provider-confirmed</small></article>
        <article className={styles.metric}><span>Approved</span><strong>{drafts.filter((item) => ["approved","scheduled"].includes(item.status)).length}</strong><small>Cleared for distribution</small></article>
        <article className={styles.metric}><span>Proof-led</span><strong>{drafts.filter((item) => item.source_type === "proof").length}</strong><small>Grounded in approved evidence</small></article>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeading}><h2>Recent content</h2><small>Newest first</small></div>
        {drafts.length ? (
          <div className={styles.cards}>
            {drafts.map((item) => (
              <article className={styles.card} key={item.id}>
                <div className={styles.cardTop}><span className={styles.tag}>{humanize(item.channel)}</span><span className={styles.rowState}>{humanize(item.status)}</span></div>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
                <div className={styles.cardMeta}><span>{humanize(item.format)}</span><span>·</span><span>{humanize(item.goal)}</span><span>·</span><span>{humanize(item.source_type)}</span><span>·</span><span>{dateLabel(item.created_at)}</span></div>
              </article>
            ))}
          </div>
        ) : <div className={styles.empty}><strong>The library is intentionally empty</strong><p>Urava had no legacy content drafts, so the new engine starts clean. Today’s first generated batch will become the beginning of this library.</p></div>}
      </section>
    </main>
  );
}
