import type { Metadata } from "next";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Globe2,
  Mail,
  MessageSquareText,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Star,
  UploadCloud,
  UsersRound,
} from "lucide-react";
import { Notice } from "@/components/Notice";
import { humanize } from "@/lib/format";
import { requireWorkspace } from "@/lib/workspace";
import styles from "./leads.module.css";

export const metadata: Metadata = {
  title: "Lead Engine",
  robots: { index: false, follow: false },
};

const sourceCards = [
  { slug: "website", label: "Website", icon: Globe2, tone: "purple" },
  { slug: "google", label: "Local Search", icon: Search, tone: "google" },
  { slug: "instagram", label: "Instagram", icon: MessageSquareText, tone: "instagram" },
  { slug: "linkedin", label: "LinkedIn", icon: UsersRound, tone: "linkedin" },
  { slug: "facebook", label: "Facebook", icon: MessageSquareText, tone: "facebook" },
  { slug: "youtube", label: "YouTube", icon: Globe2, tone: "youtube" },
  { slug: "referrals", label: "Referrals", icon: UsersRound, tone: "purple" },
  { slug: "cold-list", label: "Cold List Upload", icon: UploadCloud, tone: "purple" },
] as const;

type PageProps = {
  searchParams: Promise<{ error?: string; notice?: string }>;
};

type LeadActivity = {
  id: string;
  outcome: string;
  summary: string;
  occurred_at: string;
};

type AutopilotConfig = {
  state: string | null;
  max_active_projects: number | null;
  last_preflight_result: unknown;
  blocked_reason: string | null;
};

type LeadEngineSummary = {
  total: number;
  sources: Record<string, number>;
  flow: number[];
};

const emptySummary: LeadEngineSummary = {
  total: 0,
  sources: {},
  flow: [0, 0, 0, 0, 0, 0, 0, 0],
};

function asSummary(value: unknown): LeadEngineSummary {
  if (!value || typeof value !== "object" || Array.isArray(value)) return emptySummary;
  const row = value as Record<string, unknown>;
  const rawSources = row.sources && typeof row.sources === "object" && !Array.isArray(row.sources)
    ? (row.sources as Record<string, unknown>)
    : {};
  const sources = Object.fromEntries(
    Object.entries(rawSources).map(([key, count]) => [key, Math.max(0, Number(count) || 0)]),
  );
  const rawFlow = Array.isArray(row.flow) ? row.flow : [];
  return {
    total: Math.max(0, Number(row.total) || 0),
    sources,
    flow: Array.from({ length: 8 }, (_, index) => Math.max(0, Number(rawFlow[index]) || 0)),
  };
}

