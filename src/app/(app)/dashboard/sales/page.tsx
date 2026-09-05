import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Banknote,
  CheckCircle2,
  CircleDollarSign,
  FileText,
  FolderKanban,
  History,
  MoreHorizontal,
  PackageCheck,
  Plus,
  Receipt,
  Search,
  TriangleAlert,
  UploadCloud,
  UsersRound,
} from "lucide-react";
import { Notice } from "@/components/Notice";
import { formatMoney, formatRelativeDate, humanize } from "@/lib/format";
import { requireWorkspace } from "@/lib/workspace";
import { createSalesClient } from "./actions";
import extraStyles from "./SalesPageEnhancements.module.css";
import styles from "./sales.module.css";

export const metadata: Metadata = {
  title: "Sales Desk",
  robots: { index: false, follow: false },
};

type PageProps = {
  searchParams: Promise<{ error?: string; notice?: string; q?: string; view?: string }>;
};

type ClientRow = {
  id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  created_at: string;
};

type ProjectRow = {
  id: string;
  client_id: string;
  name: string;
  status: string;
  value: number;
  currency: string;
  due_date: string | null;
  created_at: string;
};

type InvoiceRow = {
  id: string;
  reference: string;
  amount: number;
  currency: string;
  status: string;
  due_at: string | null;
  paid_at: string | null;
  created_at: string;
  projects: { name: string; client_id: string } | null;
};

type WonLead = {
  id: string;
  stage: string;
  estimated_value: number;
  currency: string;
};

type CompanyEventRow = {
  id: number;
  event_type: string;
  entity_type: string | null;
  occurred_at: string;
};

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "C";
}

function projectStage(project?: ProjectRow) {
  if (!project) return "Onboarding";
  if (project.status === "planned") return "Onboarding";
  if (project.status === "in_progress") return "Active";
  if (project.status === "review") return "Review";
  if (project.status === "blocked") return "Blocked";
  if (project.status === "completed") return "Completed";
  return humanize(project.status);
}

function stageTone(stage: string) {
  if (["Active", "Completed", "Won"].includes(stage)) return "green";
  if (["Onboarding", "Review"].includes(stage)) return "purple";
  if (["Blocked", "Payment due"].includes(stage)) return "red";
  return "blue";
}

function sparkline(values: number[]) {
  const width = 220;
  const height = 78;
  if (!values.length) return `0,${height} ${width},${height}`;
  const max = Math.max(...values, 1);
  const step = values.length === 1 ? width : width / (values.length - 1);
  return values
    .map((value, index) => `${Math.round(index * step)},${Math.round(height - (value / max) * (height - 8))}`)
    .join(" ");
}

