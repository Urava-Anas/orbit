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
  if (!activities.length) return 1;
  if ((lead.lead_score ?? 0) >= 90) return 2;
  if (!lead.next_action || !lead.next_action_at) return 3;
  return 4;
}

function ownerName(lead: Lead) {
  if (!lead.name || lead.name === lead.company) return "team";
  return lead.name;
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
  const activeLeads = leads
    .filter(isActive)
    .sort(
      (a, b) =>
        attentionRank(a, activitiesByLead.get(a.id) ?? [], now) -
          attentionRank(b, activitiesByLead.get(b.id) ?? [], now) ||
        (b.lead_score ?? 0) - (a.lead_score ?? 0),
    );
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

  return (
    <div className="page-stack">
      <PageHeader
        kicker="Revenue execution"
        title="Sales Desk"
        description="Turn qualified opportunities into disciplined outreach, follow-ups, proposals and closed clients."
        action={
          <div className={styles.headerActions}>
            <Link className="button button-quiet" href="/dashboard/leads/finder">
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
          <Crosshair size={18} aria-hidden="true" />
          <div><strong>{activeLeads.length}</strong><span>active opportunities</span></div>
        </article>
        <article className={`${styles.metric} ${overdue.length ? styles.metricDanger : ""}`}>
          <Clock3 size={18} aria-hidden="true" />
          <div><strong>{overdue.length}</strong><span>overdue follow-ups</span></div>
        </article>
        <article className={`${styles.metric} ${untouched.length ? styles.metricWarning : ""}`}>
          <Send size={18} aria-hidden="true" />
          <div><strong>{untouched.length}</strong><span>not contacted in Orbit</span></div>
        </article>
        <article className={styles.metric}>
          <Banknote size={18} aria-hidden="true" />
          <div><strong>{formatMoney(pipelineValue, primaryCurrency)}</strong><span>visible pipeline value</span></div>
        </article>
        <article className={styles.metric}>
          <CheckCircle2 size={18} aria-hidden="true" />
          <div><strong>{won.length}</strong><span>won records</span></div>
        </article>
      </section>

      <section className={styles.rules}>
        <div>
          <ShieldCheck size={18} aria-hidden="true" />
          <div>
            <strong>Urava conversion standard</strong>
            <p>Every outreach must show the biggest benefit, a specific observed problem, truthful proof, low risk and one easy next action.</p>
          </div>
        </div>
        <span>Cashvertising rules active</span>
      </section>

      <section className={styles.queue}>
        <div className={styles.sectionHead}>
          <div>
            <span className="section-kicker">Today&apos;s queue</span>
            <h2>Founder-controlled opportunities</h2>
            <p>Overdue leads appear first. Log every real interaction before moving on.</p>
          </div>
          <span>{activeLeads.length} active</span>
        </div>

        {activeLeads.length ? (
          <div className={styles.leadList}>
            {activeLeads.map((lead) => {
              const leadActivities = activitiesByLead.get(lead.id) ?? [];
              const message = outreachMessage(lead);
              const whatsapp = whatsappHref(lead.whatsapp ?? lead.phone, message);
              const overdueLead = isOverdue(lead, now);

              return (
                <article className={styles.leadCard} key={lead.id}>
                  <div className={styles.leadTop}>
                    <div>
                      <div className={styles.leadTitle}>
                        <h3>{lead.company ?? lead.name}</h3>
                        <StatusPill value={lead.stage} />
                        <span className={scoreClass(lead)}>{lead.lead_score ?? "—"}/100</span>
                      </div>
                      <p className={styles.leadMeta}>
                        {lead.name !== lead.company ? lead.name : "Owner not recorded"}
                        <span>•</span>
                        {lead.niche ?? "Niche not set"}
                        <span>•</span>
                        {formatMoney(Number(lead.estimated_value), lead.currency)}
                      </p>
                    </div>
                    <div className={styles.contactActions}>
                      {whatsapp ? (
                        <a className="button button-primary" href={whatsapp} target="_blank" rel="noreferrer">
                          <MessageCircle size={14} aria-hidden="true" /> Send WhatsApp
                        </a>
                      ) : null}
                      {lead.phone ? (
                        <a className="button button-quiet" href={phoneHref(lead.phone)}>
                          <Phone size={14} aria-hidden="true" /> Call
                        </a>
                      ) : null}
                      {lead.google_maps_url ? (
                        <a className="button button-quiet" href={lead.google_maps_url} target="_blank" rel="noreferrer">
                          <MapPin size={14} aria-hidden="true" /> Research
                        </a>
                      ) : null}
                    </div>
                  </div>

                  <div className={styles.controlGrid}>
                    <div className={styles.brief}>
                      <span>Observed problem</span>
                      <p>{lead.pain_point ?? "No verified pain point has been recorded yet. Research before contacting."}</p>
                    </div>
                    <div className={`${styles.brief} ${overdueLead ? styles.briefDanger : ""}`}>
                      <span>Next controlled action</span>
                      <strong>{lead.next_action ?? "No next action assigned"}</strong>
                      <p>{lead.next_action_at ? formatRelativeDate(lead.next_action_at) : "No follow-up time assigned"}</p>
                    </div>
                    <div className={styles.brief}>
                      <span>Orbit activity</span>
                      <strong>{leadActivities.length} logged interactions</strong>
                      <p>{leadActivities[0] ? `Last: ${humanize(leadActivities[0].outcome)}` : "No interaction logged"}</p>
                    </div>
                  </div>

                  <details className={styles.outreachPanel}>
                    <summary>Open Cashvertising outreach message</summary>
                    <div className={styles.outreachBody}>
                      <textarea aria-label={`Outreach message for ${lead.company ?? lead.name}`} readOnly defaultValue={message} />
                      <div>
                        <p>Before sending, manually confirm the visible problem. Never invent results, urgency or proof.</p>
                        {whatsapp ? (
                          <a className="button button-primary" href={whatsapp} target="_blank" rel="noreferrer">
                            Open prepared message <ArrowUpRight size={13} aria-hidden="true" />
                          </a>
                        ) : null}
                      </div>
                    </div>
                  </details>

                  <details className={styles.activityPanel} open={overdueLead || !leadActivities.length}>
                    <summary>Log activity and set the next move</summary>
                    <form action={logSalesActivity} className={styles.activityForm}>
                      <input type="hidden" name="leadId" value={lead.id} />
                      <input type="hidden" name="currentStage" value={lead.stage} />

                      <div className="field">
                        <label htmlFor={`kind-${lead.id}`}>Activity</label>
                        <select id={`kind-${lead.id}`} name="kind" defaultValue="whatsapp">
                          {activityKinds.map((kind) => <option value={kind} key={kind}>{humanize(kind)}</option>)}
                        </select>
                      </div>
                      <div className="field">
                        <label htmlFor={`direction-${lead.id}`}>Direction</label>
                        <select id={`direction-${lead.id}`} name="direction" defaultValue="outbound">
                          <option value="outbound">Outbound</option>
                          <option value="inbound">Inbound</option>
                          <option value="internal">Internal note</option>
                        </select>
                      </div>
                      <div className="field">
                        <label htmlFor={`outcome-${lead.id}`}>Outcome</label>
                        <select id={`outcome-${lead.id}`} name="outcome" defaultValue="sent">
                          {outcomes.map((outcome) => <option value={outcome} key={outcome}>{humanize(outcome)}</option>)}
                        </select>
                      </div>
                      <div className="field">
                        <label htmlFor={`stage-${lead.id}`}>Pipeline stage</label>
                        <select id={`stage-${lead.id}`} name="nextStage" defaultValue={lead.stage}>
                          {leadStages.map((stage) => <option value={stage} key={stage}>{humanize(stage)}</option>)}
                        </select>
                      </div>
                      <div className={`field ${styles.formWide}`}>
                        <label htmlFor={`summary-${lead.id}`}>What happened?</label>
                        <textarea
                          id={`summary-${lead.id}`}
                          name="summary"
                          minLength={2}
                          maxLength={4000}
                          placeholder="Example: Sent the 3-point audit. Client asked about price and delivery time."
                          required
                        />
                      </div>
                      <div className={`field ${styles.formWide}`}>
                        <label htmlFor={`next-action-${lead.id}`}>Exact next action</label>
                        <input
                          id={`next-action-${lead.id}`}
                          name="nextAction"
                          maxLength={240}
                          defaultValue={lead.next_action ?? ""}
                          placeholder="Follow up with proof, schedule discovery call, send proposal…"
                        />
                      </div>
                      <div className="field">
                        <label htmlFor={`next-at-${lead.id}`}>When?</label>
                        <input
                          id={`next-at-${lead.id}`}
                          name="nextActionAt"
                          type="datetime-local"
                          defaultValue={toKarachiDateTimeLocal(lead.next_action_at)}
                        />
                      </div>
                      <div className={styles.submitWrap}>
                        <button className="button button-primary" type="submit">
                          Save activity and control lead
                        </button>
                      </div>
                    </form>
                  </details>

                  {leadActivities.length ? (
                    <details className={styles.timelinePanel}>
                      <summary><History size={14} aria-hidden="true" /> Recent sales timeline</summary>
                      <div className={styles.timeline}>
                        {leadActivities.slice(0, 5).map((activity) => (
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
                    </details>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : (
          <div className={styles.emptyState}>
            <Crosshair size={26} aria-hidden="true" />
            <h3>No active sales opportunities</h3>
            <p>Find a real business, verify a real problem, then approve it into the Growth pipeline.</p>
            <Link className="button button-primary" href="/dashboard/leads/finder">Open Lead Finder</Link>
          </div>
        )}
      </section>
    </div>
  );
}
