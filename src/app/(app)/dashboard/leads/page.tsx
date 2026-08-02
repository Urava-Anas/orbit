import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowUpRight,
  Clock3,
  Flame,
  MapPin,
  MessageCircle,
  Phone,
  Plus,
  Search,
  Target,
  UsersRound,
} from "lucide-react";
import {
  createLead,
  updateLead,
  updateLeadStage,
} from "@/app/(app)/dashboard/lead-actions";
import { EmptyState } from "@/components/EmptyState";
import { MetricCard } from "@/components/MetricCard";
import { Notice } from "@/components/Notice";
import { PageHeader } from "@/components/PageHeader";
import { StatusPill } from "@/components/StatusPill";
import { formatMoney, formatRelativeDate, humanize } from "@/lib/format";
import type { Lead } from "@/lib/types";
import { requireWorkspace } from "@/lib/workspace";
import styles from "./leads.module.css";

export const metadata: Metadata = {
  title: "Lead Engine",
  robots: { index: false, follow: false },
};

const leadSources = [
  "direct",
  "referral",
  "website",
  "whatsapp",
  "facebook",
  "instagram",
  "linkedin",
  "google",
  "other",
] as const;

const leadStages = [
  "raw",
  "scored",
  "contacted",
  "interested",
  "demo_booked",
  "won",
  "lost",
] as const;

const activeStages = ["raw", "scored", "contacted", "interested", "demo_booked"] as const;
const currencies = ["PKR", "USD", "GBP", "EUR", "AED", "SAR"] as const;
const viewModes = ["focus", "pipeline", "directory"] as const;
const priorityFilters = ["all", "hot", "overdue", "missing_action"] as const;

type LeadStage = (typeof leadStages)[number];
type ViewMode = (typeof viewModes)[number];
type PriorityFilter = (typeof priorityFilters)[number];

type PageProps = {
  searchParams: Promise<{
    error?: string;
    notice?: string;
    q?: string;
    stage?: string;
    priority?: string;
    view?: string;
  }>;
};

type ResolvedFilters = {
  q: string;
  stage: LeadStage | "all";
  priority: PriorityFilter;
  view: ViewMode;
};

const karachiFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Karachi",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function isLeadStage(value: string | undefined): value is LeadStage {
  return leadStages.includes(value as LeadStage);
}

function isViewMode(value: string | undefined): value is ViewMode {
  return viewModes.includes(value as ViewMode);
}

function isPriorityFilter(value: string | undefined): value is PriorityFilter {
  return priorityFilters.includes(value as PriorityFilter);
}

