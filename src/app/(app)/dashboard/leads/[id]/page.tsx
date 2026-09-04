import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  Globe2,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
} from "lucide-react";
import { formatDate, formatMoney, humanize } from "@/lib/format";
import type { Lead } from "@/lib/types";
import { requireWorkspace } from "@/lib/workspace";
import styles from "./lead-detail.module.css";

export const metadata: Metadata = {
  title: "Lead Details — Lead Engine",
  robots: { index: false, follow: false },
};

type PageProps = {
  params: Promise<{ id: string }>;
};

function initials(lead: Lead) {
  return (lead.company ?? lead.name)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "L";
}

function safeHttpUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function whatsappUrl(value: string | null) {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  return digits.length >= 7 ? `https://wa.me/${digits}` : null;
}

export default async function LeadDetailPage({ params }: PageProps) {
  const { id } = await params;
  const { supabase, workspace } = await requireWorkspace();
  const { data, error } = await supabase
    .from("leads")
    .select("id,name,company,email,phone,whatsapp,contact_person,contact_role,website_url,enrichment_status,enrichment_confidence,enrichment_source,enriched_at,source,stage,niche,lead_score,estimated_value,currency,pain_point,next_action,next_action_at,google_maps_url,notes,legacy_notion_url,imported_at,created_at")
    .eq("workspace_id", workspace.id)
    .eq("id", id)
    .maybeSingle();

  if (error || !data) notFound();
  const lead = data as Lead;
  const website = safeHttpUrl(lead.website_url);
  const mapUrl = safeHttpUrl(lead.google_maps_url);
  const whatsapp = whatsappUrl(lead.whatsapp ?? lead.phone);
  const contactPrimary = lead.contact_person ?? "Decision maker not verified";
  const contactSecondary = lead.contact_role ? humanize(lead.contact_role) : "Public business contact";

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <Link className={styles.back} href="/dashboard/leads#approved-leads">
            <ArrowLeft size={14} aria-hidden="true" /> Approved Leads
          </Link>
          <h1>{lead.company ?? lead.name}</h1>
          <p>{lead.niche ?? "Niche not set"} · {humanize(lead.source)}</p>
        </div>
        <div className={styles.headerBadges}>
          <span className={styles.badge}>{humanize(lead.stage)}</span>
          <span className={styles.score}>Score {lead.lead_score ?? "—"}</span>
        </div>
      </header>

      <div className={styles.grid}>
        <div className={styles.column}>
          <section className={styles.card} aria-labelledby="lead-contact-title">
            <h2 id="lead-contact-title">Lead & contact</h2>
            <div className={styles.cardLead}>
              <span className={styles.avatar}>{initials(lead)}</span>
              <div>
                <strong>{contactPrimary}</strong>
                <small>{contactSecondary}</small>
              </div>
            </div>
            <div className={styles.facts}>
              <div className={styles.fact}><span>Phone</span>{lead.phone ? <a href={`tel:${lead.phone}`}>{lead.phone}</a> : <strong className={styles.muted}>Not found</strong>}</div>
              <div className={styles.fact}><span>Email</span>{lead.email ? <a href={`mailto:${lead.email}`}>{lead.email}</a> : <strong className={styles.muted}>Not found</strong>}</div>
              <div className={styles.fact}><span>Website</span>{website ? <a href={website} target="_blank" rel="noreferrer">Open website</a> : <strong className={styles.muted}>Not found</strong>}</div>
              <div className={styles.fact}><span>WhatsApp</span>{whatsapp ? <a href={whatsapp} target="_blank" rel="noreferrer">Open WhatsApp</a> : <strong className={styles.muted}>Not found</strong>}</div>
            </div>
            <div className={styles.sourceLinks}>
              {lead.phone ? <a href={`tel:${lead.phone}`}><Phone size={13} /> Call</a> : null}
              {lead.email ? <a href={`mailto:${lead.email}`}><Mail size={13} /> Email</a> : null}
              {whatsapp ? <a href={whatsapp} target="_blank" rel="noreferrer"><MessageCircle size={13} /> WhatsApp</a> : null}
              {website ? <a href={website} target="_blank" rel="noreferrer"><Globe2 size={13} /> Website <ExternalLink size={11} /></a> : null}
              {mapUrl ? <a href={mapUrl} target="_blank" rel="noreferrer"><MapPin size={13} /> Map <ExternalLink size={11} /></a> : null}
            </div>
          </section>

          <section className={styles.card} aria-labelledby="lead-opportunity-title">
            <h2 id="lead-opportunity-title">Opportunity</h2>
            <p className={styles.sectionCopy}>{lead.pain_point ?? "No opportunity note has been recorded yet."}</p>
            <div className={styles.nextAction}>
              <span>Next action</span>
              <strong>{lead.next_action ?? "Set the next approved action for this lead."}</strong>
            </div>
          </section>

          <section className={styles.card} aria-labelledby="lead-notes-title">
            <h2 id="lead-notes-title">Lead notes</h2>
            <div className={styles.notes}>{lead.notes ?? "No notes have been added yet."}</div>
          </section>
        </div>

        <aside className={styles.column}>
          <section className={styles.card} aria-labelledby="lead-value-title">
            <h2 id="lead-value-title">Commercial snapshot</h2>
            <div className={styles.metaList}>
              <div className={styles.metaRow}><span>Estimated value</span><strong className={styles.value}>{formatMoney(lead.estimated_value, lead.currency)}</strong></div>
              <div className={styles.metaRow}><span>Lead score</span><strong>{lead.lead_score ?? "Not scored"}</strong></div>
              <div className={styles.metaRow}><span>Stage</span><strong>{humanize(lead.stage)}</strong></div>
              <div className={styles.metaRow}><span>Next action due</span><strong>{lead.next_action_at ? formatDate(lead.next_action_at) : "Not scheduled"}</strong></div>
            </div>
          </section>

          <section className={styles.card} aria-labelledby="lead-source-title">
            <h2 id="lead-source-title">Source & verification</h2>
            <div className={styles.metaList}>
              <div className={styles.metaRow}><span>Source</span><strong>{humanize(lead.source)}</strong></div>
              <div className={styles.metaRow}><span>Enrichment</span><strong>{lead.enrichment_status ? humanize(lead.enrichment_status) : "Not enriched"}</strong></div>
              <div className={styles.metaRow}><span>Confidence</span><strong>{lead.enrichment_confidence === null ? "Not set" : `${Math.round(lead.enrichment_confidence)}%`}</strong></div>
              <div className={styles.metaRow}><span>Provider</span><strong>{lead.enrichment_source ? humanize(lead.enrichment_source) : "Not set"}</strong></div>
              <div className={styles.metaRow}><span>Added</span><strong>{formatDate(lead.created_at)}</strong></div>
            </div>
          </section>

          <section className={styles.card} aria-labelledby="lead-actions-title">
            <h2 id="lead-actions-title">Continue workflow</h2>
            <div className={styles.actions}>
              <Link className={styles.action} href="/dashboard/leads/send-packs">Create Send Pack <ArrowRight size={14} /></Link>
              <Link className={styles.action} href="/dashboard/sales">Open Sales Desk <ArrowRight size={14} /></Link>
              <Link className={styles.action} href={`/dashboard/leads/sources/${lead.source === "local_search" ? "google" : lead.source}`}>Open source workspace <ArrowRight size={14} /></Link>
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}
