import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowUpRight,
  Banknote,
  CheckCircle2,
  FileCheck2,
  FolderKanban,
  UsersRound,
} from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { MetricCard } from "@/components/MetricCard";
import { PageHeader } from "@/components/PageHeader";
import {
  currentTimestamp,
  formatMoney,
  formatRelativeDate,
  humanize,
} from "@/lib/format";
import type { AuditEvent, Lead, Project } from "@/lib/types";
import { requireWorkspace } from "@/lib/workspace";
import { getWorkspaceProfile } from "@/lib/workspace-profile";
import styles from "./DashboardPage.module.css";

export const metadata: Metadata = {
  title: "Founder Dashboard",
  robots: { index: false, follow: false },
};

type AttentionItem = {
  id: string;
  title: string;
  detail: string;
  href: string;
  priority: number;
  date?: string | null;
};

export default async function DashboardPage() {
  const { supabase, workspace } = await requireWorkspace();
  const profile = getWorkspaceProfile(workspace);
  const dashboard = profile.dashboard;
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
        .select("id, reference, amount, currency, status, due_at")
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
  const now = currentTimestamp();
  const nextThreeDays = now + 3 * 24 * 60 * 60 * 1000;
  const apexExperience = profile.experience === "apex";

  const activeLeads = leads.filter(
    (lead) => !["won", "lost"].includes(lead.stage),
  );
  const activeProjects = projects.filter(
    (project) => project.status !== "completed",
  );
  const cashReceived = invoices
    .filter(
      (invoice) =>
        invoice.status === "paid" && invoice.currency === dashboard.cashCurrency,
    )
    .reduce((sum, invoice) => sum + Number(invoice.amount), 0);
  const approvedProof = proofs.filter((proof) =>
    ["approved", "published"].includes(proof.status),
  ).length;

  const attention: AttentionItem[] = [];

  for (const project of activeProjects) {
    const dueTime = project.due_date ? new Date(project.due_date).getTime() : null;

    if (project.status === "blocked") {
      attention.push({
        id: `project-blocked-${project.id}`,
        title: apexExperience
          ? `${project.name} carrier account is blocked`
          : `${project.name} is blocked`,
        detail: project.clients?.name
          ? `${project.clients.name} · founder decision required`
          : "Founder decision required",
        href: "/dashboard/projects",
        priority: 1,
        date: project.due_date,
      });
    } else if (dueTime && dueTime < now) {
      attention.push({
        id: `project-overdue-${project.id}`,
        title: apexExperience
          ? `${project.name} dispatch milestone is overdue`
          : `${project.name} passed its due date`,
        detail:
          project.clients?.name ??
          (apexExperience ? "Dispatch needs review" : "Delivery needs review"),
        href: "/dashboard/projects",
        priority: 2,
        date: project.due_date,
      });
    }
  }

  for (const invoice of invoices) {
    const dueTime = invoice.due_at ? new Date(invoice.due_at).getTime() : null;
    const needsCollection =
      invoice.status === "overdue" ||
      (dueTime && dueTime < now && !["paid", "void"].includes(invoice.status));

    if (needsCollection) {
      attention.push({
        id: `invoice-${invoice.id}`,
        title: `Collect ${formatMoney(Number(invoice.amount), invoice.currency)}`,
        detail: `${invoice.reference} · payment needs attention`,
        href: "/dashboard/cash",
        priority: 1,
        date: invoice.due_at,
      });
    }
  }

  for (const lead of activeLeads) {
    if (!lead.next_action || !lead.next_action_at) continue;
    const actionTime = new Date(lead.next_action_at).getTime();
    if (Number.isNaN(actionTime) || actionTime > nextThreeDays) continue;

    attention.push({
      id: `lead-${lead.id}`,
      title: lead.next_action,
      detail: `${lead.name}${lead.company ? ` · ${lead.company}` : ""}`,
      href: "/dashboard/leads",
      priority: actionTime < now ? 1 : 3,
      date: lead.next_action_at,
    });
  }

  attention.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    const aDate = a.date ? new Date(a.date).getTime() : Number.MAX_SAFE_INTEGER;
    const bDate = b.date ? new Date(b.date).getTime() : Number.MAX_SAFE_INTEGER;
    return aDate - bDate;
  });

  const founderAttention = attention.slice(0, 7);

  return (
    <div className="page">
      <PageHeader
        kicker={dashboard.kicker}
        title={dashboard.title}
        description={dashboard.description}
        action={
          <Link className="button button-primary" href="/dashboard/leads">
            {dashboard.actionLabel} <ArrowUpRight size={15} aria-hidden="true" />
          </Link>
        }
      />

      <section className="metrics-grid" aria-label="Organisation metrics">
        <MetricCard
          label={dashboard.opportunityLabel}
          value={activeLeads.length}
          note={`${leads.length} ${dashboard.opportunityNote}`}
          icon={UsersRound}
          tone="accent"
        />
        <MetricCard
          label={dashboard.deliveryLabel}
          value={activeProjects.length}
          note={`${projects.length} ${dashboard.deliveryNote}`}
          icon={FolderKanban}
          tone="info"
        />
        <MetricCard
          label={dashboard.cashLabel}
          value={formatMoney(cashReceived, dashboard.cashCurrency)}
          note={dashboard.cashNote}
          icon={Banknote}
          tone="success"
        />
        <MetricCard
          label={dashboard.proofLabel}
          value={approvedProof}
          note={`${proofs.length} ${dashboard.proofNote}`}
          icon={FileCheck2}
          tone="warning"
        />
      </section>

      <section className="dashboard-grid">
        <article className="panel">
          <div className="panel-head">
            <h2>{dashboard.attentionTitle}</h2>
            <span>{founderAttention.length} current signals</span>
          </div>
          {founderAttention.length ? (
            <div className="action-list">
              {founderAttention.map((item) => (
                <Link
                  className={`action-row ${styles.attentionRow}`}
                  data-priority={item.priority}
                  href={item.href}
                  key={item.id}
                >
                  <i aria-hidden="true" />
                  <div>
                    <strong>{item.title}</strong>
                    <small>{item.detail}</small>
                  </div>
                  <time dateTime={item.date ?? undefined}>
                    {item.date ? formatRelativeDate(item.date) : "Review"}
                  </time>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={CheckCircle2}
              title={dashboard.attentionEmptyTitle}
              description={dashboard.attentionEmptyDescription}
              action={
                <Link className="button" href="/dashboard/leads">
                  Review opportunities
                </Link>
              }
            />
          )}
        </article>

        <article className="panel">
          <div className="panel-head">
            <h2>{dashboard.activityTitle}</h2>
            <span>{dashboard.activitySubtitle}</span>
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
                    <small>{dashboard.mutationDescription}</small>
                  </div>
                  <time dateTime={event.created_at}>
                    {formatRelativeDate(event.created_at)}
                  </time>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={CheckCircle2}
              title="No activity yet"
              description="Authorised inserts, updates and deletes will appear here as the organisation starts operating."
            />
          )}
        </article>
      </section>
    </div>
  );
}
