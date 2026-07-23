import type { Metadata } from "next";
import { UsersRound } from "lucide-react";
import { createLead, updateLeadStage } from "@/app/(app)/dashboard/actions";
import { EmptyState } from "@/components/EmptyState";
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

export default async function LeadsPage({ searchParams }: PageProps) {
  const { supabase, workspace } = await requireWorkspace();
  const params = await searchParams;
  const { data } = await supabase
    .from("leads")
    .select(
      "id, name, company, email, phone, source, stage, estimated_value, currency, next_action, next_action_at, created_at",
    )
    .eq("workspace_id", workspace.id)
    .order("created_at", { ascending: false });
  const leads = (data ?? []) as Lead[];

  return (
    <div className="page">
      <PageHeader
        kicker="Demand control"
        title="Leads"
        description="Every opportunity needs a source, stage, value, owner, and next action. If one is missing, the pipeline is not under control."
      />
      <Notice error={params.error} notice={params.notice} />

      <details className="create-panel">
        <summary>Add lead</summary>
        <form action={createLead}>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="lead-name">Contact name</label>
              <input id="lead-name" name="name" minLength={2} maxLength={120} required />
            </div>
            <div className="field">
              <label htmlFor="lead-company">Company</label>
              <input id="lead-company" name="company" maxLength={160} />
            </div>
            <div className="field">
              <label htmlFor="lead-email">Email</label>
              <input id="lead-email" name="email" type="email" maxLength={254} />
            </div>
            <div className="field">
              <label htmlFor="lead-phone">Phone or WhatsApp</label>
              <input id="lead-phone" name="phone" type="tel" maxLength={40} />
            </div>
            <div className="field">
              <label htmlFor="lead-source">Source</label>
              <select id="lead-source" name="source" defaultValue="direct">
                {[
                  "direct",
                  "referral",
                  "website",
                  "whatsapp",
                  "facebook",
                  "instagram",
                  "linkedin",
                  "google",
                  "other",
                ].map((source) => (
                  <option value={source} key={source}>
                    {humanize(source)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="lead-stage">Stage</label>
              <select id="lead-stage" name="stage" defaultValue="new">
                {["new", "qualified", "proposal", "won", "lost"].map((stage) => (
                  <option value={stage} key={stage}>
                    {humanize(stage)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="lead-value">Estimated value</label>
              <input
                id="lead-value"
                name="estimatedValue"
                type="number"
                min="0"
                step="0.01"
                defaultValue="0"
              />
            </div>
            <div className="field">
              <label htmlFor="lead-currency">Currency</label>
              <select id="lead-currency" name="currency" defaultValue="PKR">
                {["PKR", "USD", "GBP", "EUR", "AED", "SAR"].map((currency) => (
                  <option value={currency} key={currency}>
                    {currency}
                  </option>
                ))}
              </select>
            </div>
            <div className="field field-wide">
              <label htmlFor="lead-next">Next action</label>
              <input
                id="lead-next"
                name="nextAction"
                maxLength={240}
                placeholder="Send proposal, call owner, request approved facts…"
              />
            </div>
            <div className="field">
              <label htmlFor="lead-next-at">Next action date</label>
              <input id="lead-next-at" name="nextActionAt" type="datetime-local" />
            </div>
            <div className="field field-wide">
              <label htmlFor="lead-notes">Notes</label>
              <textarea id="lead-notes" name="notes" maxLength={4000} />
            </div>
          </div>
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
          <span>{leads.length} records</span>
        </div>
        {leads.length ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Lead</th>
                  <th>Source</th>
                  <th>Value</th>
                  <th>Next action</th>
                  <th>Stage</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr key={lead.id}>
                    <td>
                      <span className="table-primary">
                        <strong>{lead.name}</strong>
                        <small>{lead.company ?? lead.email ?? lead.phone ?? "No company"}</small>
                      </span>
                    </td>
                    <td>{humanize(lead.source)}</td>
                    <td>{formatMoney(Number(lead.estimated_value), lead.currency)}</td>
                    <td>
                      <span className="table-primary">
                        <strong>{lead.next_action ?? "Not set"}</strong>
                        <small>
                          {lead.next_action_at
                            ? formatRelativeDate(lead.next_action_at)
                            : "No due date"}
                        </small>
                      </span>
                    </td>
                    <td>
                      <form className="inline-form" action={updateLeadStage}>
                        <input type="hidden" name="id" value={lead.id} />
                        <StatusPill value={lead.stage} />
                        <select
                          aria-label={`Update ${lead.name} stage`}
                          name="stage"
                          defaultValue={lead.stage}
                        >
                          {["new", "qualified", "proposal", "won", "lost"].map(
                            (stage) => (
                              <option value={stage} key={stage}>
                                {humanize(stage)}
                              </option>
                            ),
                          )}
                        </select>
                        <button className="button button-quiet" type="submit">
                          Update
                        </button>
                      </form>
                    </td>
                  </tr>
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