export default async function SalesDeskPage({ searchParams }: PageProps) {
  const { supabase, workspace } = await requireWorkspace();
  const params = await searchParams;
  const monthStart = new Date();
  monthStart.setHours(0, 0, 0, 0);
  monthStart.setDate(1);

  const [clientsResult, projectsResult, invoicesResult, wonResult, auditResult] = await Promise.all([
    supabase.from("clients").select("id,name,contact_name,email,phone,created_at").eq("workspace_id", workspace.id).order("created_at", { ascending: false }),
    supabase.from("projects").select("id,client_id,name,status,value,currency,due_date,created_at").eq("workspace_id", workspace.id).order("created_at", { ascending: false }),
    supabase.from("invoices").select("id,reference,amount,currency,status,due_at,paid_at,created_at,projects(name,client_id)").eq("workspace_id", workspace.id).order("created_at", { ascending: false }),
    supabase.from("leads").select("id,stage,estimated_value,currency").eq("workspace_id", workspace.id).eq("stage", "won"),
    supabase.from("company_events").select("id,event_type,entity_type,occurred_at").eq("workspace_id", workspace.id).order("occurred_at", { ascending: false }).limit(6),
  ]);

  const clients = (clientsResult.data ?? []) as ClientRow[];
  const projects = (projectsResult.data ?? []) as ProjectRow[];
  const invoices = (invoicesResult.data ?? []) as unknown as InvoiceRow[];
  const wonLeads = (wonResult.data ?? []) as WonLead[];
  const companyEvents = (auditResult.data ?? []) as CompanyEventRow[];

  const activeProjects = projects.filter((project) => project.status !== "completed");
  const pipelinePkr = activeProjects.filter((project) => project.currency === "PKR").reduce((sum, project) => sum + Number(project.value || 0), 0);
  const paidThisMonth = invoices.filter((invoice) => invoice.status === "paid" && invoice.currency === "PKR" && invoice.paid_at && new Date(invoice.paid_at).getTime() >= monthStart.getTime());
  const revenueThisMonth = paidThisMonth.reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0);
  const overdueInvoices = invoices.filter((invoice) => invoice.status === "overdue");
  const overduePkr = overdueInvoices.filter((invoice) => invoice.currency === "PKR").reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0);
  const totalPaidPkr = invoices.filter((invoice) => invoice.status === "paid" && invoice.currency === "PKR").reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0);

  const latestProjectByClient = new Map<string, ProjectRow>();
  for (const project of projects) {
    if (!latestProjectByClient.has(project.client_id)) latestProjectByClient.set(project.client_id, project);
  }
  const invoiceByClient = new Map<string, InvoiceRow[]>();
  for (const invoice of invoices) {
    const clientId = invoice.projects?.client_id;
    if (!clientId) continue;
    const list = invoiceByClient.get(clientId) ?? [];
    list.push(invoice);
    invoiceByClient.set(clientId, list);
  }

  const q = params.q?.trim().toLowerCase() ?? "";
  const view = params.view ?? "all";
  const clientRows = clients
    .map((client) => {
      const project = latestProjectByClient.get(client.id);
      const clientInvoices = invoiceByClient.get(client.id) ?? [];
      const overdue = clientInvoices.some((invoice) => invoice.status === "overdue");
      const stage = projectStage(project);
      const status = overdue
        ? "Payment due"
        : project?.status === "blocked"
          ? "Blocked"
          : stage === "Completed"
            ? "Completed"
            : stage === "Onboarding"
              ? "Onboarding"
              : "Active";
      const lastAt = clientInvoices[0]?.paid_at ?? clientInvoices[0]?.created_at ?? project?.created_at ?? client.created_at;
      return { client, project, stage, status, lastAt };
    })
    .filter((row) => {
      const haystack = [row.client.name, row.client.contact_name, row.client.email, row.project?.name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (q && !haystack.includes(q)) return false;
      if (view === "active" && row.status !== "Active") return false;
      if (view === "onboarding" && row.stage !== "Onboarding") return false;
      if (view === "completed" && row.stage !== "Completed") return false;
      return true;
    });

  const planned = projects.filter((project) => project.status === "planned");
  const inProgress = projects.filter((project) => project.status === "in_progress");
  const review = projects.filter((project) => project.status === "review");
  const completed = projects.filter((project) => project.status === "completed");
  const paymentDue = invoices.filter((invoice) => ["sent", "overdue"].includes(invoice.status));
  const wonValuePkr = wonLeads.filter((lead) => lead.currency === "PKR").reduce((sum, lead) => sum + Number(lead.estimated_value || 0), 0);
  const flowCards = [
    { label: "Won", count: wonLeads.length, value: wonValuePkr, icon: CheckCircle2, tone: "green" },
    { label: "Onboarding", count: planned.length, value: planned.filter((item) => item.currency === "PKR").reduce((sum, item) => sum + Number(item.value || 0), 0), icon: PackageCheck, tone: "purple" },
    { label: "Active", count: inProgress.length, value: inProgress.filter((item) => item.currency === "PKR").reduce((sum, item) => sum + Number(item.value || 0), 0), icon: FolderKanban, tone: "blue" },
    { label: "Review", count: review.length, value: review.filter((item) => item.currency === "PKR").reduce((sum, item) => sum + Number(item.value || 0), 0), icon: History, tone: "amber" },
    { label: "Payment Due", count: paymentDue.length, value: paymentDue.filter((item) => item.currency === "PKR").reduce((sum, item) => sum + Number(item.amount || 0), 0), icon: CircleDollarSign, tone: "red" },
    { label: "Completed", count: completed.length, value: completed.filter((item) => item.currency === "PKR").reduce((sum, item) => sum + Number(item.value || 0), 0), icon: CheckCircle2, tone: "green" },
  ];

  const cumulativeRevenue = [...paidThisMonth].reverse().reduce<number[]>((series, invoice) => {
    series.push((series.at(-1) ?? 0) + Number(invoice.amount || 0));
    return series;
  }, []);
  const linePoints = sparkline(cumulativeRevenue);

  const taskItems = [
    ...overdueInvoices.slice(0, 2).map((invoice) => ({
      title: `Collect ${invoice.reference}`,
      detail: formatMoney(Number(invoice.amount), invoice.currency),
      due: invoice.due_at ? formatRelativeDate(invoice.due_at) : "Overdue",
    })),
    ...activeProjects.filter((project) => project.due_date).slice(0, 2).map((project) => ({
      title: project.name,
      detail: project.status === "blocked" ? "Delivery blocked" : "Delivery follow-up",
      due: formatRelativeDate(project.due_date ?? project.created_at),
    })),
  ].slice(0, 4);

  return (
    <main className={styles.salesPage}>
      <header className={styles.pageHeader}>
        <div>
          <div className={styles.titleRow}><h1>Sales Desk</h1><span>v2</span></div>
          <p>Manage won leads and clients from onboarding through payment, completion and renewal.</p>
        </div>
        <div className={styles.headerActions}>
          <Link className={styles.secondaryButton} href="/dashboard/leads/sources/cold-list"><UploadCloud size={15} /> Import</Link>
          <a className={styles.primaryButton} href="#add-client"><Plus size={16} /> Add Client</a>
        </div>
      </header>

      <Notice error={params.error} notice={params.notice} />

      <div className={styles.salesGrid}>
        <div className={styles.mainColumn}>
          <section className={styles.metricsGrid} aria-label="Sales overview">
            <article><span className={`${styles.metricIcon} ${styles.purple}`}><UsersRound size={18} /></span><p>Total Clients<strong>{clients.length}</strong><small>Won relationships under management</small></p></article>
            <article><span className={`${styles.metricIcon} ${styles.blue}`}><FolderKanban size={18} /></span><p>Active Projects<strong>{activeProjects.length}</strong><small>{projects.length} total projects</small></p></article>
            <article><span className={`${styles.metricIcon} ${styles.green}`}><CircleDollarSign size={18} /></span><p>Active Client Value<strong>{formatMoney(pipelinePkr, "PKR")}</strong><small>Non-completed PKR delivery</small></p></article>
            <article><span className={`${styles.metricIcon} ${styles.purple}`}><Banknote size={18} /></span><p>Revenue This Month<strong>{formatMoney(revenueThisMonth, "PKR")}</strong><small>Paid PKR invoices this month</small></p></article>
            <article><span className={`${styles.metricIcon} ${styles.red}`}><TriangleAlert size={18} /></span><p>Overdue Invoices<strong>{overdueInvoices.length}</strong><small>{formatMoney(overduePkr, "PKR")}</small></p></article>
          </section>

          <section className={styles.pipelinePanel}>
            <div className={styles.panelHeading}><h2>Client lifecycle</h2><Link href="/dashboard/projects">View delivery <ArrowRight size={13} /></Link></div>
            <div className={styles.pipelineTrack}>
              {flowCards.map(({ label, count, value, icon: Icon, tone }, index) => (
                <article key={label}>
                  <div className={styles.pipelineTop}><span className={`${styles.pipelineIcon} ${styles[tone]}`}><Icon size={17} /></span>{index < flowCards.length - 1 ? <i /> : null}</div>
                  <span>{label}</span><strong>{count}</strong><small>{formatMoney(value, "PKR")}</small>
                </article>
              ))}
            </div>
          </section>

          <section className={styles.clientPanel}>
            <nav className={styles.tabs} aria-label="Client views">
              <Link className={view === "all" ? styles.activeTab : ""} href="/dashboard/sales?view=all" aria-current={view === "all" ? "page" : undefined}>All Clients</Link>
              <Link className={view === "active" ? styles.activeTab : ""} href="/dashboard/sales?view=active" aria-current={view === "active" ? "page" : undefined}>Active</Link>
              <Link className={view === "onboarding" ? styles.activeTab : ""} href="/dashboard/sales?view=onboarding" aria-current={view === "onboarding" ? "page" : undefined}>Onboarding</Link>
              <Link className={view === "completed" ? styles.activeTab : ""} href="/dashboard/sales?view=completed" aria-current={view === "completed" ? "page" : undefined}>Completed</Link>
            </nav>
            <form className={`${styles.filterBar} ${extraStyles.searchBar}`} action="/dashboard/sales" method="get">
              <input type="hidden" name="view" value={view} />
              <label className={styles.searchBox}><Search size={15} /><input name="q" defaultValue={params.q ?? ""} placeholder="Search clients, contacts or projects..." /></label>
              <button type="submit"><Search size={14} /> Search</button>
            </form>
            <div className={styles.tableWrap}>
              <table className={styles.clientTable}>
                <thead><tr><th>Client</th><th>Stage</th><th>Project / Service</th><th>Owner</th><th>Value</th><th>Status</th><th>Last Activity</th><th /></tr></thead>
                <tbody>
                  {clientRows.slice(0, 12).map(({ client, project, stage, status, lastAt }) => (
                    <tr key={client.id}>
                      <td>
                        <Link className={extraStyles.clientName} href={`/dashboard/sales/${client.id}`}>
                          <div className={styles.clientIdentity}><span>{initials(client.name)}</span><div><strong>{client.name}</strong><small>{client.contact_name ?? client.email ?? "Client record"}</small></div></div>
                        </Link>
                      </td>
                      <td><span className={`${styles.stagePill} ${styles[`stage_${stageTone(stage)}`]}`}>{stage}</span></td>
                      <td>{project?.name ?? "Onboarding / scope"}</td>
                      <td><span className={styles.ownerAvatar}>U</span> Urava Team</td>
                      <td>{project ? formatMoney(Number(project.value), project.currency) : "—"}</td>
                      <td><span className={`${styles.statusPill} ${styles[`stage_${stageTone(status)}`]}`}>{status}</span></td>
                      <td>{formatRelativeDate(lastAt)}</td>
                      <td><Link className={styles.moreButton} href={`/dashboard/sales/${client.id}`} aria-label={`Open ${client.name}`}><MoreHorizontal size={16} /></Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!clientRows.length ? <div className={styles.emptyState}>No clients match this view. Won deals should become client records here.</div> : null}
            </div>
            <footer className={styles.tableFooter}><span>Showing {Math.min(clientRows.length, 12)} of {clients.length} clients</span><span>Won leads hand off here — pre-Won work stays in Lead Engine.</span></footer>
          </section>
        </div>

        <aside className={styles.sideColumn}>
          <section className={styles.sideCard}>
            <div className={styles.sideHeading}><h2>Revenue overview</h2><span>This Month</span></div>
            <p className={styles.revenueLabel}>Total Revenue</p>
            <strong className={styles.revenueValue}>{formatMoney(revenueThisMonth, "PKR")}</strong>
            <small className={styles.revenueSub}>{formatMoney(totalPaidPkr, "PKR")} collected lifetime</small>
            <div className={styles.chartWrap}>
              <svg viewBox="0 0 220 86" role="img" aria-label="Revenue trend"><path className={styles.gridLine} d="M0 20H220M0 50H220M0 80H220" /><polyline className={styles.revenueLine} points={linePoints} /></svg>
            </div>
          </section>

          <section className={styles.sideCard}>
            <div className={styles.sideHeading}><h2>Tasks & follow-ups</h2><Link href="/dashboard">View all</Link></div>
            <div className={styles.taskList}>
              {taskItems.length ? taskItems.map((task) => <div key={`${task.title}-${task.due}`}><span /><p><strong>{task.title}</strong><small>{task.detail}</small></p><time>{task.due}</time></div>) : <div className={styles.emptyMini}>No client follow-ups need attention.</div>}
            </div>
          </section>

          <section className={styles.sideCard}>
            <div className={styles.sideHeading}><h2>Recent activity</h2><Link href="/dashboard">View all</Link></div>
            <div className={styles.activityList}>
              {companyEvents.length ? companyEvents.map((event) => <div key={event.id}><span className={styles.activityDot} /><p><strong>{humanize(event.event_type)}</strong><small>{event.entity_type ? humanize(event.entity_type) : "Organisation workflow"} event</small></p><time>{formatRelativeDate(event.occurred_at)}</time></div>) : <div className={styles.emptyMini}>No recent company workflow events.</div>}
            </div>
          </section>

          <section className={styles.sideCard}>
            <h2>Quick actions</h2>
            <div className={styles.quickActions}>
              <Link href="/dashboard/projects#create-project"><FileText size={17} /><span>New Project</span></Link>
              <Link href="/dashboard/cash#record-invoice"><Receipt size={17} /><span>Create Invoice</span></Link>
              <Link href="/dashboard/cash"><Banknote size={17} /><span>Review Payments</span></Link>
              <Link href="#add-client"><Plus size={17} /><span>Add Client</span></Link>
            </div>
          </section>
        </aside>
      </div>

      <section className={styles.addPanel} id="add-client" aria-label="Add client">
        <div className={styles.addPanelCard}>
          <div className={styles.addPanelHeader}><div><h2>Add client</h2><p>Create the client record that exists after a deal is won.</p></div><Link href="/dashboard/sales">×</Link></div>
          <form action={createSalesClient} className={styles.addForm}>
            <label><span>Business name</span><input name="name" minLength={2} required /></label>
            <label><span>Contact name</span><input name="contactName" /></label>
            <label><span>Email</span><input name="email" type="email" /></label>
            <label><span>Phone / WhatsApp</span><input name="phone" type="tel" /></label>
            <label className={styles.wideField}><span>Website</span><input name="website" type="url" placeholder="https://" /></label>
            <label className={styles.wideField}><span>Client notes</span><textarea name="notes" /></label>
            <div className={styles.formActions}><Link href="/dashboard/sales">Cancel</Link><button type="submit">Save client</button></div>
          </form>
        </div>
      </section>
    </main>
  );
}
