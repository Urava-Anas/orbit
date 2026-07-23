import type { Metadata } from "next";
import { Banknote } from "lucide-react";
import {
  createInvoice,
  updateInvoiceStatus,
} from "@/app/(app)/dashboard/actions";
import { EmptyState } from "@/components/EmptyState";
import { Notice } from "@/components/Notice";
import { PageHeader } from "@/components/PageHeader";
import { StatusPill } from "@/components/StatusPill";
import { formatDate, formatMoney, humanize } from "@/lib/format";
import type { Invoice, Project } from "@/lib/types";
import { requireWorkspace } from "@/lib/workspace";

export const metadata: Metadata = {
  title: "Cash",
  robots: { index: false, follow: false },
};

type PageProps = {
  searchParams: Promise<{ error?: string; notice?: string }>;
};

export default async function CashPage({ searchParams }: PageProps) {
  const { supabase, workspace } = await requireWorkspace();
  const params = await searchParams;
  const [projectsResult, invoicesResult] = await Promise.all([
    supabase
      .from("projects")
      .select("id, name")
      .eq("workspace_id", workspace.id)
      .order("name"),
    supabase
      .from("invoices")
      .select(
        "id, reference, amount, currency, status, due_at, paid_at, projects(name)",
      )
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: false }),
  ]);
  const projects = (projectsResult.data ?? []) as Pick<Project, "id" | "name">[];
  const invoices = (invoicesResult.data ?? []) as unknown as Invoice[];

  return (
    <div className="page">
      <PageHeader
        kicker="Money control"
        title="Cash"
        description="Orbit records invoices and payment state. It does not replace accounting, banking, tax advice, or your source documents."
      />
      <Notice error={params.error} notice={params.notice} />

      <details className="create-panel">
        <summary>Record invoice</summary>
        <form action={createInvoice}>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="invoice-reference">Reference</label>
              <input
                id="invoice-reference"
                name="reference"
                minLength={2}
                maxLength={80}
                required
                placeholder="INV-001"
              />
            </div>
            <div className="field">
              <label htmlFor="invoice-project">Project</label>
              <select id="invoice-project" name="projectId" defaultValue="">
                <option value="">No linked project</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="invoice-amount">Amount</label>
              <input
                id="invoice-amount"
                name="amount"
                type="number"
                min="0"
                step="0.01"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="invoice-currency">Currency</label>
              <select id="invoice-currency" name="currency" defaultValue="PKR">
                {["PKR", "USD", "GBP", "EUR", "AED", "SAR"].map((currency) => (
                  <option value={currency} key={currency}>
                    {currency}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="invoice-status">Status</label>
              <select id="invoice-status" name="status" defaultValue="draft">
                {["draft", "sent", "paid", "overdue", "void"].map((status) => (
                  <option value={status} key={status}>
                    {humanize(status)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="invoice-issued">Issued</label>
              <input id="invoice-issued" name="issuedAt" type="date" />
            </div>
            <div className="field">
              <label htmlFor="invoice-due">Due</label>
              <input id="invoice-due" name="dueAt" type="date" />
            </div>
            <div className="field field-wide">
              <label htmlFor="invoice-notes">Notes</label>
              <textarea id="invoice-notes" name="notes" maxLength={2000} />
            </div>
          </div>
          <div className="form-actions">
            <button className="button button-primary" type="submit">
              Record invoice
            </button>
          </div>
        </form>
      </details>

      <section className="panel">
        <div className="panel-head">
          <h2>Invoice ledger</h2>
          <span>{invoices.length} invoices</span>
        </div>
        {invoices.length ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Project</th>
                  <th>Amount</th>
                  <th>Due</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td>
                      <strong className="mono">{invoice.reference}</strong>
                    </td>
                    <td>{invoice.projects?.name ?? "Not linked"}</td>
                    <td>{formatMoney(Number(invoice.amount), invoice.currency)}</td>
                    <td>{formatDate(invoice.due_at)}</td>
                    <td>
                      <form className="inline-form" action={updateInvoiceStatus}>
                        <input type="hidden" name="id" value={invoice.id} />
                        <StatusPill value={invoice.status} />
                        <select
                          aria-label={`Update ${invoice.reference} status`}
                          name="status"
                          defaultValue={invoice.status}
                        >
                          {["draft", "sent", "paid", "overdue", "void"].map(
                            (status) => (
                              <option value={status} key={status}>
                                {humanize(status)}
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
            icon={Banknote}
            title="No cash records"
            description="Record the first real invoice. Quoted value and cash received remain deliberately separate."
          />
        )}
      </section>
    </div>
  );
}

