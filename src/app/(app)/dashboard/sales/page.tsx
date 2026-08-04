import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowUpRight,
  Banknote,
  CheckCircle2,
  Clock3,
  Crosshair,
  History,
  MapPin,
  MessageCircle,
  Phone,
  Search,
  Send,
  ShieldCheck,
  Target,
  UserRound,
} from "lucide-react";
import { Notice } from "@/components/Notice";
import { PageHeader } from "@/components/PageHeader";
import { StatusPill } from "@/components/StatusPill";
import { formatMoney, formatRelativeDate, humanize } from "@/lib/format";
import type { Lead } from "@/lib/types";
import { requireWorkspace } from "@/lib/workspace";
import { logSalesActivity } from "./actions";
import styles from "./sales.module.css";

export const metadata: Metadata = {
  title: "Sales Desk",
  robots: { index: false, follow: false },
};

const leadStages = [
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

const activityKinds = [
  "whatsapp",
  "call",
  "email",
  "meeting",
  "audit",
  "proposal",
  "note",
] as const;

const outcomes = [
  "logged",
  "sent",
  "no_answer",
  "replied",
  "booked",
  "proposal_sent",
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

type LeadActivity = {
  id: string;
  lead_id: string;
  kind: string;
  direction: string;
  outcome: string;
  summary: string;
  occurred_at: string;
  next_action: string | null;
  next_action_at: string | null;
  created_at: string;
};

type PageProps = {
  searchParams: Promise<{
    error?: string;
    notice?: string;
    lead?: string;
    q?: string;
  }>;
};

const karachiDateTimeFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Karachi",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const activityFormatter = new Intl.DateTimeFormat("en-PK", {
  timeZone: "Asia/Karachi",
  dateStyle: "medium",
  timeStyle: "short",
});

function isActive(lead: Lead) {
  return activeStages.has(lead.stage);
}

function isOverdue(lead: Lead, now: number) {
  if (!isActive(lead) || !lead.next_action_at) return false;
  const timestamp = new Date(lead.next_action_at).getTime();
  return Number.isFinite(timestamp) && timestamp < now;
}

function attentionRank(lead: Lead, activities: LeadActivity[], now: number) {
  if (isOverdue(lead, now)) return 0;
  if (!activities.length && isActive(lead)) return 1;
  if ((lead.lead_score ?? 0) >= 90 && isActive(lead)) return 2;
  if (!lead.next_action || !lead.next_action_at) return 3;
  if (lead.stage === "won") return 5;
  if (lead.stage === "lost") return 6;
  return 4;
}

function ownerName(lead: Lead) {
  if (!lead.name || lead.name === lead.company) return "team";
  return lead.name;
}

function leadInitials(lead: Lead) {
  const label = lead.company ?? lead.name;
  return label
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "L";
}

