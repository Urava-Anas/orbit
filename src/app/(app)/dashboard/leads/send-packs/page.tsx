import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Send, ShieldCheck, Sparkles } from "lucide-react";
import { Notice } from "@/components/Notice";
import { formatMoney, humanize } from "@/lib/format";
import { requireWorkspace } from "@/lib/workspace";
import {
  approveAndSendPackAction,
  buildSendPackAction,
} from "./actions";
import styles from "./send-packs.module.css";

export const metadata: Metadata = {
  title: "Commercial Send Packs",
  robots: { index: false, follow: false },
};

type PageProps = {
  searchParams: Promise<{ error?: string; notice?: string }>;
};

type Intelligence = {
  lead_id: string;
  total_score: number;
  qualification: string;
  recommended_offer: string | null;
};

type RelayTemplate = {
  id: string;
  name: string;
  current_version: number;
};

type RelayVersion = {
  id: string;
  template_id: string;
  version: number;
};

export default async function SendPacksPage({ searchParams }: PageProps) {
  const { supabase, workspace } = await requireWorkspace();
  const params = await searchParams;

  const [
    leadsResult,
    intelligenceResult,
    plansResult,
    packsResult,
    configResult,
    relayTemplatesResult,
    relayVersionsResult,
  ] = await Promise.all([
    supabase
      .from("leads")
      .select("id,name,company,email,whatsapp,phone,stage,lead_score")
      .eq("workspace_id", workspace.id)
      .not("stage", "in", '("won","lost")')
      .order("updated_at", { ascending: false })
      .limit(100),
    supabase
      .from("orbit_lead_intelligence")
      .select("lead_id,total_score,qualification,recommended_offer")
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("pricing_plans")
      .select(
        "id,name,service_category,base_price,min_price,max_price,currency,pricing_type,requires_approval,version",
      )
      .eq("workspace_id", workspace.id)
      .eq("status", "active")
      .order("updated_at", { ascending: false }),
    supabase
      .from("orbit_recommended_send_packs")
      .select(
        "id,lead_id,pricing_plan_id,channel,proposal_title,pricing_snapshot,content_snapshot,confidence,status,blocked_reason,action_request_id,created_at,sent_at",
      )
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("orbit_autopilot_configs")
      .select("state,mode,external_actions_enabled,kill_switch_engaged,blocked_reason")
      .eq("workspace_id", workspace.id)
      .maybeSingle(),
    supabase
      .from("relay_templates")
      .select("id,name,current_version")
      .eq("workspace_id", workspace.id)
      .eq("status", "active")
      .eq("category", "proposal")
      .order("updated_at", { ascending: false }),
    supabase
      .from("relay_template_versions")
      .select("id,template_id,version")
      .eq("workspace_id", workspace.id)
      .order("version", { ascending: false }),
  ]);

  const intelligenceByLead = new Map<string, Intelligence>();
  for (const row of (intelligenceResult.data ?? []) as Intelligence[]) {
    if (!intelligenceByLead.has(row.lead_id)) intelligenceByLead.set(row.lead_id, row);
  }

  const eligibleLeads = (leadsResult.data ?? []).filter((lead) => {
    const intel = intelligenceByLead.get(lead.id);
    return intel && intel.qualification !== "unqualified";
  });
  const plans = plansResult.data ?? [];
  const packs = packsResult.data ?? [];
  const relayVersions = (relayVersionsResult.data ?? []) as RelayVersion[];
  const relayTemplates = (relayTemplatesResult.data ?? []) as RelayTemplate[];
  const relayTemplateOptions = relayTemplates.flatMap((template) => {
    const version = relayVersions.find(
      (candidate) =>
        candidate.template_id === template.id &&
        candidate.version === template.current_version,
    );
    return version
      ? [{ id: version.id, label: `${template.name} · v${version.version}` }]
      : [];
  });

  const leadNames = new Map(
    (leadsResult.data ?? []).map((lead) => [lead.id, lead.company ?? lead.name]),
  );
  const planNames = new Map(plans.map((plan) => [plan.id, plan.name]));
  const config = configResult.data;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <Link className={styles.back} href="/dashboard/leads">
            <ArrowLeft size={15} /> Lead Engine
          </Link>
          <h1>Commercial Send Packs</h1>
          <p>
            Qualified lead → approved pricing → Relay rendering → proposal →
            founder-approved send → controlled follow-up.
          </p>
        </div>
        <span className={styles.badge}>
          <ShieldCheck size={15} /> Governed sending
        </span>
      </header>

      <Notice error={params.error} notice={params.notice} />

      <section className={styles.health}>
        <div>
          <span>Autopilot</span>
          <strong>{config?.state ? humanize(config.state) : "Not configured"}</strong>
        </div>
        <div>
          <span>Mode</span>
          <strong>{config?.mode ? humanize(config.mode) : "—"}</strong>
        </div>
        <div>
          <span>External actions</span>
          <strong>{config?.external_actions_enabled ? "Enabled" : "Disabled"}</strong>
        </div>
        <div>
          <span>Kill switch</span>
          <strong>{config?.kill_switch_engaged ? "Engaged" : "Clear"}</strong>
        </div>
      </section>

      <section className={styles.builder}>
        <div className={styles.sectionTitle}>
          <div>
            <span className={styles.icon}><Sparkles size={18} /></span>
            <div>
              <h2>Build recommended pack</h2>
              <p>Orbit refuses to invent pricing, bypass qualification, or send unresolved Relay variables.</p>
            </div>
          </div>
        </div>

        {!plans.length ? (
          <div className={styles.blocker}>
            <strong>No active pricing plans.</strong>
            <p>This engine is blocked until approved pricing truth exists.</p>
          </div>
        ) : null}

        {!eligibleLeads.length ? (
          <div className={styles.blocker}>
            <strong>No qualified leads with persisted intelligence.</strong>
            <p>Run Lead Intelligence / qualification before building a send pack.</p>
          </div>
        ) : null}

        {!relayTemplateOptions.length ? (
          <div className={styles.blocker}>
            <strong>No active Relay proposal template.</strong>
            <p>
              Plain-text Send Packs still work. Activate a Relay proposal template
              to render validated HTML and text from the canonical template schema.
            </p>
          </div>
        ) : null}

        <form action={buildSendPackAction} className={styles.form}>
          <label>
            <span>Qualified lead</span>
            <select name="leadId" required disabled={!eligibleLeads.length}>
              <option value="">Choose lead</option>
              {eligibleLeads.map((lead) => {
                const intel = intelligenceByLead.get(lead.id)!;
                return (
                  <option value={lead.id} key={lead.id}>
                    {lead.company ?? lead.name} · score {intel.total_score}
                  </option>
                );
              })}
            </select>
          </label>
          <label>
            <span>Approved pricing plan</span>
            <select name="pricingPlanId" required disabled={!plans.length}>
              <option value="">Choose plan</option>
              {plans.map((plan) => (
                <option value={plan.id} key={plan.id}>
                  {plan.name} · {plan.currency}{" "}
                  {plan.pricing_type === "fixed"
                    ? Number(plan.base_price).toLocaleString()
                    : `${Number(plan.min_price).toLocaleString()}–${Number(plan.max_price).toLocaleString()}`}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Relay proposal template</span>
            <select name="relayTemplateVersionId" defaultValue="">
              <option value="">Plain-text fallback</option>
              {relayTemplateOptions.map((template) => (
                <option value={template.id} key={template.id}>{template.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Channel</span>
            <select name="channel" defaultValue="auto">
              <option value="auto">Auto — prefer verified email</option>
              <option value="email">Email</option>
              <option value="whatsapp">WhatsApp</option>
            </select>
          </label>
          <button type="submit" disabled={!plans.length || !eligibleLeads.length}>
            <Sparkles size={16} /> Build pack
          </button>
        </form>
      </section>

      <section className={styles.list}>
        <div className={styles.sectionTitle}>
          <div>
            <span className={styles.icon}><Send size={18} /></span>
            <div>
              <h2>Prepared packs</h2>
              <p>The button below is the explicit irreversible founder action.</p>
            </div>
          </div>
        </div>

        <div className={styles.cards}>
          {packs.map((pack) => {
            const pricing =
              pack.pricing_snapshot &&
              typeof pack.pricing_snapshot === "object" &&
              !Array.isArray(pack.pricing_snapshot)
                ? (pack.pricing_snapshot as Record<string, unknown>)
                : {};
            const content =
              pack.content_snapshot &&
              typeof pack.content_snapshot === "object" &&
              !Array.isArray(pack.content_snapshot)
                ? (pack.content_snapshot as Record<string, unknown>)
                : {};
            const currency = String(pricing.currency ?? "");
            const selected = Number(pricing.base_price ?? 0);
            const relay = Boolean(content.relay_template_version_id);
            const canSend = ["waiting_approval", "ready"].includes(pack.status);
            return (
              <article className={styles.card} key={pack.id}>
                <div className={styles.cardTop}>
                  <div>
                    <span className={styles.status}>{humanize(pack.status)}</span>
                    <h3>{pack.proposal_title}</h3>
                    <p>
                      {leadNames.get(pack.lead_id) ?? "Lead"} ·{" "}
                      {planNames.get(pack.pricing_plan_id) ?? String(pricing.name ?? "Pricing plan")}
                    </p>
                  </div>
                  <strong>{currency ? formatMoney(selected, currency) : "Priced"}</strong>
                </div>
                <div className={styles.meta}>
                  <span>{humanize(pack.channel)}</span>
                  <span>{pack.confidence}% confidence</span>
                  {relay ? <span>Relay v{String(content.relay_template_version ?? "")}</span> : <span>Plain text</span>}
                  <span>{new Date(pack.created_at).toLocaleDateString("en-PK", { timeZone: "Asia/Karachi" })}</span>
                </div>
                {pack.blocked_reason ? <p className={styles.reason}>{pack.blocked_reason}</p> : null}
                {pack.status === "sent" ? (
                  <div className={styles.sent}>
                    <CheckCircle2 size={16} /> Sent through governed Stage 4
                  </div>
                ) : canSend ? (
                  <form action={approveAndSendPackAction}>
                    <input type="hidden" name="sendPackId" value={pack.id} />
                    <input type="hidden" name="relay" value={relay ? "1" : "0"} />
                    <button className={styles.sendButton} type="submit">
                      <Send size={15} /> Approve & Send
                    </button>
                  </form>
                ) : null}
              </article>
            );
          })}
          {!packs.length ? (
            <div className={styles.empty}>No commercial send packs prepared yet.</div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
