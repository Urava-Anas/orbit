import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Search, ShieldCheck, Sparkles } from "lucide-react";
import { notFound } from "next/navigation";
import { formatRelativeDate, humanize } from "@/lib/format";
import type { Lead } from "@/lib/types";
import { requireWorkspace } from "@/lib/workspace";
import styles from "../../leads.module.css";

const sources = {
  website: { label: "Website", aliases: ["website"], description: "Website enquiries, forms and conversion-originated opportunities." },
  google: { label: "Google Search", aliases: ["google"], description: "Organic search, Maps and Google-discovered opportunities." },
  instagram: { label: "Instagram", aliases: ["instagram"], description: "Instagram DMs, profile actions and campaign-originated opportunities." },
  linkedin: { label: "LinkedIn", aliases: ["linkedin"], description: "LinkedIn prospecting, inbound messages and professional-network leads." },
  facebook: { label: "Facebook", aliases: ["facebook"], description: "Facebook page, message and campaign-originated opportunities." },
  youtube: { label: "YouTube", aliases: ["youtube"], description: "YouTube discovery, content and video CTA-originated opportunities." },
  referrals: { label: "Referrals", aliases: ["referral", "referrals"], description: "Warm introductions, customer referrals and partner-sourced opportunities." },
  "cold-list": { label: "Cold List Upload", aliases: ["other", "cold_list", "upload"], description: "Imported prospect lists that still require verification before outreach." },
} as const;

type SourceSlug = keyof typeof sources;

export async function generateMetadata({ params }: { params: Promise<{ source: string }> }): Promise<Metadata> {
  const { source } = await params;
  const config = sources[source as SourceSlug];
  return { title: config ? `${config.label} — Lead Engine` : "Lead Source — Lead Engine", robots: { index: false, follow: false } };
}

function initials(lead: Lead) {
  return (lead.company ?? lead.name)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "L";
}

export default async function LeadSourcePage({ params }: { params: Promise<{ source: string }> }) {
  const { source } = await params;
  const config = sources[source as SourceSlug];
  if (!config) notFound();

  const { supabase, workspace } = await requireWorkspace();
  const { data } = await supabase
    .from("leads")
    .select("id,name,company,email,phone,whatsapp,source,stage,niche,lead_score,estimated_value,currency,pain_point,next_action,next_action_at,google_maps_url,notes,legacy_notion_url,imported_at,created_at")
    .eq("workspace_id", workspace.id)
    .in("source", [...config.aliases])
    .order("lead_score", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  const leads = (data ?? []) as Lead[];
  const active = leads.filter((lead) => !["won", "lost"].includes(lead.stage));
  const hot = active.filter((lead) => (lead.lead_score ?? 0) >= 85);
  const won = leads.filter((lead) => lead.stage === "won");
  const scored = leads.filter((lead) => lead.lead_score !== null);
  const averageScore = scored.length ? Math.round(scored.reduce((sum, lead) => sum + (lead.lead_score ?? 0), 0) / scored.length) : 0;

  return (
    <main className={styles.sourceWorkspace}>
      <header className={styles.sourceWorkspaceHeader}>
        <div>
          <Link href="/dashboard/leads"><ArrowLeft size={14} aria-hidden="true" /> Lead Engine</Link>
          <h1>{config.label}</h1>
          <p>{config.description}</p>
        </div>
        <Link href="/dashboard/connect">Manage connection</Link>
      </header>

      <section className={styles.sourceStats}>
        <article className={styles.sourceStat}><span>Total leads</span><strong>{leads.length}</strong><small>All records from this source</small></article>
        <article className={styles.sourceStat}><span>Active</span><strong>{active.length}</strong><small>Still inside Lead Engine</small></article>
        <article className={styles.sourceStat}><span>Hot leads</span><strong>{hot.length}</strong><small>Score 85 or higher</small></article>
        <article className={styles.sourceStat}><span>Average score</span><strong>{averageScore || "—"}</strong><small>{won.length} won and handed to Sales Desk</small></article>
      </section>

      <section className={styles.sourceWorkspaceGrid}>
        <article className={styles.leadsPanel}>
          <div className={styles.panelHeadingRow} style={{ padding: "15px 16px" }}>
            <div><h2>{config.label} leads</h2><p>Verified source-specific acquisition records.</p></div>
            <Link href="/dashboard/leads">Back to all leads</Link>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.leadTable}>
              <thead><tr><th>Lead</th><th>Score</th><th>Status</th><th>Next action</th><th>Added</th></tr></thead>
              <tbody>
                {leads.map((lead) => (
                  <tr key={lead.id}>
                    <td><div className={styles.leadIdentity}><span>{initials(lead)}</span><div><strong>{lead.company ?? lead.name}</strong><small>{lead.niche ?? "Niche not set"}</small></div></div></td>
                    <td><span className={styles.scorePill}>{lead.lead_score ?? "—"}</span></td>
                    <td>{humanize(lead.stage)}</td>
                    <td><strong className={styles.nextActionText}>{lead.next_action ?? "Set next action"}</strong>{lead.next_action_at ? <small>{formatRelativeDate(lead.next_action_at)}</small> : null}</td>
                    <td>{formatRelativeDate(lead.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!leads.length ? <div className={styles.emptyState}>No leads have been attributed to this source yet.</div> : null}
          </div>
        </article>

        <aside className={styles.sideCard}>
          <h2>Source controls</h2>
          <div className={styles.sourceControls}>
            <div className={styles.controlItem}><ShieldCheck size={17} /><p><strong>Verify before outreach</strong><small>Deduplicate and confirm a valid business contact before any outbound action.</small></p></div>
            <div className={styles.controlItem}><Sparkles size={17} /><p><strong>Score against ICP</strong><small>Prioritise fit, intent, proof gap and delivery feasibility.</small></p></div>
            <div className={styles.controlItem}><Search size={17} /><p><strong>Keep attribution</strong><small>Every lead retains this source through qualification and the Won handoff.</small></p></div>
            <div className={styles.controlItem}><CheckCircle2 size={17} /><p><strong>Won boundary</strong><small>When the deal is won, the client record moves to Sales Desk.</small></p></div>
          </div>
        </aside>
      </section>
    </main>
  );
}
