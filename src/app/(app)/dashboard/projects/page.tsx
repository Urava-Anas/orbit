import type { Metadata } from "next";
import { FolderKanban } from "lucide-react";
import {
  createClient,
  createProject,
  updateProjectStatus,
} from "@/app/(app)/dashboard/actions";
import { EmptyState } from "@/components/EmptyState";
import { Notice } from "@/components/Notice";
import { PageHeader } from "@/components/PageHeader";
import { StatusPill } from "@/components/StatusPill";
import { formatDate, formatMoney, humanize } from "@/lib/format";
import type { Client, Lead, Project } from "@/lib/types";
import { requireWorkspace } from "@/lib/workspace";

export const metadata: Metadata = {
  title: "Projects",
  robots: { index: false, follow: false },
};

type PageProps = {
  searchParams: Promise<{ error?: string; notice?: string }>;
};

export default async function ProjectsPage({ searchParams }: PageProps) {
  const { supabase, workspace } = await requireWorkspace();
  const params = await searchParams;
  const [clientsResult, leadsResult, projectsResult] = await Promise.all([
    supabase
      .from("clients")
      .select("id, name, contact_name, email, phone")
      .eq("workspace_id", workspace.id)
      .order("name"),
    supabase
      .from("leads")
      .select("id, name, company")
      .eq("workspace_id", workspace.id)
      .order("name"),
    supabase
      .from("projects")
      .select(
        "id, client_id, name, summary, status, value, currency, due_date, created_at, clients(name)",
      )
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: false }),
  ]);
  const clients = (clientsResult.data ?? []) as Client[];
  const leads = (leadsResult.data ?? []) as Pick<Lead, "id" | "name" | "company">[];
  const projects = (projectsResult.data ?? []) as unknown as Project[];

  return (
    <div className="page">
      <PageHeader
        kicker="Delivery control"
        title="Clients & Projects"
        description="Define the client, scope, value, owner, due date, and status. Projects exist to create an accepted outcome—not activity."
      />
      <Notice error={params.error} notice={params.notice} />

      <details className="create-panel">
        <summary>Add client</summary>
        <form action={createClient}>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="client-name">Business name</label>
              <input id="client-name" name="name" minLength={2} maxLength={160} required />
            </div>
            <div className="field">
              <label htmlFor="contact-name">Contact name</label>
              <input id="contact-name" name="contactName" maxLength={120} />
            </div>
            <div className="field">
              <label htmlFor="client-email">Email</label>
              <input id="client-email" name="email" type="email" maxLength={254} />
            </div>
            <div className="field">
              <label htmlFor="client-phone">Phone or WhatsApp</label>
              <input id="client-phone" name="phone" type="tel" maxLength={40} />
            </div>
            <div className="field field-wide">
              <label htmlFor="client-website">Website</label>
              <input
                id="client-website"
                name="website"
                type="url"
                maxLength={500}
                placeholder="https://"
              />
            </div>
            <div className="field field-wide">
              <label htmlFor="client-notes">Notes</label>
              <textarea id="client-notes" name="notes" maxLength={4000} />
            </div>
          </div>
          <div className="form-actions">
            <button className="button button-primary" type="submit">
              Save client
            </button>
          </div>
        </form>
      </details>

      <details className="create-panel">
        <summary>Create project</summary>
        <form action={createProject}>
          {clients.length ? (
            <>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="project-client">Client</label>
                  <select id="project-client" name="clientId" required>
                    {clients.map((client) => (
                      <option key={client.id} value={client.id}>
                        {client.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="project-lead">Originating lead</label>
                  <select id="project-lead" name="leadId" defaultValue="">
                    <option value="">No linked lead</option>
                    {leads.map((lead) => (
                      <option key={lead.id} value={lead.id}>
                        {lead.name}
                        {lead.company ? ` · ${lead.company}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field field-wide">
                  <label htmlFor="project-name">Project name</label>
                  <input
                    id="project-name"
                    name="name"
                    minLength={2}
                    maxLength={180}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="project-status">Status</label>
                  <select id="project-status" name="status" defaultValue="planned">
                    {["planned", "in_progress", "review", "blocked", "completed"].map(
                      (status) => (
                        <option value={status} key={status}>
                          {humanize(status)}
                        </option>
                      ),
                    )}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="project-value">Value</label>
                  <input
                    id="project-value"
                    name="value"
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue="0"
                  />
                </div>
                <div className="field">
                  <label htmlFor="project-currency">Currency</label>
                  <select id="project-currency" name="currency" defaultValue="PKR">
                    {["PKR", "USD", "GBP", "EUR", "AED", "SAR"].map((currency) => (
                      <option value={currency} key={currency}>
                        {currency}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="project-start">Start date</label>
                  <input id="project-start" name="startDate" type="date" />
                </div>
                <div className="field">
                  <label htmlFor="project-due">Due date</label>
                  <input id="project-due" name="dueDate" type="date" />
                </div>
                <div className="field field-wide">
                  <label htmlFor="project-summary">Outcome and scope</label>
                  <textarea id="project-summary" name="summary" maxLength={4000} />
                </div>
              </div>
              <div className="form-actions">
                <button className="button button-primary" type="submit">
                  Create project
                </button>
              </div>
            </>
          ) : (
            <div className="notice">
              Add a client first. Orbit does not allow ownerless project records.
            </div>
          )}
        </form>
      </details>

      <section className="panel">
        <div className="panel-head">
          <h2>Delivery pipeline</h2>
          <span>{projects.length} projects</span>
        </div>
        {projects.length ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Client</th>
                  <th>Value</th>
                  <th>Due</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((project) => (
                  <tr key={project.id}>
                    <td>
                      <span className="table-primary">
                        <strong>{project.name}</strong>
                        <small>{project.summary ?? "No outcome summary"}</small>
                      </span>
                    </td>
                    <td>{project.clients?.name ?? "Unknown client"}</td>
                    <td>{formatMoney(Number(project.value), project.currency)}</td>
                    <td>{formatDate(project.due_date)}</td>
                    <td>
                      <form className="inline-form" action={updateProjectStatus}>
                        <input type="hidden" name="id" value={project.id} />
                        <StatusPill value={project.status} />
                        <select
                          aria-label={`Update ${project.name} status`}
                          name="status"
                          defaultValue={project.status}
                        >
                          {[
                            "planned",
                            "in_progress",
                            "review",
                            "blocked",
                            "completed",
                          ].map((status) => (
                            <option value={status} key={status}>
                              {humanize(status)}
                            </option>
                          ))}
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
            icon={FolderKanban}
            title="No projects yet"
            description="Create a client, then create the first delivery record with a real scope, value, and due date."
          />
        )}
      </section>
    </div>
  );
}