function cleanSentence(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function outreachMessage(lead: Lead) {
  const business = lead.company ?? lead.name;
  const observedPain = lead.pain_point
    ? cleanSentence(lead.pain_point)
    : "Your current online enquiry path may be making it harder for serious customers to understand the offer and take the next step.";

  return `Assalam-o-Alaikum ${ownerName(lead)}, I was reviewing ${business}. ${observedPain} Urava recently built PBIC's mobile-first website and WhatsApp enquiry system. I can send you a short 3-point audit showing what to fix first, with no obligation. Should I send it here?`;
}

function whatsappHref(value: string | null, message: string) {
  if (!value) return null;
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = `92${digits.slice(1)}`;
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

function phoneHref(value: string) {
  return `tel:${value.replace(/[^\d+]/g, "")}`;
}

function toKarachiDateTimeLocal(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = karachiDateTimeFormatter.formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

function scoreClass(lead: Lead) {
  const score = lead.lead_score ?? 0;
  if (score >= 90) return `${styles.score} ${styles.scoreHot}`;
  if (score >= 75) return `${styles.score} ${styles.scoreWarm}`;
  return styles.score;
}

function salesHref(leadId: string, query: string) {
  const search = new URLSearchParams({ lead: leadId });
  if (query) search.set("q", query);
  return `/dashboard/sales?${search.toString()}`;
}

export default async function SalesDeskPage({ searchParams }: PageProps) {
  const { supabase, workspace } = await requireWorkspace();
  const params = await searchParams;

  const [leadResult, activityResult] = await Promise.all([
    supabase
      .from("leads")
      .select(
        "id, name, company, email, phone, whatsapp, source, stage, niche, lead_score, estimated_value, currency, pain_point, next_action, next_action_at, google_maps_url, notes, legacy_notion_url, imported_at, created_at",
      )
      .eq("workspace_id", workspace.id)
      .order("lead_score", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("lead_activities")
      .select(
        "id, lead_id, kind, direction, outcome, summary, occurred_at, next_action, next_action_at, created_at",
      )
      .eq("workspace_id", workspace.id)
      .order("occurred_at", { ascending: false })
      .limit(250),
  ]);

  const leads = (leadResult.data ?? []) as Lead[];
  const activities = (activityResult.data ?? []) as LeadActivity[];
  const activitiesByLead = new Map<string, LeadActivity[]>();

  for (const activity of activities) {
    const list = activitiesByLead.get(activity.lead_id) ?? [];
    list.push(activity);
    activitiesByLead.set(activity.lead_id, list);
  }

  const now = Date.now();
  const sortedLeads = [...leads].sort(
    (a, b) =>
      attentionRank(a, activitiesByLead.get(a.id) ?? [], now) -
        attentionRank(b, activitiesByLead.get(b.id) ?? [], now) ||
      (b.lead_score ?? 0) - (a.lead_score ?? 0),
  );
  const query = params.q?.trim().toLowerCase() ?? "";
  const visibleLeads = query
    ? sortedLeads.filter((lead) =>
        [lead.company, lead.name, lead.niche, lead.stage]
          .filter(Boolean)
          .some((value) => value?.toLowerCase().includes(query)),
      )
    : sortedLeads;
  const selectedLead =
    visibleLeads.find((lead) => lead.id === params.lead) ??
    sortedLeads.find((lead) => lead.id === params.lead) ??
    visibleLeads[0] ??
    sortedLeads[0] ??
    null;

  const activeLeads = leads.filter(isActive);
  const overdue = activeLeads.filter((lead) => isOverdue(lead, now));
  const untouched = activeLeads.filter(
    (lead) => !(activitiesByLead.get(lead.id) ?? []).length,
  );
  const won = leads.filter((lead) => lead.stage === "won");
  const pipelineValue = activeLeads.reduce(
    (sum, lead) => sum + Number(lead.estimated_value || 0),
    0,
  );
  const primaryCurrency = activeLeads[0]?.currency ?? "PKR";
  const selectedActivities = selectedLead
    ? activitiesByLead.get(selectedLead.id) ?? []
    : [];
  const selectedMessage = selectedLead ? outreachMessage(selectedLead) : "";
  const selectedWhatsapp = selectedLead
    ? whatsappHref(selectedLead.whatsapp ?? selectedLead.phone, selectedMessage)
    : null;
  const selectedOverdue = selectedLead ? isOverdue(selectedLead, now) : false;

  return (
    <div className="page-stack">
      <PageHeader
        kicker="Revenue execution"
        title="Sales Desk"
        description="Select an opportunity, open its complete sales profile, and control every interaction from one focused workspace."
        action={
          <div className={styles.headerActions}>
            <Link className="button button-quiet" href="/dashboard/leads#lead-finder">
              <Search size={15} aria-hidden="true" /> Find leads
            </Link>
            <Link className="button button-primary" href="/dashboard/leads">
              <Target size={15} aria-hidden="true" /> Growth cockpit
            </Link>
          </div>
        }
      />

      <Notice error={params.error} notice={params.notice} />

      <section className={styles.metrics} aria-label="Sales performance controls">
        <article className={styles.metric}>
          <Crosshair size={17} aria-hidden="true" />
          <div><strong>{activeLeads.length}</strong><span>active</span></div>
        </article>
        <article className={`${styles.metric} ${overdue.length ? styles.metricDanger : ""}`}>
          <Clock3 size={17} aria-hidden="true" />
          <div><strong>{overdue.length}</strong><span>overdue</span></div>
        </article>
        <article className={`${styles.metric} ${untouched.length ? styles.metricWarning : ""}`}>
          <Send size={17} aria-hidden="true" />
          <div><strong>{untouched.length}</strong><span>untouched</span></div>
        </article>
        <article className={styles.metric}>
          <Banknote size={17} aria-hidden="true" />
          <div><strong>{formatMoney(pipelineValue, primaryCurrency)}</strong><span>pipeline</span></div>
        </article>
        <article className={styles.metric}>
          <CheckCircle2 size={17} aria-hidden="true" />
          <div><strong>{won.length}</strong><span>won</span></div>
        </article>
      </section>

      <section className={styles.rules}>
        <ShieldCheck size={17} aria-hidden="true" />
        <p><strong>Urava conversion standard:</strong> biggest benefit, specific problem, truthful proof, low risk and one easy next action.</p>
        <span>Cashvertising active</span>
      </section>

      <section className={styles.workspace}>
        <aside className={styles.directory} aria-label="Sales opportunities">
          <div className={styles.directoryHead}>
            <div>
              <span className="section-kicker">Opportunity directory</span>
              <h2>Leads</h2>
            </div>
            <span>{visibleLeads.length}</span>
          </div>

          <form className={styles.searchBox} method="get" action="/dashboard/sales">
            <Search size={15} aria-hidden="true" />
            <input name="q" defaultValue={params.q ?? ""} placeholder="Search leads" aria-label="Search sales leads" />
            {selectedLead ? <input type="hidden" name="lead" value={selectedLead.id} /> : null}
          </form>

          <nav className={styles.profileList} aria-label="Choose a lead profile">
            {visibleLeads.map((lead) => {
              const leadActivities = activitiesByLead.get(lead.id) ?? [];
              const overdueLead = isOverdue(lead, now);
              const selected = selectedLead?.id === lead.id;
              return (
                <Link
                  className={`${styles.profileRow} ${selected ? styles.profileRowActive : ""}`}
                  href={salesHref(lead.id, params.q ?? "")}
                  key={lead.id}
                  aria-current={selected ? "page" : undefined}
                >
                  <span className={styles.avatar}>{leadInitials(lead)}</span>
                  <span className={styles.profileCopy}>
                    <strong>{lead.company ?? lead.name}</strong>
                    <small>{lead.niche ?? "Niche not set"} · {humanize(lead.stage)}</small>
                    <em className={overdueLead ? styles.overdueText : ""}>
                      {overdueLead
                        ? "Follow-up overdue"
                        : leadActivities[0]
                          ? `Last: ${humanize(leadActivities[0].outcome)}`
                          : "No interaction logged"}
                    </em>
                  </span>
                  <span className={scoreClass(lead)}>{lead.lead_score ?? "—"}</span>
                </Link>
              );
            })}
          </nav>

          {!visibleLeads.length ? (
            <div className={styles.listEmpty}>
              <UserRound size={22} aria-hidden="true" />
              <strong>No matching lead</strong>
              <p>Clear the search or find a new opportunity.</p>
            </div>
          ) : null}
        </aside>

        <main className={styles.profilePane}>
          {selectedLead ? (
            <article className={styles.leadProfile}>
              <header className={styles.profileHeader}>
                <div className={styles.identity}>
                  <span className={styles.avatarLarge}>{leadInitials(selectedLead)}</span>
                  <div>
                    <div className={styles.leadTitle}>
                      <h2>{selectedLead.company ?? selectedLead.name}</h2>
                      <StatusPill value={selectedLead.stage} />
                      <span className={scoreClass(selectedLead)}>{selectedLead.lead_score ?? "—"}/100</span>
                    </div>
                    <p>
                      {selectedLead.name !== selectedLead.company ? selectedLead.name : "Owner not recorded"}
                      <span>•</span>
                      {selectedLead.niche ?? "Niche not set"}
                      <span>•</span>
                      {formatMoney(Number(selectedLead.estimated_value), selectedLead.currency)}
                    </p>
                  </div>
                </div>
                <div className={styles.contactActions}>
                  {selectedWhatsapp ? (
                    <a className="button button-primary" href={selectedWhatsapp} target="_blank" rel="noreferrer">
                      <MessageCircle size={14} aria-hidden="true" /> WhatsApp
                    </a>
                  ) : null}
                  {selectedLead.phone ? (
                    <a className="button button-quiet" href={phoneHref(selectedLead.phone)}>
                      <Phone size={14} aria-hidden="true" /> Call
                    </a>
                  ) : null}
                  {selectedLead.google_maps_url ? (
                    <a className="button button-quiet" href={selectedLead.google_maps_url} target="_blank" rel="noreferrer">
                      <MapPin size={14} aria-hidden="true" /> Research
                    </a>
                  ) : null}
                </div>
              </header>

              <div className={styles.profileStats}>
                <div><span>Stage</span><strong>{humanize(selectedLead.stage)}</strong></div>
                <div><span>Score</span><strong>{selectedLead.lead_score ?? "—"}/100</strong></div>
                <div><span>Interactions</span><strong>{selectedActivities.length}</strong></div>
                <div><span>Source</span><strong>{humanize(selectedLead.source)}</strong></div>
              </div>

              <div className={styles.controlGrid}>
                <div className={styles.brief}>
                  <span>Observed problem</span>
                  <p>{selectedLead.pain_point ?? "No verified pain point has been recorded yet. Research before contacting."}</p>
                </div>
                <div className={`${styles.brief} ${selectedOverdue ? styles.briefDanger : ""}`}>
                  <span>Next controlled action</span>
                  <strong>{selectedLead.next_action ?? "No next action assigned"}</strong>
                  <p>{selectedLead.next_action_at ? formatRelativeDate(selectedLead.next_action_at) : "No follow-up time assigned"}</p>
                </div>
                <div className={styles.brief}>
                  <span>Latest activity</span>
                  <strong>{selectedActivities[0] ? humanize(selectedActivities[0].outcome) : "No interaction"}</strong>
                  <p>{selectedActivities[0]?.summary ?? "Nothing has been logged in Orbit yet."}</p>
                </div>
              </div>

              <details className={styles.outreachPanel}>
                <summary>Open Cashvertising outreach message</summary>
                <div className={styles.outreachBody}>
                  <textarea aria-label={`Outreach message for ${selectedLead.company ?? selectedLead.name}`} readOnly defaultValue={selectedMessage} />
                  <div>
                    <p>Confirm the visible problem before sending. Never invent results, urgency or proof.</p>
                    {selectedWhatsapp ? (
                      <a className="button button-primary" href={selectedWhatsapp} target="_blank" rel="noreferrer">
                        Open prepared message <ArrowUpRight size={13} aria-hidden="true" />
                      </a>
                    ) : null}
                  </div>
                </div>
              </details>

              <details className={styles.activityPanel} open={selectedOverdue || !selectedActivities.length}>
                <summary>Log activity and set the next move</summary>
                <form action={logSalesActivity} className={styles.activityForm}>
                  <input type="hidden" name="leadId" value={selectedLead.id} />
                  <input type="hidden" name="currentStage" value={selectedLead.stage} />
                  <input type="hidden" name="returnLeadId" value={selectedLead.id} />

                  <div className="field">
                    <label htmlFor={`kind-${selectedLead.id}`}>Activity</label>
                    <select id={`kind-${selectedLead.id}`} name="kind" defaultValue="whatsapp">
                      {activityKinds.map((kind) => <option value={kind} key={kind}>{humanize(kind)}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor={`direction-${selectedLead.id}`}>Direction</label>
                    <select id={`direction-${selectedLead.id}`} name="direction" defaultValue="outbound">
                      <option value="outbound">Outbound</option>
                      <option value="inbound">Inbound</option>
                      <option value="internal">Internal note</option>
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor={`outcome-${selectedLead.id}`}>Outcome</label>
                    <select id={`outcome-${selectedLead.id}`} name="outcome" defaultValue="sent">
                      {outcomes.map((outcome) => <option value={outcome} key={outcome}>{humanize(outcome)}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor={`stage-${selectedLead.id}`}>Pipeline stage</label>
                    <select id={`stage-${selectedLead.id}`} name="nextStage" defaultValue={selectedLead.stage}>
                      {leadStages.map((stage) => <option value={stage} key={stage}>{humanize(stage)}</option>)}
                    </select>
                  </div>
                  <div className={`field ${styles.formWide}`}>
                    <label htmlFor={`summary-${selectedLead.id}`}>What happened?</label>
                    <textarea
                      id={`summary-${selectedLead.id}`}
                      name="summary"
                      minLength={2}
                      maxLength={4000}
                      placeholder="Example: Sent the 3-point audit. Client asked about price and delivery time."
                      required
                    />
                  </div>
                  <div className={`field ${styles.formWide}`}>
                    <label htmlFor={`next-action-${selectedLead.id}`}>Exact next action</label>
                    <input
                      id={`next-action-${selectedLead.id}`}
                      name="nextAction"
                      maxLength={240}
                      defaultValue={selectedLead.next_action ?? ""}
                      placeholder="Follow up with proof, schedule discovery call, send proposal…"
                    />
                  </div>
                  <div className="field">
                    <label htmlFor={`next-at-${selectedLead.id}`}>When?</label>
                    <input
                      id={`next-at-${selectedLead.id}`}
                      name="nextActionAt"
                      type="datetime-local"
                      defaultValue={toKarachiDateTimeLocal(selectedLead.next_action_at)}
                    />
                  </div>
                  <div className={styles.submitWrap}>
                    <button className="button button-primary" type="submit">
                      Save activity and control lead
                    </button>
                  </div>
                </form>
              </details>

              <section className={styles.timelinePanel}>
                <div className={styles.timelineHead}>
                  <History size={14} aria-hidden="true" />
                  <strong>Sales timeline</strong>
                  <span>{selectedActivities.length} records</span>
                </div>
                {selectedActivities.length ? (
                  <div className={styles.timeline}>
                    {selectedActivities.slice(0, 12).map((activity) => (
                      <article key={activity.id}>
                        <div>
                          <strong>{humanize(activity.kind)} · {humanize(activity.outcome)}</strong>
                          <span>{activityFormatter.format(new Date(activity.occurred_at))}</span>
                        </div>
                        <p>{activity.summary}</p>
                        {activity.next_action ? <small>Next: {activity.next_action}</small> : null}
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className={styles.timelineEmpty}>No sales activity has been logged for this lead.</div>
                )}
              </section>
            </article>
          ) : (
            <div className={styles.emptyState}>
              <Crosshair size={28} aria-hidden="true" />
              <h3>No sales opportunities</h3>
              <p>Find a real business, verify a real problem, and approve it into Growth.</p>
              <Link className="button button-primary" href="/dashboard/leads#lead-finder">Open Lead Finder</Link>
            </div>
          )}
        </main>
      </section>
    </div>
  );
}