export default async function LeadsPage({ searchParams }: PageProps) {
  const { supabase, workspace } = await requireWorkspace();
  const params = await searchParams;
  const monthStart = new Date();
  monthStart.setHours(0, 0, 0, 0);
  monthStart.setDate(1);

  const [summaryResult, activityResult, autopilotResult, activeProjectResult, emailActionResult] = await Promise.all([
    supabase.rpc("get_lead_engine_summary", { p_workspace_id: workspace.id }),
    supabase
      .from("lead_activities")
      .select("id,outcome,summary,occurred_at")
      .eq("workspace_id", workspace.id)
      .order("occurred_at", { ascending: false })
      .limit(5),
    supabase
      .from("orbit_autopilot_configs")
      .select("state,max_active_projects,last_preflight_result,blocked_reason")
      .eq("workspace_id", workspace.id)
      .maybeSingle(),
    supabase
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspace.id)
      .neq("status", "completed"),
    supabase
      .from("orbit_external_action_requests")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspace.id)
      .eq("channel", "email")
      .in("status", ["completed", "sent", "succeeded"])
      .gte("created_at", monthStart.toISOString()),
  ]);

  const summary = summaryResult.error ? emptySummary : asSummary(summaryResult.data);
  const activities = (activityResult.data ?? []) as LeadActivity[];
  const autopilot = (autopilotResult.data ?? null) as AutopilotConfig | null;
  const totalLeadCount = Math.max(summary.total, 1);
  const flowCounts = summary.flow;
  const activeProjects = activeProjectResult.count ?? 0;
  const maxProjects = autopilot?.max_active_projects ?? 0;
  const capacityAvailable = maxProjects > 0
    ? Math.max(0, Math.round(((maxProjects - activeProjects) / maxProjects) * 100))
    : null;
  const emailActionsThisMonth = emailActionResult.count ?? 0;
  const autopilotState = autopilot?.state ? humanize(autopilot.state) : "Not configured";
  const health = autopilot?.blocked_reason ? "Needs attention" : autopilot ? "Healthy" : "Setup required";
  const activeSources = sourceCards.filter((card) => (summary.sources[card.slug] ?? 0) > 0).length;

  return (
    <main className={styles.enginePage}>
      <header className={styles.pageHeader}>
        <div>
          <h1>Lead Engine</h1>
          <p>Find leads, nurture them and turn opportunities into clients.</p>
        </div>
        <Link className={styles.primaryButton} href="/dashboard/leads/add">
          <Plus size={16} aria-hidden="true" /> Add lead
        </Link>
      </header>

      <Notice error={params.error} notice={params.notice} />

      <section className={styles.sourcePanel} aria-labelledby="lead-sources-title">
        <div className={styles.panelHeadingRow}>
          <div>
            <h2 id="lead-sources-title">Lead Sources</h2>
            <p>All your lead sources in one place. Click any source to view and manage leads.</p>
          </div>
          <Link href="/dashboard/plugins">Manage sources</Link>
        </div>
        <div className={styles.sourceGrid}>
          {sourceCards.map(({ slug, label, icon: Icon, tone }) => {
            const count = summary.sources[slug] ?? 0;
            const share = Math.round((count / totalLeadCount) * 100);
            return (
              <Link className={styles.sourceCard} href={`/dashboard/leads/sources/${slug}`} key={slug}>
                <div className={styles.sourceTitle}>
                  <span className={`${styles.sourceIcon} ${styles[`tone_${tone}`]}`}><Icon size={19} aria-hidden="true" /></span>
                  <span>{label}</span>
                </div>
                <div className={styles.sourceMetricRow}>
                  <strong>{count.toLocaleString()}</strong>
                  <ChevronRight size={17} aria-hidden="true" />
                </div>
                <small>{share}% of current lead records</small>
              </Link>
            );
          })}
          <Link className={`${styles.sourceCard} ${styles.addSourceCard}`} href="/dashboard/plugins">
            <Plus size={22} aria-hidden="true" />
            <span>Add source</span>
          </Link>
        </div>
      </section>

      <div className={styles.contentGrid}>
        <div className={styles.mainColumn}>
          <section className={styles.flowPanel} aria-labelledby="lead-flow-title">
            <div className={styles.panelHeadingRow}>
              <div>
                <h2 id="lead-flow-title">Lead Engine Flow</h2>
                <p>Everything before Won lives here. Won leads hand off to Sales Desk.</p>
              </div>
              <Link href="/dashboard/sales">View Sales Desk <ArrowRight size={14} aria-hidden="true" /></Link>
            </div>
            <div className={styles.flowTrack}>
              {[
                { label: "Find Leads", icon: Search, tone: "purple" },
                { label: "Verify & Deduplicate", icon: ShieldCheck, tone: "blue" },
                { label: "Score Leads", icon: Star, tone: "green" },
                { label: "Outreach", icon: Send, tone: "amber" },
                { label: "Follow-up", icon: Mail, tone: "amber" },
                { label: "Qualify", icon: MessageSquareText, tone: "red" },
                { label: "Proposal / Negotiation", icon: Sparkles, tone: "purple" },
                { label: "Won → Sales Desk", icon: CheckCircle2, tone: "green" },
              ].map(({ label, icon: Icon, tone }, index) => (
                <div className={styles.flowStep} key={label}>
                  <div className={styles.flowIconWrap}>
                    <span className={`${styles.flowIcon} ${styles[`flow_${tone}`]}`}><Icon size={20} aria-hidden="true" /></span>
                    {index < 7 ? <i aria-hidden="true" /> : null}
                  </div>
                  <span className={styles.stepNumber}>{index + 1}</span>
                  <strong>{label}</strong>
                  <b>{flowCounts[index].toLocaleString()}</b>
                </div>
              ))}
            </div>
            <div className={styles.autopilotNote}>
              <Sparkles size={15} aria-hidden="true" />
              <span>Orbit can run approved acquisition work automatically. Founder attention stays on exceptions and red-authority decisions.</span>
            </div>
          </section>
        </div>

        <aside className={styles.sideColumn}>
          <section className={styles.sideCard}>
            <h2>Autopilot at a glance</h2>
            <div className={styles.glanceList}>
              <div><Activity size={15} /><span>Status</span><strong className={styles.good}>{autopilotState}</strong></div>
              <div><ShieldCheck size={15} /><span>Health</span><strong className={autopilot?.blocked_reason ? styles.bad : styles.good}>{health}</strong></div>
              <div><CircleDollarSign size={15} /><span>Studio Capacity</span><strong>{capacityAvailable === null ? "Not set" : `${capacityAvailable}% available`}</strong></div>
              <div><Sparkles size={15} /><span>Active Sources</span><strong>{activeSources}</strong></div>
              <div><Mail size={15} /><span>Emails Sent This Month</span><strong>{emailActionsThisMonth}</strong></div>
            </div>
          </section>

          <section className={styles.sideCard}>
            <div className={styles.sideHeading}><h2>Recent activity</h2><Link href="/dashboard">View all</Link></div>
            <div className={styles.activityList}>
              {activities.length ? activities.map((activity) => (
                <div key={activity.id}>
                  <span className={styles.activityDot} />
                  <p><strong>{humanize(activity.outcome)}</strong><small>{activity.summary}</small></p>
                  <time>{new Date(activity.occurred_at).toLocaleDateString("en-PK", { timeZone: "Asia/Karachi" })}</time>
                </div>
              )) : <div className={styles.emptyMini}>No lead activity yet.</div>}
            </div>
          </section>

          <section className={styles.sideCard}>
            <h2>Authority guide</h2>
            <div className={styles.authorityList}>
              <div><span className={`${styles.authorityIcon} ${styles.authorityGreen}`}>○</span><p><strong>Green</strong><small>Automatic · no action needed</small></p></div>
              <div><span className={`${styles.authorityIcon} ${styles.authorityAmber}`}>◒</span><p><strong>Amber</strong><small>AI acts within approved rules</small></p></div>
              <div><span className={`${styles.authorityIcon} ${styles.authorityRed}`}>♥</span><p><strong>Red</strong><small>Needs founder approval</small></p></div>
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}
