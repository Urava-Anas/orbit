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
import { createLead } from "@/app/(app)/dashboard/lead-actions";
import { Notice } from "@/components/Notice";
import { formatRelativeDate, humanize } from "@/lib/format";
import type { Lead } from "@/lib/types";
import { requireWorkspace } from "@/lib/workspace";
import styles from "./leads.module.css";

export const metadata: Metadata = {
  title: "Lead Engine",
  robots: { index: false, follow: false },
};

const stages = [
  "new",
  "raw",
  "scored",
  "qualified",
  "contacted",
  "interested",
  "demo_booked",
  "proposal",
  "won",
  "lost",
] as const;

const activeStages = new Set([
  "new",
  "raw",
  "scored",
  "qualified",
  "contacted",
  "interested",
  "demo_booked",
  "proposal",
]);

const sourceCards = [
  { slug: "website", label: "Website", aliases: ["website"], icon: Globe2, tone: "purple" },
  { slug: "google", label: "Google Search", aliases: ["google"], icon: Search, tone: "google" },
  { slug: "instagram", label: "Instagram", aliases: ["instagram"], icon: MessageSquareText, tone: "instagram" },
  { slug: "linkedin", label: "LinkedIn", aliases: ["linkedin"], icon: UsersRound, tone: "linkedin" },
  { slug: "facebook", label: "Facebook", aliases: ["facebook"], icon: MessageSquareText, tone: "facebook" },
  { slug: "youtube", label: "YouTube", aliases: ["youtube"], icon: Globe2, tone: "youtube" },
  { slug: "referrals", label: "Referrals", aliases: ["referral", "referrals"], icon: UsersRound, tone: "purple" },
  { slug: "cold-list", label: "Cold List Upload", aliases: ["other", "cold_list", "upload"], icon: UploadCloud, tone: "purple" },
] as const;

