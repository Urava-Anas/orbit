import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ExternalLink,
  FileText,
  Globe2,
  Mail,
  Phone,
  Receipt,
  StickyNote,
  UserRound,
} from "lucide-react";
import { formatDate, formatMoney, humanize } from "@/lib/format";
import { requireWorkspace } from "@/lib/workspace";
import styles from "./client-detail.module.css";

export const metadata: Metadata = {
  title: "Client Details",
  robots: { index: false, follow: false },
};

type Props = { params: Promise<{ id: string }> };

type ClientRecord = {
  id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  notes: string | null;
  created_at: string;
};

type ProjectRecord = {
  id: string;
  name: string;
  summary: string | null;
  status: string;
  value: number;
  currency: string;
  due_date: string | null;
  created_at: string;
};

type InvoiceRecord = {
  id: string;
  reference: string;
  project_id: string | null;
  amount: number;
  currency: string;
  status: string;
  due_at: string | null;
  paid_at: string | null;
  created_at: string;
};

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "C";
}

export default async function ClientDetailsPage({ params }: Props) {
  const { id } = await params;
  const { supabase, workspace } = await requireWorkspace();
  const [{ data: clientData }, { data: projectData }] = await Promise.all([
    supabase
      .from("clients")
      .select("id,name,contact_name,email,phone,website,notes,created_at")
      .eq("workspace_id", workspace.id)
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("projects")
      .select("id,name,summary,status,value,currency,due_date,created_at")
      .eq("workspace_id", workspace.id)
      .eq("client_id", id)
      .order("created_at", { ascending: false }),
  ]);

  const client = clientData as ClientRecord | null;
  if (!client) notFound();
  const projects = (projectData ?? []) as ProjectRecord[];
  const projectIds = projects.map((project) => project.id);
  const invoiceResult = projectIds.length
    ? await supabase
        .from("invoices")
        .select("id,reference,project_id,amount,currency,status,due_at,paid_at,created_at")
        .eq("workspace_id", workspace.id)
        .in("project_id", projectIds)
        .order("created_at", { ascending: false })
    : { data: [] };
  const invoices = (invoiceResult.data ?? []) as InvoiceRecord[];

  const activeProjects = projects.filter((project) => project.status !== "completed");
  const paidPkr = invoices
    .filter((invoice) => invoice.status === "paid" && invoice.currency === "PKR")
    .reduce((sum, invoice) => sum + Number(invoice.amount), 0);
  const outstanding = invoices.filter((invoice) => ["sent", "overdue"].includes(invoice.status));
  const activeValuePkr = activeProjects
    .filter((project) => project.currency === "PKR")
    .reduce((sum, project) => sum + Number(project.value), 0);

  return (
    <div className={`page ${styles.page}`}>
      <Link className={`button button-quiet ${styles.back}`} href="/dashboard/sales">
        <ArrowLeft size={15} /> Back to Sales Desk
      </Link>

      <section className={styles.hero}>
        <div className={styles.identity}>
          <span className={styles.avatar}>{initials(client.name)}</span>
          <div>
            <span className={styles.eyebrow}>Client record</span>
            <h1>{client.name}</h1>
            <p>{client.contact_name ?? client.email ?? "Active client relationship"} · added {formatDate(client.created_at)}</p>
          </div>
        </div>
        <div className={styles.actions}>
          {client.phone ? <a className="button" href={`tel:${client.phone}`}><Phone size={14} /> Call</a> : null}
          {client.email ? <a className="button" href={`mailto:${client.email}`}><Mail size={14} /> Email</a> : null}
          {client.website ? <a className="button" href={client.website} target="_blank" rel="noreferrer"><Globe2 size={14} /> Website</a> : null}
          <Link className="button button-primary" href="/dashboard/projects#create-project"><FileText size={14} /> New project</Link>
        </div>
      </section>

      <section className={styles.metrics} aria-label="Client overview">
        <article className={styles.metric}><span>Active projects</span><strong>{activeProjects.length}</strong></article>
        <article className={styles.metric}><span>Active PKR value</span><strong>{formatMoney(activeValuePkr, "PKR")}</strong></article>
        <article className={styles.metric}><span>Collected PKR</span><strong>{formatMoney(paidPkr, "PKR")}</strong></article>
        <article className={styles.metric}><span>Payment attention</span><strong>{outstanding.length}</strong></article>
      </section>

      <section className={styles.grid}>
        <article className={`panel ${styles.card}`}>
          <div className={styles.cardHead}><div><span className={styles.cardIcon}><UserRound size={16} /></span><h2>Contact</h2></div></div>
          <dl className={styles.definition}>
            <div><dt>Contact</dt><dd>{client.contact_name ?? "Not set"}</dd></div>
            <div><dt>Email</dt><dd>{client.email ?? "Not set"}</dd></div>
            <div><dt>Phone</dt><dd>{client.phone ?? "Not set"}</dd></div>
            <div><dt>Website</dt><dd>{client.website ?? "Not set"}</dd></div>
          </dl>
        </article>

        <article className={`panel ${styles.card}`}>
          <div className={styles.cardHead}>
            <div><span className={styles.cardIcon}><FileText size={16} /></span><h2>Delivery</h2></div>
            <small>{projects.length} projects</small>
          </div>
          {projects.length ? <div className={styles.list}>{projects.slice(0, 6).map((project) => (
            <div className={styles.row} key={project.id}>
              <div><strong>{project.name}</strong><small>{humanize(project.status)}{project.due_date ? ` · due ${formatDate(project.due_date)}` : ""}</small></div>
              <div className={styles.rowMeta}><strong>{formatMoney(Number(project.value), project.currency)}</strong><small>{project.summary ?? "No scope summary"}</small></div>
            </div>
          ))}</div> : <div className={styles.empty}>No delivery project exists for this client yet.</div>}
        </article>

        <article className={`panel ${styles.card} ${styles.cardWide}`}>
          <div className={styles.cardHead}>
            <div><span className={styles.cardIcon}><Receipt size={16} /></span><h2>Invoices & payments</h2></div>
            <Link className="button button-quiet" href="/dashboard/cash#record-invoice">Record invoice</Link>
          </div>
          {invoices.length ? <div className={styles.list}>{invoices.slice(0, 8).map((invoice) => (
            <div className={styles.row} key={invoice.id}>
              <div><strong>{invoice.reference}</strong><small>{humanize(invoice.status)}{invoice.due_at ? ` · due ${formatDate(invoice.due_at)}` : ""}</small></div>
              <div className={styles.rowMeta}><strong>{formatMoney(Number(invoice.amount), invoice.currency)}</strong><small>{invoice.paid_at ? `Paid ${formatDate(invoice.paid_at)}` : "Not marked paid"}</small></div>
            </div>
          ))}</div> : <div className={styles.empty}>No invoices are attached to this client’s projects.</div>}
        </article>

        <article className={`panel ${styles.card} ${styles.cardWide}`}>
          <div className={styles.cardHead}><div><span className={styles.cardIcon}><StickyNote size={16} /></span><h2>Client notes</h2></div></div>
          <p className={styles.notes}>{client.notes ?? "No client notes have been added."}</p>
          {client.website ? <div className={styles.actions}><a className="button" href={client.website} target="_blank" rel="noreferrer">Open website <ExternalLink size={12} /></a></div> : null}
        </article>
      </section>
    </div>
  );
}
