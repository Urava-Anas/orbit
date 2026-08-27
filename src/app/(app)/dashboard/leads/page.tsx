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
import { formatDate, humanize } from "@/lib/format";
import { requireWorkspace } from "@/lib/workspace";
import approvedStyles from "./ApprovedLeads.module.css";
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
  searchParams: Promise<{
    error?: string;
    notice?: string;
    approved_q?: string;
    approved_source?: string;
    approved_stage?: string;
    approved_sort?: string;
  }>;
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

type ApprovedLeadMemory = {
  lead_id: string | null;
  decided_at: string | null;
};

type ApprovedLead = {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  contact_person: string | null;
  contact_role: string | null;
  source: string;
  stage: string;
  niche: string | null;
  lead_score: number | null;
  next_action: string | null;
  created_at: string;
};

type ApprovedLeadRow = ApprovedLead & {
  approved_at: string | null;
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

function approvedLeadInitials(lead: ApprovedLead) {
  return (lead.company ?? lead.name)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "L";
}

function leadSourceLabel(source: string) {
  if (source === "local_search" || source === "google") return "Local Search";
  const sourceCard = sourceCards.find((card) => card.slug === source);
  return sourceCard?.label ?? humanize(source);
}

export default async function LeadsPage({ searchParams }: PageProps) {
  const { supabase, workspace } = await requireWorkspace();
  const params = await searchParams;
  const monthStart = new Date();
  monthStart.setHours(0, 0, 0, 0);
  monthStart.setDate(1);

  const [summaryResult, activityResult, autopilotResult, activeProjectResult, emailActionResult, approvedMemoryResult] = await Promise.all([
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
    supabase
      .from("lead_finder_place_memory")
      .select("lead_id,decided_at")
      .eq("workspace_id", workspace.id)
      .eq("decision", "approved")
      .order("decided_at", { ascending: false })
      .limit(100),
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

  const approvedMemories = ((approvedMemoryResult.data ?? []) as ApprovedLeadMemory[])
    .filter((item): item is ApprovedLeadMemory & { lead_id: string } => Boolean(item.lead_id));
  const approvedIds = Array.from(new Set(approvedMemories.map((item) => item.lead_id)));
  let approvedLeadData: ApprovedLead[] = [];
  if (approvedIds.length) {
    const result = await supabase
      .from("leads")
      .select("id,name,company,email,phone,contact_person,contact_role,source,stage,niche,lead_score,next_action,created_at")
      .eq("workspace_id", workspace.id)
      .in("id", approvedIds);
    approvedLeadData = (result.data ?? []) as ApprovedLead[];
  }

  const approvedById = new Map(approvedLeadData.map((lead) => [lead.id, lead]));
  const allApprovedLeads: ApprovedLeadRow[] = approvedMemories.flatMap((memory) => {
    const lead = approvedById.get(memory.lead_id);
    return lead ? [{ ...lead, approved_at: memory.decided_at }] : [];
  });

  const approvedQuery = params.approved_q?.trim().toLowerCase() ?? "";
  const approvedSource = params.approved_source?.trim() ?? "";
  const approvedStage = params.approved_stage?.trim() ?? "";
  const approvedSort = params.approved_sort === "score" || params.approved_sort === "name" ? params.approved_sort : "newest";
  const approvedSources = Array.from(new Set(allApprovedLeads.map((lead) => lead.source))).sort((a, b) => leadSourceLabel(a).localeCompare(leadSourceLabel(b)));
  const approvedStages = Array.from(new Set(allApprovedLeads.map((lead) => lead.stage))).sort((a, b) => humanize(a).localeCompare(humanize(b)));
  const filteredApprovedLeads = allApprovedLeads
    .filter((lead) => {
      if (approvedSource && lead.source !== approvedSource) return false;
      if (approvedStage && lead.stage !== approvedStage) return false;
      if (!approvedQuery) return true;
      return [lead.company, lead.name, lead.contact_person, lead.email, lead.phone, lead.niche, lead.next_action]
        .some((value) => value?.toLowerCase().includes(approvedQuery));
    })
    .sort((a, b) => {
      if (approvedSort === "score") return (b.lead_score ?? -1) - (a.lead_score ?? -1);
      if (approvedSort === "name") return (a.company ?? a.name).localeCompare(b.company ?? b.name);
      return new Date(b.approved_at ?? b.created_at).getTime() - new Date(a.approved_at ?? a.created_at).getTime();
    });
  const hasApprovedFilters = Boolean(approvedQuery || approvedSource || approvedStage || approvedSort !== "newest");

  return (
    <main className={styles.enginePage}>
      <header className={styles.pageHeader}>
        <div>
          <h1>Lead Engine</h1>
          <p>Find leads, nurture them and turn opportunities into clients.</p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link className={styles.primaryButton} href="/dashboard/leads/send-packs">
            <Send size={16} aria-hidden="true" /> Send Packs
          </Link>
          <Link className={styles.primaryButton} href="/dashboard/leads/add">
            <Plus size={16} aria-hidden="true" /> Add lead
          </Link>
        </div>
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

          <section className={approvedStyles.panel} id="approved-leads" aria-labelledby="approved-leads-title">
            <div className={approvedStyles.heading}>
              <div>
                <div className={approvedStyles.titleLine}>
                  <h2 id="approved-leads-title">Approved Leads</h2>
                  <span className={approvedStyles.count}>{allApprovedLeads.length}</span>
                </div>
                <p>Founder-approved opportunities ready for outreach and the next Lead Engine action.</p>
              </div>
              <Link href="/dashboard/leads/sources/google">View Local Search <ArrowRight size={14} aria-hidden="true" /></Link>
            </div>

            <form className={approvedStyles.filters} action="/dashboard/leads#approved-leads" method="get">
              <label className={approvedStyles.searchBox}>
                <Search size={14} aria-hidden="true" />
                <input name="approved_q" type="search" defaultValue={params.approved_q ?? ""} placeholder="Search approved leads…" aria-label="Search approved leads" />
              </label>
              <select name="approved_source" defaultValue={approvedSource} aria-label="Filter approved leads by source">
                <option value="">All sources</option>
                {approvedSources.map((source) => <option key={source} value={source}>{leadSourceLabel(source)}</option>)}
              </select>
              <select name="approved_stage" defaultValue={approvedStage} aria-label="Filter approved leads by stage">
                <option value="">All stages</option>
                {approvedStages.map((stage) => <option key={stage} value={stage}>{humanize(stage)}</option>)}
              </select>
              <select name="approved_sort" defaultValue={approvedSort} aria-label="Sort approved leads">
                <option value="newest">Newest approved</option>
                <option value="score">Highest score</option>
                <option value="name">Name A–Z</option>
              </select>
              <button type="submit">Apply</button>
              {hasApprovedFilters ? <Link className={approvedStyles.reset} href="/dashboard/leads#approved-leads">Reset</Link> : null}
            </form>

            {allApprovedLeads.length ? (
              <>
                <div className={approvedStyles.summary}>
                  <span>Showing <strong>{filteredApprovedLeads.length}</strong> of <strong>{allApprovedLeads.length}</strong> approved leads</span>
                  <span>Approval history is preserved even after discovery results expire.</span>
                </div>
                {filteredApprovedLeads.length ? (
                  <div className={approvedStyles.tableWrap}>
                    <table className={approvedStyles.table}>
                      <thead>
                        <tr><th>Lead</th><th>Source</th><th>Score</th><th>Contact</th><th>Approved</th><th>Current stage</th><th>Next action</th><th /></tr>
                      </thead>
                      <tbody>
                        {filteredApprovedLeads.map((lead) => {
                          const contactPrimary = lead.contact_person ?? lead.email ?? lead.phone ?? "No public contact";
                          const contactSecondary = lead.contact_person
                            ? (lead.contact_role ? humanize(lead.contact_role) : lead.email ?? lead.phone ?? "Public contact")
                            : lead.email && lead.phone ? lead.phone : "";
                          return (
                            <tr key={lead.id}>
                              <td>
                                <Link className={approvedStyles.identity} href={`/dashboard/leads/${lead.id}`}>
                                  <span className={approvedStyles.avatar}>{approvedLeadInitials(lead)}</span>
                                  <span className={approvedStyles.identityText}>
                                    <strong>{lead.company ?? lead.name}</strong>
                                    <small>{lead.niche ?? "Niche not set"}</small>
                                  </span>
                                </Link>
                              </td>
                              <td><span className={approvedStyles.source}>{leadSourceLabel(lead.source)}</span></td>
                              <td><span className={approvedStyles.score}>{lead.lead_score ?? "—"}</span></td>
                              <td><span className={approvedStyles.contact}><strong>{contactPrimary}</strong>{contactSecondary ? <small>{contactSecondary}</small> : null}</span></td>
                              <td><span className={approvedStyles.date}>{formatDate(lead.approved_at ?? lead.created_at)}</span></td>
                              <td><span className={approvedStyles.stage}>{humanize(lead.stage)}</span></td>
                              <td><strong className={approvedStyles.nextAction}>{lead.next_action ?? "Set next action"}</strong></td>
                              <td><Link className={approvedStyles.open} href={`/dashboard/leads/${lead.id}`}>Open <ArrowRight size={13} aria-hidden="true" /></Link></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className={approvedStyles.empty}><div><strong>No approved leads match these filters.</strong><p>Reset the filters to return to the full approved-lead directory.</p></div></div>
                )}
              </>
            ) : (
              <div className={approvedStyles.empty}><div><strong>No approved leads yet.</strong><p>Approve a scored discovery result and Orbit will keep it here as a durable Lead Engine record.</p></div></div>
            )}
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
