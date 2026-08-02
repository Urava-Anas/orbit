import type { Metadata } from "next";
import { Fragment } from "react";
import { UsersRound } from "lucide-react";
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

export const metadata: Metadata = {
  title: "Leads",
  robots: { index: false, follow: false },
};

type PageProps = {
  searchParams: Promise<{ error?: string; notice?: string }>;
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
const currencies = ["PKR", "USD", "GBP", "EUR", "AED", "SAR"] as const;

const karachiFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Karachi",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

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
          defaultValue={leadStages.includes(lead?.stage as (typeof leadStages)[number]) ? lead?.stage : "raw"}
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
  const activeLeads = leads.filter((lead) => !["won", "lost"].includes(lead.stage));
  const highPriority = activeLeads.filter((lead) => (lead.lead_score ?? 0) >= 90);
  const overdue = activeLeads.filter(
    (lead) => lead.next_action_at && new Date(lead.next_action_at).getTime() < Date.now(),
  );

  return (
    <div className="page">
      <PageHeader
        kicker="Demand control"
        title="Lead Engine"
        description="Orbit is now the operating source of truth for Urava leads. Qualification, pain, follow-up and sales evidence live here—not across scattered Notion pages."
      />
      <Notice error={params.error} notice={params.notice} />

      <section className="metrics-grid" aria-label="Lead engine metrics">
        <MetricCard label="Active leads" value={activeLeads.length} note={`${leads.length} total records`} />
        <MetricCard label="High priority" value={highPriority.length} note="Score 90 or above" />
        <MetricCard label="Overdue follow-ups" value={overdue.length} note="Active leads past next action" />
        <MetricCard
          label="Won"
          value={leads.filter((lead) => lead.stage === "won").length}
          note="Converted acquisition records"
        />
      </section>

      <details className="create-panel">
        <summary>Add lead</summary>
        <form action={createLead}>
          <LeadFormFields />
          <div className="form-actions">
            <button className="button button-primary" type="submit">
              Save lead
            </button>
          </div>
        </form>
      </details>

      <section className="panel">
        <div className="panel-head">
          <h2>Pipeline</h2>
          <span>{leads.length} controlled records</span>
        </div>
        {leads.length ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Lead</th>
                  <th>Qualification</th>
                  <th>Pain point</th>
                  <th>Next action</th>
                  <th>Status</th>
                  <th>Source record</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <Fragment key={lead.id}>
                    <tr>
                      <td>
                        <span className="table-primary">
                          <strong>{lead.company ?? lead.name}</strong>
                          <small>
                            {lead.name !== lead.company ? lead.name : "Owner not recorded"}
                            {lead.whatsapp ? ` · WhatsApp ${lead.whatsapp}` : ""}
                          </small>
                        </span>
                      </td>
                      <td>
                        <span className="table-primary">
                          <strong>{lead.lead_score ?? "—"}/100</strong>
                          <small>
                            {lead.niche ?? "No niche"} · {formatMoney(Number(lead.estimated_value), lead.currency)}
                          </small>
                        </span>
                      </td>
                      <td>{lead.pain_point ?? "Not recorded"}</td>
                      <td>
                        <span className="table-primary">
                          <strong>{lead.next_action ?? "Not set"}</strong>
                          <small>
                            {lead.next_action_at ? formatRelativeDate(lead.next_action_at) : "No due date"}
                          </small>
                        </span>
                      </td>
                      <td>
                        <form className="inline-form" action={updateLeadStage}>
                          <input type="hidden" name="id" value={lead.id} />
                          <StatusPill value={lead.stage} />
                          <select
                            aria-label={`Update ${lead.company ?? lead.name} status`}
                            name="stage"
                            defaultValue={lead.stage}
                          >
                            {leadStages.map((stage) => (
                              <option value={stage} key={stage}>
                                {humanize(stage)}
                              </option>
                            ))}
                          </select>
                          <button className="button button-quiet" type="submit">
                            Update
                          </button>
                        </form>
                      </td>
                      <td>
                        <span className="table-primary">
                          {lead.google_maps_url ? (
                            <a href={lead.google_maps_url} target="_blank" rel="noreferrer">
                              Research link
                            </a>
                          ) : (
                            <strong>No research link</strong>
                          )}
                          <small>
                            {lead.legacy_notion_url ? (
                              <a href={lead.legacy_notion_url} target="_blank" rel="noreferrer">
                                Legacy Notion record
                              </a>
                            ) : (
                              "Created in Orbit"
                            )}
                          </small>
                        </span>
                      </td>
                    </tr>
                    <tr>
                      <td colSpan={6}>
                        <details className="create-panel">
                          <summary>Edit {lead.company ?? lead.name}</summary>
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
                      </td>
                    </tr>
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={UsersRound}
            title="No leads yet"
            description="Capture the first real opportunity. Orbit will not invent a pipeline to make the dashboard look busy."
          />
        )}
      </section>
    </div>
  );
}
