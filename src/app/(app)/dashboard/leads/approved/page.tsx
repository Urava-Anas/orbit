import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Search } from "lucide-react";
import { formatDate, humanize } from "@/lib/format";
import { requireWorkspace } from "@/lib/workspace";
import styles from "./approved-leads.module.css";

export const metadata: Metadata = {
  title: "Approved Leads",
  robots: { index: false, follow: false },
};

type PageProps = {
  searchParams: Promise<{
    q?: string;
    source?: string;
    stage?: string;
    sort?: string;
  }>;
};

type ApprovalMemory = {
  lead_id: string | null;
  decided_at: string | null;
};

type Lead = {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  contact_person: string | null;
  contact_role: string | null;
  source: string;
  stage: string;
  niche: string | null;
  lead_score: number | null;
  next_action: string | null;
  created_at: string;
};

type ApprovedLead = Lead & {
  approved_at: string | null;
};

function sourceLabel(source: string) {
  if (source === "local_search" || source === "google") return "Local Search";
  return humanize(source);
}

function initials(lead: Lead) {
  return (lead.company ?? lead.name)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "L";
}

export default async function ApprovedLeadsPage({ searchParams }: PageProps) {
  const { supabase, workspace } = await requireWorkspace();
  const params = await searchParams;

  const memoryResult = await supabase
    .from("lead_finder_place_memory")
    .select("lead_id,decided_at")
    .eq("workspace_id", workspace.id)
    .eq("decision", "approved")
    .not("lead_id", "is", null)
    .order("decided_at", { ascending: false })
    .limit(1000);

  const memories = (memoryResult.data ?? []) as ApprovalMemory[];
  const leadIds = Array.from(new Set(memories.flatMap((memory) => memory.lead_id ? [memory.lead_id] : [])));

  let leadRows: Lead[] = [];
  if (leadIds.length) {
    const leadResult = await supabase
      .from("leads")
      .select("id,name,company,email,phone,contact_person,contact_role,source,stage,niche,lead_score,next_action,created_at")
      .eq("workspace_id", workspace.id)
      .in("id", leadIds);
    leadRows = (leadResult.data ?? []) as Lead[];
  }

  const leadsById = new Map(leadRows.map((lead) => [lead.id, lead]));
  const allApproved: ApprovedLead[] = memories.flatMap((memory) => {
    if (!memory.lead_id) return [];
    const lead = leadsById.get(memory.lead_id);
    return lead ? [{ ...lead, approved_at: memory.decided_at }] : [];
  });

  const query = params.q?.trim().toLowerCase() ?? "";
  const source = params.source?.trim() ?? "";
  const stage = params.stage?.trim() ?? "";
  const sort = params.sort === "score" || params.sort === "name" ? params.sort : "newest";

  const sources = Array.from(new Set(allApproved.map((lead) => lead.source)))
    .sort((a, b) => sourceLabel(a).localeCompare(sourceLabel(b)));
  const stages = Array.from(new Set(allApproved.map((lead) => lead.stage)))
    .sort((a, b) => humanize(a).localeCompare(humanize(b)));

  const filtered = allApproved
    .filter((lead) => {
      if (source && lead.source !== source) return false;
      if (stage && lead.stage !== stage) return false;
      if (!query) return true;
      return [lead.company, lead.name, lead.contact_person, lead.email, lead.phone, lead.niche, lead.next_action]
        .some((value) => value?.toLowerCase().includes(query));
    })
    .sort((a, b) => {
      if (sort === "score") return (b.lead_score ?? -1) - (a.lead_score ?? -1);
      if (sort === "name") return (a.company ?? a.name).localeCompare(b.company ?? b.name);
      return new Date(b.approved_at ?? b.created_at).getTime() - new Date(a.approved_at ?? a.created_at).getTime();
    });

  const hasFilters = Boolean(query || source || stage || sort !== "newest");

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <Link className={styles.back} href="/dashboard/leads"><ArrowLeft size={14} aria-hidden="true" /> Lead Engine</Link>
          <h1>Approved Leads</h1>
          <p>Durable approval history resolved to canonical Orbit lead records.</p>
        </div>
        <span className={styles.count}>{allApproved.length.toLocaleString()} approved</span>
      </header>

      <section className={styles.panel}>
        <form className={styles.filters} action="/dashboard/leads/approved" method="get">
          <label className={styles.searchBox}>
            <Search size={14} aria-hidden="true" />
            <input name="q" type="search" defaultValue={params.q ?? ""} placeholder="Search approved leads…" aria-label="Search approved leads" />
          </label>
          <select name="source" defaultValue={source} aria-label="Filter approved leads by source">
            <option value="">All sources</option>
            {sources.map((item) => <option key={item} value={item}>{sourceLabel(item)}</option>)}
          </select>
          <select name="stage" defaultValue={stage} aria-label="Filter approved leads by stage">
            <option value="">All stages</option>
            {stages.map((item) => <option key={item} value={item}>{humanize(item)}</option>)}
          </select>
          <select name="sort" defaultValue={sort} aria-label="Sort approved leads">
            <option value="newest">Newest approved</option>
            <option value="score">Highest score</option>
            <option value="name">Name A–Z</option>
          </select>
          <button type="submit">Apply</button>
          {hasFilters ? <Link className={styles.reset} href="/dashboard/leads/approved">Reset</Link> : null}
        </form>

        <div className={styles.summary}>
          <span>Showing <strong>{filtered.length}</strong> of <strong>{allApproved.length}</strong></span>
          <span>Approval remains visible after finder results expire.</span>
        </div>

        {filtered.length ? (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>Lead</th><th>Source</th><th>Score</th><th>Contact</th><th>Approved</th><th>Stage</th><th>Next action</th><th /></tr></thead>
              <tbody>
                {filtered.map((lead) => {
                  const contactPrimary = lead.contact_person ?? lead.email ?? lead.phone ?? "No public contact";
                  const contactSecondary = lead.contact_person
                    ? (lead.contact_role ? humanize(lead.contact_role) : lead.email ?? lead.phone ?? "Public contact")
                    : lead.email && lead.phone ? lead.phone : "";
                  return (
                    <tr key={lead.id}>
                      <td>
                        <Link className={styles.identity} href={`/dashboard/leads/${lead.id}`}>
                          <span className={styles.avatar}>{initials(lead)}</span>
                          <span className={styles.identityText}><strong>{lead.company ?? lead.name}</strong><small>{lead.niche ?? "Niche not set"}</small></span>
                        </Link>
                      </td>
                      <td><span className={styles.source}>{sourceLabel(lead.source)}</span></td>
                      <td><span className={styles.score}>{lead.lead_score ?? "—"}</span></td>
                      <td><span className={styles.contact}><strong>{contactPrimary}</strong>{contactSecondary ? <small>{contactSecondary}</small> : null}</span></td>
                      <td><span className={styles.date}>{formatDate(lead.approved_at ?? lead.created_at)}</span></td>
                      <td><span className={styles.stage}>{humanize(lead.stage)}</span></td>
                      <td><strong className={styles.nextAction}>{lead.next_action ?? "Set next action"}</strong></td>
                      <td><Link className={styles.open} href={`/dashboard/leads/${lead.id}`}>Open <ArrowRight size={13} aria-hidden="true" /></Link></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className={styles.empty}>
            <strong>{allApproved.length ? "No approved leads match these filters." : "No approved leads yet."}</strong>
            <p>{allApproved.length ? "Reset filters to return to the full directory." : "Approved finder decisions will appear here as durable canonical lead records."}</p>
          </div>
        )}
      </section>
    </main>
  );
}
