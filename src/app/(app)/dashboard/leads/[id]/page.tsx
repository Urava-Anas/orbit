import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CalendarClock,
  ExternalLink,
  Globe2,
  Mail,
  MapPin,
  MessageSquareText,
  Phone,
  ShieldCheck,
  Target,
  UserRound,
} from "lucide-react";
import { formatMoney, formatRelativeDate, humanize } from "@/lib/format";
import type { Lead } from "@/lib/types";
import { requireWorkspace } from "@/lib/workspace";
import styles from "./lead-detail.module.css";

export const metadata: Metadata = {
  title: "Lead Details",
  robots: { index: false, follow: false },
};

type Props = {
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

function confidenceLabel(value: number | null) {
  if (value === null) return "Not measured";
  if (value >= 0.85) return `${Math.round(value * 100)}% · high confidence`;
  if (value >= 0.6) return `${Math.round(value * 100)}% · moderate confidence`;
  return `${Math.round(value * 100)}% · needs verification`;
}

export default async function LeadDetailsPage({ params }: Props) {
  const { id } = await params;
  const { supabase, workspace } = await requireWorkspace();
  const { data } = await supabase
    .from("leads")
    .select("id,name,company,email,phone,whatsapp,contact_person,contact_role,website_url,enrichment_status,enrichment_confidence,enrichment_source,enriched_at,source,stage,niche,lead_score,estimated_value,currency,pain_point,next_action,next_action_at,google_maps_url,notes,legacy_notion_url,imported_at,created_at")
    .eq("workspace_id", workspace.id)
    .eq("id", id)
    .maybeSingle();

  const lead = data as Lead | null;
  if (!lead) notFound();

  const businessName = lead.company ?? lead.name;
  const primaryContact = lead.contact_person ?? lead.name;

  return (
    <div className={`page ${styles.page}`}>
      <Link className={`button button-quiet ${styles.back}`} href="/dashboard/leads">
        <ArrowLeft size={15} /> Back to Lead Engine
      </Link>

      <section className={styles.hero}>
        <div className={styles.identity}>
          <span className={styles.avatar}>{initials(lead)}</span>
          <div>
            <span className={styles.eyebrow}>Lead record · {humanize(lead.source)}</span>
            <h1>{businessName}</h1>
            <p>
              {lead.niche ?? "Niche not set"} · {humanize(lead.stage)}
              {primaryContact && primaryContact !== businessName ? ` · ${primaryContact}` : ""}
            </p>
          </div>
        </div>
        <div className={styles.actions}>
          {lead.phone ? <a className="button" href={`tel:${lead.phone}`}><Phone size={14} /> Call</a> : null}
          {lead.email ? <a className="button" href={`mailto:${lead.email}`}><Mail size={14} /> Email</a> : null}
          {lead.website_url ? <a className="button" href={lead.website_url} target="_blank" rel="noreferrer"><Globe2 size={14} /> Website</a> : null}
          {lead.google_maps_url ? <a className="button button-primary" href={lead.google_maps_url} target="_blank" rel="noreferrer"><MapPin size={14} /> Open map</a> : null}
        </div>
      </section>

      <section className={styles.metrics} aria-label="Lead overview">
        <article className={styles.metric}>
          <span>Lead score</span>
          <strong>{lead.lead_score ?? "—"}{lead.lead_score !== null ? "/100" : ""}</strong>
        </article>
        <article className={styles.metric}>
          <span>Estimated value</span>
          <strong>{formatMoney(Number(lead.estimated_value), lead.currency)}</strong>
        </article>
        <article className={styles.metric}>
          <span>Stage</span>
          <strong>{humanize(lead.stage)}</strong>
        </article>
        <article className={styles.metric}>
          <span>Added</span>
          <strong>{formatRelativeDate(lead.created_at)}</strong>
        </article>
      </section>

      <section className={styles.grid}>
        <article className={`panel ${styles.card}`}>
          <div className={styles.cardHead}>
            <span><UserRound size={16} /></span>
            <h2>Contact</h2>
          </div>
          <dl className={styles.definition}>
            <div><dt>Contact</dt><dd>{primaryContact || "Not verified"}</dd></div>
            <div><dt>Role</dt><dd>{lead.contact_role ? humanize(lead.contact_role) : "Not verified"}</dd></div>
            <div><dt>Phone</dt><dd>{lead.phone ?? "Not found"}</dd></div>
            <div><dt>WhatsApp</dt><dd>{lead.whatsapp ?? "Not found"}</dd></div>
            <div><dt>Email</dt><dd>{lead.email ?? "Not found"}</dd></div>
            <div><dt>Website</dt><dd>{lead.website_url ?? "Not found"}</dd></div>
          </dl>
        </article>

        <article className={`panel ${styles.card}`}>
          <div className={styles.cardHead}>
            <span><Target size={16} /></span>
            <h2>Opportunity</h2>
          </div>
          <dl className={styles.definition}>
            <div><dt>Source</dt><dd>{humanize(lead.source)}</dd></div>
            <div><dt>Niche</dt><dd>{lead.niche ?? "Not set"}</dd></div>
            <div><dt>Stage</dt><dd>{humanize(lead.stage)}</dd></div>
            <div><dt>Score</dt><dd>{lead.lead_score ?? "Not scored"}</dd></div>
            <div><dt>Value</dt><dd>{formatMoney(Number(lead.estimated_value), lead.currency)}</dd></div>
          </dl>
          {lead.pain_point ? <p className={styles.prose}>{lead.pain_point}</p> : null}
        </article>

        <article className={`panel ${styles.card}`}>
          <div className={styles.cardHead}>
            <span><CalendarClock size={16} /></span>
            <h2>Next action</h2>
          </div>
          {lead.next_action ? (
            <div className={styles.nextAction}>
              <strong>{lead.next_action}</strong>
              <span>{lead.next_action_at ? formatRelativeDate(lead.next_action_at) : "No follow-up time set"}</span>
            </div>
          ) : (
            <p className={styles.prose}>No next action has been assigned yet.</p>
          )}
        </article>

        <article className={`panel ${styles.card}`}>
          <div className={styles.cardHead}>
            <span><ShieldCheck size={16} /></span>
            <h2>Data confidence</h2>
          </div>
          <dl className={styles.definition}>
            <div><dt>Enrichment</dt><dd>{lead.enrichment_status ? humanize(lead.enrichment_status) : "Not enriched"}</dd></div>
            <div><dt>Confidence</dt><dd>{confidenceLabel(lead.enrichment_confidence)}</dd></div>
            <div><dt>Source</dt><dd>{lead.enrichment_source ? humanize(lead.enrichment_source) : "Not recorded"}</dd></div>
            <div><dt>Updated</dt><dd>{lead.enriched_at ? formatRelativeDate(lead.enriched_at) : "—"}</dd></div>
          </dl>
        </article>

        <article className={`panel ${styles.card} ${styles.cardWide}`}>
          <div className={styles.cardHead}>
            <span><MessageSquareText size={16} /></span>
            <h2>Notes & source links</h2>
          </div>
          <p className={styles.prose}>{lead.notes ?? "No notes have been added to this lead."}</p>
          <div className={styles.actions}>
            {lead.google_maps_url ? <a className="button" href={lead.google_maps_url} target="_blank" rel="noreferrer"><MapPin size={14} /> Google Maps <ExternalLink size={12} /></a> : null}
            {lead.legacy_notion_url ? <a className="button" href={lead.legacy_notion_url} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Legacy source</a> : null}
          </div>
        </article>
      </section>
    </div>
  );
}