function toKarachiDateTimeLocal(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = karachiFormatter.formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

function ownerValue(lead?: Lead) {
  if (!lead || lead.name === lead.company) return "";
  return lead.name;
}

function isActiveLead(lead: Lead) {
  return !["won", "lost"].includes(lead.stage);
}

function isOverdue(lead: Lead, now: number) {
  if (!isActiveLead(lead) || !lead.next_action_at) return false;
  const due = new Date(lead.next_action_at).getTime();
  return !Number.isNaN(due) && due < now;
}

function attentionRank(lead: Lead, now: number) {
  if (isOverdue(lead, now)) return 0;
  if ((lead.lead_score ?? 0) >= 90) return 1;
  if (!lead.next_action || !lead.next_action_at) return 2;
  return 3;
}

function urgencyLabel(lead: Lead, now: number) {
  if (isOverdue(lead, now)) return "Follow-up overdue";
  if ((lead.lead_score ?? 0) >= 90) return "High-value opportunity";
  if (!lead.next_action || !lead.next_action_at) return "Next action missing";
  return lead.next_action_at ? formatRelativeDate(lead.next_action_at) : "Needs control";
}

function scoreClass(lead: Lead) {
  const score = lead.lead_score ?? 0;
  if (score >= 90) return `${styles.score} ${styles.scoreHot}`;
  if (score >= 75) return `${styles.score} ${styles.scoreWarm}`;
  return styles.score;
}

function phoneHref(value: string) {
  return `tel:${value.replace(/[^\d+]/g, "")}`;
}

function whatsappHref(value: string) {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = `92${digits.slice(1)}`;
  return digits ? `https://wa.me/${digits}` : null;
}

function buildHref(
  filters: ResolvedFilters,
  overrides: Partial<ResolvedFilters>,
) {
  const next = { ...filters, ...overrides };
  const search = new URLSearchParams();
  if (next.q) search.set("q", next.q);
  if (next.stage !== "all") search.set("stage", next.stage);
  if (next.priority !== "all") search.set("priority", next.priority);
  search.set("view", next.view);
  return `/dashboard/leads?${search.toString()}`;
}

function LeadFormFields({ lead }: { lead?: Lead }) {
  return (
    <div className="form-grid">
      <div className="field">
        <label htmlFor={lead ? `business-${lead.id}` : "lead-business"}>Business name</label>
        <input
          id={lead ? `business-${lead.id}` : "lead-business"}
          name="businessName"
          minLength={2}
          maxLength={160}
          defaultValue={lead?.company ?? lead?.name ?? ""}
          required
        />
      </div>
      <div className="field">
        <label htmlFor={lead ? `owner-${lead.id}` : "lead-owner"}>Owner or contact</label>
        <input
          id={lead ? `owner-${lead.id}` : "lead-owner"}
          name="ownerName"
          maxLength={120}
          defaultValue={ownerValue(lead)}
        />
      </div>
      <div className="field">
        <label htmlFor={lead ? `email-${lead.id}` : "lead-email"}>Email</label>
        <input
          id={lead ? `email-${lead.id}` : "lead-email"}
          name="email"
          type="email"
          maxLength={254}
          defaultValue={lead?.email ?? ""}
        />
      </div>
      <div className="field">
        <label htmlFor={lead ? `phone-${lead.id}` : "lead-phone"}>Phone</label>
        <input
          id={lead ? `phone-${lead.id}` : "lead-phone"}
          name="phone"
          type="tel"
          maxLength={40}
          defaultValue={lead?.phone ?? ""}
        />
      </div>
      <div className="field">
        <label htmlFor={lead ? `whatsapp-${lead.id}` : "lead-whatsapp"}>WhatsApp</label>
        <input
          id={lead ? `whatsapp-${lead.id}` : "lead-whatsapp"}
          name="whatsapp"
          type="tel"
          maxLength={40}
          defaultValue={lead?.whatsapp ?? ""}
        />
      </div>
      <div className="field">
        <label htmlFor={lead ? `niche-${lead.id}` : "lead-niche"}>Niche</label>
        <input
          id={lead ? `niche-${lead.id}` : "lead-niche"}
          name="niche"
          maxLength={100}
          placeholder="Visa Consultant, Salon, Clinic…"
          defaultValue={lead?.niche ?? ""}
        />
      </div>
      <div className="field">
        <label htmlFor={lead ? `source-${lead.id}` : "lead-source"}>Source</label>
        <select
          id={lead ? `source-${lead.id}` : "lead-source"}
          name="source"
          defaultValue={lead?.source ?? "direct"}
        >
          {leadSources.map((source) => (
            <option value={source} key={source}>
              {humanize(source)}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor={lead ? `stage-${lead.id}` : "lead-stage"}>Status</label>
        <select
          id={lead ? `stage-${lead.id}` : "lead-stage"}
          name="stage"
          defaultValue={isLeadStage(lead?.stage) ? lead.stage : "raw"}
        >
          {leadStages.map((stage) => (
            <option value={stage} key={stage}>
              {humanize(stage)}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor={lead ? `score-${lead.id}` : "lead-score"}>Lead score</label>
        <input
          id={lead ? `score-${lead.id}` : "lead-score"}
          name="leadScore"
          type="number"
          min="0"
          max="100"
          step="1"
          defaultValue={lead?.lead_score ?? ""}
        />
      </div>
      <div className="field">
        <label htmlFor={lead ? `value-${lead.id}` : "lead-value"}>Estimated value</label>
        <input
          id={lead ? `value-${lead.id}` : "lead-value"}
          name="estimatedValue"
          type="number"
          min="0"
          step="0.01"
          defaultValue={lead?.estimated_value ?? 0}
        />
      </div>
      <div className="field">
        <label htmlFor={lead ? `currency-${lead.id}` : "lead-currency"}>Currency</label>
        <select
          id={lead ? `currency-${lead.id}` : "lead-currency"}
          name="currency"
          defaultValue={lead?.currency ?? "PKR"}
        >
          {currencies.map((currency) => (
            <option value={currency} key={currency}>
              {currency}
            </option>
          ))}
        </select>
      </div>
      <div className="field field-wide">
        <label htmlFor={lead ? `pain-${lead.id}` : "lead-pain"}>Observed pain point</label>
        <textarea
          id={lead ? `pain-${lead.id}` : "lead-pain"}
          name="painPoint"
          maxLength={4000}
          defaultValue={lead?.pain_point ?? ""}
          placeholder="What business problem makes this opportunity worth pursuing?"
        />
      </div>
      <div className="field field-wide">
        <label htmlFor={lead ? `next-${lead.id}` : "lead-next"}>Next action</label>
        <input
          id={lead ? `next-${lead.id}` : "lead-next"}
          name="nextAction"
          maxLength={240}
          defaultValue={lead?.next_action ?? ""}
          placeholder="Send audit, call owner, request facts, send proposal…"
        />
      </div>
      <div className="field">
        <label htmlFor={lead ? `next-at-${lead.id}` : "lead-next-at"}>Follow-up date</label>
        <input
          id={lead ? `next-at-${lead.id}` : "lead-next-at"}
          name="nextActionAt"
          type="datetime-local"
          defaultValue={toKarachiDateTimeLocal(lead?.next_action_at ?? null)}
        />
      </div>
      <div className="field field-wide">
        <label htmlFor={lead ? `maps-${lead.id}` : "lead-maps"}>Google Maps or research link</label>
        <input
          id={lead ? `maps-${lead.id}` : "lead-maps"}
          name="googleMapsUrl"
          type="url"
          maxLength={500}
          defaultValue={lead?.google_maps_url ?? ""}
        />
      </div>
      <div className="field field-wide">
        <label htmlFor={lead ? `notes-${lead.id}` : "lead-notes"}>Evidence and sales notes</label>
        <textarea
          id={lead ? `notes-${lead.id}` : "lead-notes"}
          name="notes"
          maxLength={4000}
          defaultValue={lead?.notes ?? ""}
        />
      </div>
    </div>
  );
}

function LeadQuickActions({ lead }: { lead: Lead }) {
  const whatsapp = lead.whatsapp ? whatsappHref(lead.whatsapp) : null;
  return (
    <div className={styles.quickActions}>
      {whatsapp ? (
        <a
          className={styles.quickAction}
          href={whatsapp}
          target="_blank"
          rel="noreferrer"
          aria-label={`Message ${lead.company ?? lead.name} on WhatsApp`}
        >
          <MessageCircle size={13} aria-hidden="true" /> WhatsApp
        </a>
      ) : null}
      {lead.phone ? (
        <a className={styles.quickAction} href={phoneHref(lead.phone)}>
          <Phone size={13} aria-hidden="true" /> Call
        </a>
      ) : null}
      {lead.google_maps_url ? (
        <a
          className={styles.quickAction}
          href={lead.google_maps_url}
          target="_blank"
          rel="noreferrer"
        >
          <MapPin size={13} aria-hidden="true" /> Research
        </a>
      ) : null}
    </div>
  );
}

function LeadEditPanel({ lead }: { lead: Lead }) {
  return (
    <details className={styles.editPanel}>
      <summary>Open complete record and edit</summary>
      <form action={updateLead}>
        <input type="hidden" name="id" value={lead.id} />
        <LeadFormFields lead={lead} />
        <div className="form-actions">
          <button className="button button-primary" type="submit">
            Save changes
          </button>
        </div>
      </form>
    </details>
  );
}

export default async function LeadsPage({ searchParams }: PageProps) {
  const { supabase, workspace } = await requireWorkspace();
  const params = await searchParams;
  const { data } = await supabase
    .from("leads")
    .select(
      "id, name, company, email, phone, whatsapp, source, stage, niche, lead_score, estimated_value, currency, pain_point, next_action, next_action_at, google_maps_url, notes, legacy_notion_url, imported_at, created_at",
    )
    .eq("workspace_id", workspace.id)
    .order("lead_score", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  const leads = (data ?? []) as Lead[];
  const now = Date.now();
  const filters: ResolvedFilters = {
    q: params.q?.trim() ?? "",
    stage: isLeadStage(params.stage) ? params.stage : "all",
    priority: isPriorityFilter(params.priority) ? params.priority : "all",
    view: isViewMode(params.view) ? params.view : "focus",
  };

  const query = filters.q.toLowerCase();
  const filteredLeads = leads.filter((lead) => {
    const searchable = [
      lead.company,
      lead.name,
      lead.niche,
      lead.pain_point,
      lead.next_action,
      lead.notes,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    if (query && !searchable.includes(query)) return false;
    if (filters.stage !== "all" && lead.stage !== filters.stage) return false;
    if (filters.priority === "hot" && (lead.lead_score ?? 0) < 90) return false;
    if (filters.priority === "overdue" && !isOverdue(lead, now)) return false;
    if (
      filters.priority === "missing_action" &&
      lead.next_action &&
      lead.next_action_at
    ) {
      return false;
    }
    return true;
  });

  const activeLeads = leads.filter(isActiveLead);
  const highPriority = activeLeads.filter((lead) => (lead.lead_score ?? 0) >= 90);
  const overdue = activeLeads.filter((lead) => isOverdue(lead, now));
  const won = leads.filter((lead) => lead.stage === "won");
  const missingAction = activeLeads.filter(
    (lead) => !lead.next_action || !lead.next_action_at,
  );
  const missingScore = activeLeads.filter((lead) => lead.lead_score === null);
  const missingPain = activeLeads.filter((lead) => !lead.pain_point);
  const focusLeads = filteredLeads
    .filter(isActiveLead)
    .sort((a, b) => {
      const rank = attentionRank(a, now) - attentionRank(b, now);
      if (rank !== 0) return rank;
      return (b.lead_score ?? 0) - (a.lead_score ?? 0);
    });
  const maxStageCount = Math.max(
    ...leadStages.map((stage) => filteredLeads.filter((lead) => lead.stage === stage).length),
    1,
  );

  return (
    <div className="page">
      <PageHeader
        kicker="Revenue control"
        title="Lead Engine"
        description="Know which opportunity matters, what must happen next, and where every prospect sits in the path from research to revenue."
        action={
          <a className="button button-primary" href="#add-lead">
            <Plus size={15} aria-hidden="true" /> Add lead
          </a>
        }
      />
      <Notice error={params.error} notice={params.notice} />

      <section className="metrics-grid" aria-label="Lead engine metrics">
        <MetricCard label="Active pipeline" value={activeLeads.length} note={`${leads.length} total records`} />
        <MetricCard label="Hot leads" value={highPriority.length} note="Score 90 or above" />
        <MetricCard label="Overdue" value={overdue.length} note="Follow-ups already missed" />
        <MetricCard label="Won" value={won.length} note="Converted acquisition records" />
      </section>

      <nav className={styles.modeNav} aria-label="Lead Engine views">
        {viewModes.map((mode) => (
          <Link
            className={`${styles.modeLink} ${filters.view === mode ? styles.modeLinkActive : ""}`}
            href={buildHref(filters, { view: mode })}
            key={mode}
          >
            {mode === "focus" ? <Target size={13} aria-hidden="true" /> : null}
            {mode === "pipeline" ? <Flame size={13} aria-hidden="true" /> : null}
            {mode === "directory" ? <UsersRound size={13} aria-hidden="true" /> : null}
            {humanize(mode)}
          </Link>
        ))}
      </nav>

      <form className={styles.controlBar} method="get" action="/dashboard/leads">
        <input type="hidden" name="view" value={filters.view} />
        <div className={styles.searchField}>
          <Search size={15} aria-hidden="true" />
          <input
            aria-label="Search leads"
            name="q"
            defaultValue={filters.q}
            placeholder="Search business, niche, pain or next action"
          />
        </div>
        <div className={styles.filterWrap}>
          <label htmlFor="stage-filter">Stage</label>
          <select
            className={styles.filterSelect}
            id="stage-filter"
            name="stage"
            defaultValue={filters.stage}
          >
            <option value="all">All stages</option>
            {leadStages.map((stage) => (
              <option value={stage} key={stage}>
                {humanize(stage)}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.filterWrap}>
          <label htmlFor="priority-filter">Priority</label>
          <select
            className={styles.filterSelect}
            id="priority-filter"
            name="priority"
            defaultValue={filters.priority}
          >
            <option value="all">All priorities</option>
            <option value="hot">Hot · score 90+</option>
            <option value="overdue">Overdue follow-up</option>
            <option value="missing_action">Missing next action</option>
          </select>
        </div>
        <div className={styles.controlActions}>
          <button className="button button-primary" type="submit">Apply</button>
          <Link className="button button-quiet" href={buildHref(filters, { q: "", stage: "all", priority: "all" })}>
            Clear
          </Link>
        </div>
      </form>

      <details className="create-panel" id="add-lead">
        <summary>Add a controlled opportunity</summary>
        <form action={createLead}>
          <LeadFormFields />
          <div className="form-actions">
            <button className="button button-primary" type="submit">
              Save lead
            </button>
          </div>
        </form>
      </details>

      {filters.view === "focus" ? (
        <section className={styles.focusGrid}>
          <article className={styles.focusPanel}>
            <div className={styles.sectionHead}>
              <div>
                <h2>Founder focus</h2>
                <p>Overdue first, then high-value, then uncontrolled opportunities.</p>
              </div>
              <span>{focusLeads.length} active</span>
            </div>
            {focusLeads.length ? (
              <div className={styles.focusList}>
                {focusLeads.map((lead) => (
                  <article className={styles.focusCard} key={lead.id}>
                    <div>
                      <div className={styles.leadHeading}>
                        <h3>{lead.company ?? lead.name}</h3>
                        <StatusPill value={lead.stage} />
                        <span className={scoreClass(lead)}>{lead.lead_score ?? "—"}/100</span>
                      </div>
                      <div className={styles.leadMeta}>
                        <span>{lead.name !== lead.company ? lead.name : "Owner not recorded"}</span>
                        <span>{lead.niche ?? "Niche not set"}</span>
                        <span>{formatMoney(Number(lead.estimated_value), lead.currency)}</span>
                      </div>
                      <p className={styles.nextAction}>
                        <strong>Next:</strong> {lead.next_action ?? "No next action has been assigned."}
                      </p>
                      <span
                        className={`${styles.urgency} ${isOverdue(lead, now) ? styles.urgencyCritical : ""}`}
                      >
                        <Clock3 size={12} aria-hidden="true" /> {urgencyLabel(lead, now)}
                      </span>
                    </div>
                    <LeadQuickActions lead={lead} />
                    <LeadEditPanel lead={lead} />
                  </article>
                ))}
              </div>
            ) : (
              <div className={styles.emptyFiltered}>
                <div>
                  <strong>No active lead matches this view.</strong>
                  Clear filters or add a real opportunity.
                </div>
              </div>
            )}
          </article>

          <aside className={styles.healthPanel}>
            <div className={styles.sectionHead}>
              <div>
                <h2>Pipeline health</h2>
                <p>Control gaps that weaken conversion.</p>
              </div>
            </div>
            <div className={styles.healthBody}>
              <div className={styles.healthCallout}>
                <strong>{overdue.length}</strong>
                <span>follow-ups are overdue. Revenue leaks when the next action is missed.</span>
              </div>
              <div className={styles.stageStack}>
                {activeStages.map((stage) => {
                  const count = filteredLeads.filter((lead) => lead.stage === stage).length;
                  return (
                    <div className={styles.stageRow} key={stage}>
                      <span>{humanize(stage)}</span>
                      <div className={styles.stageBar} aria-hidden="true">
                        <i style={{ width: `${Math.max((count / maxStageCount) * 100, count ? 8 : 0)}%` }} />
                      </div>
                      <strong>{count}</strong>
                    </div>
                  );
                })}
              </div>
              <div className={styles.healthRules}>
                <div className={styles.healthRule}>
                  <span>Missing next action</span><strong>{missingAction.length}</strong>
                </div>
                <div className={styles.healthRule}>
                  <span>Missing score</span><strong>{missingScore.length}</strong>
                </div>
                <div className={styles.healthRule}>
                  <span>Missing pain point</span><strong>{missingPain.length}</strong>
                </div>
              </div>
            </div>
          </aside>
        </section>
      ) : null}

      {filters.view === "pipeline" ? (
        <section>
          {filteredLeads.length ? (
            <div className={styles.boardWrap}>
              <div className={styles.board}>
                {leadStages.map((stage) => {
                  const stageLeads = filteredLeads.filter((lead) => lead.stage === stage);
                  return (
                    <section className={styles.boardColumn} key={stage}>
                      <div className={styles.boardHead}>
                        <strong>{humanize(stage)}</strong>
                        <span>{stageLeads.length}</span>
                      </div>
                      <div className={styles.boardCards}>
                        {stageLeads.length ? stageLeads.map((lead) => (
                          <article className={styles.boardCard} key={lead.id}>
                            <h3>{lead.company ?? lead.name}</h3>
                            <div className={styles.boardMeta}>
                              <span>{lead.lead_score ?? "—"}/100</span>
                              <span>{lead.niche ?? "No niche"}</span>
                            </div>
                            <p>{lead.next_action ?? "No next action assigned."}</p>
                            <div className={styles.boardMeta}>
                              <span>{lead.next_action_at ? formatRelativeDate(lead.next_action_at) : "No date"}</span>
                              {lead.whatsapp && whatsappHref(lead.whatsapp) ? (
                                <a href={whatsappHref(lead.whatsapp) ?? undefined} target="_blank" rel="noreferrer">
                                  WhatsApp <ArrowUpRight size={9} aria-hidden="true" />
                                </a>
                              ) : null}
                            </div>
                            <form className={styles.boardForm} action={updateLeadStage}>
                              <input type="hidden" name="id" value={lead.id} />
                              <select name="stage" defaultValue={lead.stage} aria-label={`Move ${lead.company ?? lead.name}`}>
                                {leadStages.map((option) => (
                                  <option value={option} key={option}>{humanize(option)}</option>
                                ))}
                              </select>
                              <button type="submit">Move</button>
                            </form>
                            <Link
                              className={styles.quickAction}
                              href={buildHref(filters, {
                                view: "directory",
                                q: lead.company ?? lead.name,
                                stage: "all",
                                priority: "all",
                              })}
                            >
                              Open record
                            </Link>
                          </article>
                        )) : (
                          <div className={styles.boardEmpty}>No leads</div>
                        )}
                      </div>
                    </section>
                  );
                })}
              </div>
            </div>
          ) : (
            <EmptyState
              icon={UsersRound}
              title="No leads match these filters"
              description="Clear the filters or capture a new opportunity."
            />
          )}
        </section>
      ) : null}

      {filters.view === "directory" ? (
        <section className={styles.directoryPanel}>
          <div className={styles.sectionHead}>
            <div>
              <h2>Lead directory</h2>
              <p>Complete qualification, evidence, contact and follow-up records.</p>
            </div>
            <span>{filteredLeads.length} records</span>
          </div>
          {filteredLeads.length ? (
            <div className={styles.directoryList}>
              {filteredLeads.map((lead) => (
                <article className={styles.directoryCard} key={lead.id}>
                  <div className={styles.directoryCell}>
                    <span>Opportunity</span>
                    <strong>{lead.company ?? lead.name}</strong>
                    <p>{lead.name !== lead.company ? lead.name : "Owner not recorded"} · {lead.niche ?? "No niche"}</p>
                    <div className={styles.leadHeading}>
                      <StatusPill value={lead.stage} />
                      <span className={scoreClass(lead)}>{lead.lead_score ?? "—"}/100</span>
                    </div>
                  </div>
                  <div className={styles.directoryCell}>
                    <span>Observed pain</span>
                    <p>{lead.pain_point ?? "Pain point has not been documented."}</p>
                  </div>
                  <div className={styles.directoryCell}>
                    <span>Next action</span>
                    <strong>{lead.next_action ?? "Not assigned"}</strong>
                    <p>{lead.next_action_at ? formatRelativeDate(lead.next_action_at) : "No follow-up date"}</p>
                  </div>
                  <div className={styles.directoryCell}>
                    <span>Actions</span>
                    <LeadQuickActions lead={lead} />
                    {lead.legacy_notion_url ? (
                      <a className={styles.quickAction} href={lead.legacy_notion_url} target="_blank" rel="noreferrer">
                        Legacy source <ArrowUpRight size={11} aria-hidden="true" />
                      </a>
                    ) : null}
                  </div>
                  <LeadEditPanel lead={lead} />
                </article>
              ))}
            </div>
          ) : (
            <div className={styles.emptyFiltered}>
              <div>
                <strong>No lead matches this search.</strong>
                Change the filters or add a new record.
              </div>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
