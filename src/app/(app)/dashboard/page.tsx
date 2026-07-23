import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, CheckCircle2 } from "lucide-react";
import { MetricCard } from "@/components/MetricCard";
import { PageHeader } from "@/components/PageHeader";
import { formatMoney, formatRelativeDate, humanize } from "@/lib/format";
import type { AuditEvent, Lead, Project } from "@/lib/types";
import { requireWorkspace } from "@/lib/workspace";

export const metadata: Metadata = {
  title: "Command Center",
  robots: { index: false, follow: false },
};

export default async function DashboardPage() {
  const { supabase, workspace } = await requireWorkspace();
  const [leadsResult, projectsResult, invoicesResult, proofsResult, auditResult] =
    await Promise.all([
      supabase
        .from("leads")
        .select(
          "id, name, company, email, phone, source, stage, estimated_value, currency, next_action, next_action_at, created_at",
        )
        .eq("workspace_id", workspace.id),
      supabase
        .from("projects")
        .select(
          "id, client_id, name, summary, status, value, currency, due_date, created_at, clients(name)",
        )
        .eq("workspace_id", workspace.id),
      supabase
        .from("invoices")
        .select("amount, currency, status")
        .eq("workspace_id", workspace.id),
      supabase
        .from("proofs")
        .select("id, status")
        .eq("workspace_id", workspace.id),
      supabase
        .from("audit_events")
        .select("id, action, entity_type, created_at")
        .eq("workspace_id", workspace.id)
        .order("created_at", { ascending: false })
        .limit(7),
    ]);

  const leads = (leadsResult.data ?? []) as Lead[];
  const projects = (projectsResult.data ?? []) as unknown as Project[];
  const invoices = invoicesResult.data ?? [];
  const proofs = proofsResult.data ?? [];
  const audit = (auditResult.data ?? []) as AuditEvent[];
  const activeLeads = leads.filter(
    (lead) => !["won", "lost"].includes(lead.stage),
  );
  const activeProjects = projects.filter(
    (project) => project.status !== "completed",
  );
  const cashReceivedPkr = invoices
    .filter((invoice) => invoice.status === "paid" && invoice.currency === "PKR")
    .reduce((sum, invoice) => sum + Number(invoice.amount), 0);
  const approvedProof = proofs.filter((proof) =>
    ["approved", "published"].includes(proof.status),
  ).length;
  const upcoming = activeLeads
    .filter((lead) => lead.next_action && lead.next_action_at)
    .sort(
      (a, b) =>
        new Date(a.next_action_at!).getTime() -
        new Date(b.next_action_at!).getTime(),
    )
    .slice(0, 5);

  return (
    <div className="page">
      <PageHeader
        kicker="Live operating state"
        title="Command Center"
        description="What is moving, what is stuck, and what needs your decision next. Every number below resolves to a workspace record."
        action={
          <Link className="button button-primary" href="/dashboard/leads">
            Capture lead <ArrowUpRight size={15} aria-hidden="true" />
          </Link>
        }
      />

      <section className="metrics-grid" aria-label="Workspace metrics">
        <MetricCard
          label="Active pipeline"
          value={activeLeads.length}
          note={`${leads.length} total lead records`}
        />
        <MetricCard
          label="Open projects"
          value={activeProjects.length}
          note={`${projects.length} total projects`}
        />
        <MetricCard
          label="Cash received"
          value={formatMoney(cashReceivedPkr, "PKR")}
          note="Paid PKR invoices only"
        />
        <MetricCard
          label="Approved proof"
          value={approvedProof}
          note={`${proofs.length} total proof assets`}
        />
      </section>

      <section className="dashboard-grid">
        <article className="panel">
          <div className="panel-head">
            <h2>Next actions</h2>
            <span>{upcoming.length} scheduled</span>
          </div>
          {upcoming.length ? (
            <div className="action-list">
              {upcoming.map((lead) => (
                <div className="action-row" key={lead.id}>
                  <i aria-hidden="true" />
                  <div>
                    <strong>{lead.next_action}</strong>
                    <small>
                      {lead.name}
                      {lead.company ? ` · ${lead.company}` : ""}
                    </small>
                  </div>
                  <time dateTime={lead.next_action_at!}>
                    {formatRelativeDate(lead.next_action_at!)}
                  </time>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <div>
                <span className="empty-state-icon">
                  <CheckCircle2 size={22} aria-hidden="true" />
                </span>
                <h3>No scheduled follow-ups</h3>
                <p>
                  Add a next action and date to each active lead so Orbit can surface
                  what deserves attention.
                </p>
              </div>
            </div>
          )}
        </article>

        <article className="panel">
          <div className="panel-head">
            <h2>Audit trail</h2>
            <span>Latest changes</span>
          </div>
          {audit.length ? (
            <div className="action-list">
              {audit.map((event) => (
                <div className="action-row" key={event.id}>
                  <i aria-hidden="true" />
                  <div>
                    <strong>
                      {humanize(event.action)} {humanize(event.entity_type)}
                    </strong>
                    <small>Workspace mutation recorded</small>
                  </div>
                  <time dateTime={event.created_at}>
                    {formatRelativeDate(event.created_at)}
                  </time>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <div>
                <span className="empty-state-icon">
                  <CheckCircle2 size={22} aria-hidden="true" />
                </span>
                <h3>No mutations yet</h3>
                <p>Your insert, update, and delete history will appear here.</p>
              </div>
            </div>
          )}
        </article>
      </section>
    </div>
  );
}
