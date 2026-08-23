import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Building2, Clock3, Inbox, Mail, Phone, Route, Truck, UsersRound } from "lucide-react";
import { redirect } from "next/navigation";
import { humanize } from "@/lib/format";
import { requireWorkspace } from "@/lib/workspace";
import { getWorkspaceProfile } from "@/lib/workspace-profile";
import styles from "./forms.module.css";

export const metadata: Metadata = {
  title: "Online Forms — Apex Carrier Pipeline",
  robots: { index: false, follow: false },
};

type Submission = {
  id: string;
  form_type: string;
  source: string;
  full_name: string;
  phone: string;
  email: string;
  company: string | null;
  equipment: string;
  fleet_size: string;
  preferred_lanes: string | null;
  message: string | null;
  status: string;
  created_at: string;
};

function ageLabel(value: string) {
  const created = new Date(value).getTime();
  const diffMinutes = Math.max(0, Math.floor((Date.now() - created) / 60000));
  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const hours = Math.floor(diffMinutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default async function OnlineFormsPage() {
  const { supabase, workspace } = await requireWorkspace();
  const profile = getWorkspaceProfile(workspace);
  if (profile.experience !== "apex") redirect("/dashboard/leads");

  const { data, error } = await supabase
    .from("apex_online_form_submissions")
    .select("id,form_type,source,full_name,phone,email,company,equipment,fleet_size,preferred_lanes,message,status,created_at")
    .eq("workspace_id", workspace.id)
    .order("created_at", { ascending: false })
    .limit(200);

  const submissions = (data ?? []) as Submission[];
  const newCount = submissions.filter((item) => item.status === "new").length;
  const contactedCount = submissions.filter((item) => item.status === "contacted").length;
  const qualifiedCount = submissions.filter((item) => item.status === "qualified").length;
  const today = new Date().toISOString().slice(0, 10);
  const todayCount = submissions.filter((item) => item.created_at.slice(0, 10) === today).length;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <Link href="/dashboard/leads" className={styles.back}><ArrowLeft size={14} /> Carrier Pipeline</Link>
          <p className={styles.kicker}>Apex website intake</p>
          <h1>Online Forms</h1>
          <p className={styles.subtitle}>Every website trial request lands here as an operational record, ready for the Apex team to follow up.</p>
        </div>
        <div className={styles.liveBadge}><span /> Live capture</div>
      </header>

      {error ? <div className={styles.error}>Orbit could not load form submissions right now.</div> : null}

      <section className={styles.stats} aria-label="Online form summary">
        <article><Inbox size={18} /><div><span>New</span><strong>{newCount}</strong><small>Awaiting first touch</small></div></article>
        <article><Clock3 size={18} /><div><span>Today</span><strong>{todayCount}</strong><small>New website requests</small></div></article>
        <article><Phone size={18} /><div><span>Contacted</span><strong>{contactedCount}</strong><small>Follow-up started</small></div></article>
        <article><UsersRound size={18} /><div><span>Qualified</span><strong>{qualifiedCount}</strong><small>Ready for onboarding</small></div></article>
      </section>

      <section className={styles.inbox}>
        <div className={styles.inboxHeader}>
          <div>
            <h2>Website submissions</h2>
            <p>{submissions.length} captured record{submissions.length === 1 ? "" : "s"}</p>
          </div>
          <span>Newest first</span>
        </div>

        {submissions.length ? (
          <div className={styles.list}>
            {submissions.map((item) => (
              <details className={styles.row} key={item.id}>
                <summary>
                  <div className={styles.identity}>
                    <span className={styles.avatar}>{item.full_name.slice(0, 1).toUpperCase()}</span>
                    <div><strong>{item.full_name}</strong><small>{item.company || "Independent carrier"}</small></div>
                  </div>
                  <div className={styles.equipment}><Truck size={15} /><span>{item.equipment}</span><small>{item.fleet_size}</small></div>
                  <span className={`${styles.status} ${styles[`status_${item.status}`] ?? ""}`}>{humanize(item.status)}</span>
                  <time>{ageLabel(item.created_at)}</time>
                </summary>

                <div className={styles.details}>
                  <div className={styles.contactGrid}>
                    <a href={`tel:${item.phone}`}><Phone size={15} /><span><small>Phone</small>{item.phone}</span></a>
                    <a href={`mailto:${item.email}`}><Mail size={15} /><span><small>Email</small>{item.email}</span></a>
                    <div><Building2 size={15} /><span><small>Company</small>{item.company || "Not provided"}</span></div>
                    <div><Route size={15} /><span><small>Preferred lanes</small>{item.preferred_lanes || "Not provided"}</span></div>
                  </div>
                  <div className={styles.messageBox}>
                    <small>Notes from carrier</small>
                    <p>{item.message || "No additional message was provided."}</p>
                  </div>
                  <div className={styles.metaLine}>
                    <span>{humanize(item.form_type)}</span>
                    <span>Source: {humanize(item.source)}</span>
                    <span>{new Date(item.created_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Chicago" })} CT</span>
                  </div>
                </div>
              </details>
            ))}
          </div>
        ) : (
          <div className={styles.empty}>
            <Inbox size={28} />
            <h3>No online form submissions yet</h3>
            <p>New Apex website trial requests will appear here automatically.</p>
          </div>
        )}
      </section>
    </main>
  );
}