type PageProps = {
  searchParams: Promise<{
    error?: string;
    notice?: string;
    q?: string;
    stage?: string;
    priority?: string;
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

type ExternalAction = {
  id: string;
  channel: string | null;
  status: string | null;
  created_at: string;
};

function isActive(lead: Lead) {
  return activeStages.has(lead.stage);
}

function isOverdue(lead: Lead, now: number) {
  if (!isActive(lead) || !lead.next_action_at) return false;
  const timestamp = new Date(lead.next_action_at).getTime();
  return Number.isFinite(timestamp) && timestamp < now;
}

function stageTone(stage: string) {
  if (stage === "won") return "green";
  if (["proposal", "demo_booked", "interested"].includes(stage)) return "amber";
  if (["contacted", "qualified"].includes(stage)) return "blue";
  if (stage === "lost") return "red";
  return "neutral";
}

function sourceLabel(source: string) {
  return sourceCards.find((card) => card.aliases.includes(source as never))?.label ?? humanize(source);
}

function initials(lead: Lead) {
  return (lead.company ?? lead.name)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "L";
}

function normaliseStage(value: string | undefined) {
  return stages.includes(value as (typeof stages)[number]) ? value : "all";
}

function countFlow(leads: Lead[]) {
  const notLost = leads.filter((lead) => lead.stage !== "lost");
  const verified = notLost.filter((lead) => lead.lead_score !== null || !["new", "raw"].includes(lead.stage));
  const scored = notLost.filter((lead) => lead.lead_score !== null || ["scored", "qualified", "contacted", "interested", "demo_booked", "proposal", "won"].includes(lead.stage));
  const outreach = notLost.filter((lead) => ["contacted", "interested", "demo_booked", "proposal", "won"].includes(lead.stage));
  const followup = notLost.filter((lead) => Boolean(lead.next_action));
  const qualified = notLost.filter((lead) => ["qualified", "interested", "demo_booked", "proposal", "won"].includes(lead.stage));
  const proposal = notLost.filter((lead) => ["proposal", "won"].includes(lead.stage));
  const won = notLost.filter((lead) => lead.stage === "won");
  return [notLost.length, verified.length, scored.length, outreach.length, followup.length, qualified.length, proposal.length, won.length];
}

export default async function LeadsPage({ searchParams }: PageProps) {
  const { supabase, workspace } = await requireWorkspace();
  const params = await searchParams;
  const monthStart = new Date();
  monthStart.setHours(0, 0, 0, 0);
  monthStart.setDate(1);

  const [leadResult, activityResult, autopilotResult, projectResult, actionResult] = await Promise.all([
    supabase
      .from("leads")
      .select("id,name,company,email,phone,whatsapp,source,stage,niche,lead_score,estimated_value,currency,pain_point,next_action,next_action_at,google_maps_url,notes,legacy_notion_url,imported_at,created_at")
      .eq("workspace_id", workspace.id)
      .order("lead_score", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false }),
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
      .select("id,status")
      .eq("workspace_id", workspace.id),
    supabase
      .from("orbit_external_action_requests")
      .select("id,channel,status,created_at")
      .eq("workspace_id", workspace.id)
      .gte("created_at", monthStart.toISOString())
      .order("created_at", { ascending: false })
      .limit(250),
  ]);

  const leads = (leadResult.data ?? []) as Lead[];
  const activities = (activityResult.data ?? []) as LeadActivity[];
  const autopilot = (autopilotResult.data ?? null) as AutopilotConfig | null;
  const projects = projectResult.data ?? [];
  const externalActions = (actionResult.data ?? []) as ExternalAction[];
  const now = Date.now();

  const q = params.q?.trim().toLowerCase() ?? "";
  const stage = normaliseStage(params.stage);
  const priority = params.priority ?? "all";
  const visibleLeads = leads.filter((lead) => {
    const searchText = [lead.company, lead.name, lead.niche, lead.pain_point, lead.next_action]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (q && !searchText.includes(q)) return false;
    if (stage !== "all" && lead.stage !== stage) return false;
    if (priority === "hot" && (lead.lead_score ?? 0) < 85) return false;
    if (priority === "overdue" && !isOverdue(lead, now)) return false;
    return true;
  });

  const totalLeadCount = Math.max(leads.length, 1);
  const flowCounts = countFlow(leads);
  const activeProjects = projects.filter((project) => project.status !== "completed").length;
  const maxProjects = autopilot?.max_active_projects ?? 0;
  const capacityAvailable = maxProjects > 0
    ? Math.max(0, Math.round(((maxProjects - activeProjects) / maxProjects) * 100))
    : null;
  const emailActionsThisMonth = externalActions.filter(
    (action) => action.channel === "email" && ["completed", "sent", "succeeded"].includes(action.status ?? ""),
  ).length;
  const autopilotState = autopilot?.state ? humanize(autopilot.state) : "Not configured";
  const health = autopilot?.blocked_reason ? "Needs attention" : autopilot ? "Healthy" : "Setup required";

  return (
    <main className={styles.enginePage}>
      <header className={styles.pageHeader}>
        <div>
          <h1>Lead Engine</h1>
          <p>Find leads, nurture them and turn opportunities into clients.</p>
        </div>
        <a className={styles.primaryButton} href="#add-lead">
          <Plus size={16} aria-hidden="true" /> Add lead
        </a>
      </header>

      <Notice error={params.error} notice={params.notice} />

      <section className={styles.sourcePanel} aria-labelledby="lead-sources-title">
        <div className={styles.panelHeadingRow}>
          <div>
            <h2 id="lead-sources-title">Lead Sources</h2>
            <p>All your lead sources in one place. Click any source to view and manage leads.</p>
          </div>
          <Link href="/dashboard/connect">Manage sources</Link>
        </div>
        <div className={styles.sourceGrid}>
          {sourceCards.map(({ slug, label, aliases, icon: Icon, tone }) => {
            const count = leads.filter((lead) => aliases.includes(lead.source as never)).length;
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
          <Link className={`${styles.sourceCard} ${styles.addSourceCard}`} href="/dashboard/connect">
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

          <section className={styles.leadsPanel} aria-labelledby="lead-list-title">
            <div className={styles.tabs}>
              <span className={styles.activeTab}>All Leads</span>
              <Link href="/dashboard/leads?priority=hot">Hot Leads</Link>
              <Link href="/dashboard/leads?stage=contacted">Outreach</Link>
              <Link href="/dashboard/leads?stage=interested">Responses</Link>
              <Link href="/dashboard/leads?stage=proposal">Opportunities</Link>
              <Link href="/dashboard/sales">Won → Sales Desk</Link>
            </div>

            <form className={styles.filterBar} action="/dashboard/leads" method="get">
              <label className={styles.searchBox}>
                <Search size={15} aria-hidden="true" />
                <input name="q" defaultValue={params.q ?? ""} placeholder="Search business, niche, pain or next action" />
              </label>
              <select name="stage" defaultValue={stage} aria-label="Filter by stage">
                <option value="all">All stages</option>
                {stages.map((value) => <option value={value} key={value}>{humanize(value)}</option>)}
              </select>
              <select name="priority" defaultValue={priority} aria-label="Filter by priority">
                <option value="all">All priorities</option>
                <option value="hot">Hot leads</option>
                <option value="overdue">Overdue</option>
              </select>
              <button type="submit">Apply</button>
              <Link href="/dashboard/leads">Clear</Link>
            </form>

            <div className={styles.tableWrap}>
              <table className={styles.leadTable}>
                <thead>
                  <tr>
                    <th id="lead-list-title">Lead</th>
                    <th>Source</th>
                    <th>Score</th>
                    <th>Status</th>
                    <th>Last contact</th>
                    <th>Next action</th>
                    <th>Owner</th>
                    <th>Priority</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {visibleLeads.slice(0, 10).map((lead) => {
                    const overdue = isOverdue(lead, now);
                    const score = lead.lead_score ?? 0;
                    return (
                      <tr key={lead.id}>
                        <td>
                          <div className={styles.leadIdentity}>
                            <span>{initials(lead)}</span>
                            <div><strong>{lead.company ?? lead.name}</strong><small>{lead.niche ?? "Niche not set"}</small></div>
                          </div>
                        </td>
                        <td>{sourceLabel(lead.source)}</td>
                        <td><span className={styles.scorePill}>{lead.lead_score ?? "—"}</span></td>
                        <td><span className={`${styles.statusPill} ${styles[`status_${stageTone(lead.stage)}`]}`}>{humanize(lead.stage)}</span></td>
                        <td>{formatRelativeDate(lead.created_at)}</td>
                        <td><strong className={styles.nextActionText}>{lead.next_action ?? "Set next action"}</strong>{lead.next_action_at ? <small>{formatRelativeDate(lead.next_action_at)}</small> : null}</td>
                        <td><span>AI Agent</span><small>Orbit Outbound</small></td>
                        <td><span className={`${styles.priorityPill} ${overdue || score >= 90 ? styles.priorityHigh : score >= 75 ? styles.priorityMedium : ""}`}>{overdue || score >= 90 ? "High" : score >= 75 ? "Medium" : "Normal"}</span></td>
                        <td><Link className={styles.rowAction} href={lead.stage === "won" ? "/dashboard/sales" : `/dashboard/leads?q=${encodeURIComponent(lead.company ?? lead.name)}`} aria-label={`Open ${lead.company ?? lead.name}`}><ArrowRight size={15} /></Link></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!visibleLeads.length ? <div className={styles.emptyState}>No leads match these filters.</div> : null}
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
              <div><Sparkles size={15} /><span>Active Sources</span><strong>{sourceCards.filter((card) => leads.some((lead) => card.aliases.includes(lead.source as never))).length}</strong></div>
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
                  <time>{formatRelativeDate(activity.occurred_at)}</time>
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

      <section className={styles.addPanel} id="add-lead" aria-label="Add lead">
        <div className={styles.addPanelCard}>
          <div className={styles.addPanelHeader}><div><h2>Add lead</h2><p>Create a controlled acquisition record.</p></div><Link href="/dashboard/leads">×</Link></div>
          <form action={createLead} className={styles.addForm}>
            <label><span>Business name</span><input name="businessName" required minLength={2} /></label>
            <label><span>Owner or contact</span><input name="ownerName" /></label>
            <label><span>Email</span><input name="email" type="email" /></label>
            <label><span>Phone</span><input name="phone" type="tel" /></label>
            <label><span>WhatsApp</span><input name="whatsapp" type="tel" /></label>
            <label><span>Niche</span><input name="niche" /></label>
            <label><span>Source</span><select name="source" defaultValue="direct"><option value="direct">Direct</option><option value="website">Website</option><option value="google">Google</option><option value="instagram">Instagram</option><option value="linkedin">LinkedIn</option><option value="facebook">Facebook</option><option value="referral">Referral</option><option value="other">Other</option></select></label>
            <label><span>Stage</span><select name="stage" defaultValue="raw"><option value="raw">Raw</option><option value="scored">Scored</option><option value="contacted">Contacted</option><option value="interested">Interested</option><option value="demo_booked">Demo booked</option><option value="won">Won</option><option value="lost">Lost</option></select></label>
            <label><span>Lead score</span><input name="leadScore" type="number" min="0" max="100" /></label>
            <label><span>Estimated value</span><input name="estimatedValue" type="number" min="0" defaultValue="0" /></label>
            <label><span>Currency</span><select name="currency" defaultValue="PKR"><option>PKR</option><option>USD</option><option>GBP</option><option>EUR</option><option>AED</option><option>SAR</option></select></label>
            <label className={styles.wideField}><span>Pain point</span><textarea name="painPoint" /></label>
            <label className={styles.wideField}><span>Next action</span><input name="nextAction" /></label>
            <label><span>Follow-up date</span><input name="nextActionAt" type="datetime-local" /></label>
            <label className={styles.wideField}><span>Research link</span><input name="googleMapsUrl" type="url" /></label>
            <label className={styles.wideField}><span>Notes</span><textarea name="notes" /></label>
            <div className={styles.formActions}><Link href="/dashboard/leads">Cancel</Link><button type="submit">Save lead</button></div>
          </form>
        </div>
      </section>
    </main>
  );
}
