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

export default async function SendPacksPage({ searchParams }: PageProps) {
  const { supabase, workspace } = await requireWorkspace();
  const params = await searchParams;

  const [leadsResult, intelligenceResult, plansResult, packsResult, configResult] =
    await Promise.all([
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
          "id,lead_id,pricing_plan_id,channel,proposal_title,pricing_snapshot,confidence,status,blocked_reason,action_request_id,created_at,sent_at",
        )
        .eq("workspace_id", workspace.id)
        .order("created_at", { ascending: false })
        .limit(30),
      supabase
        .from("orbit_autopilot_configs")
        .select("state,mode,external_actions_enabled,kill_switch_engaged,blocked_reason")
        .eq("workspace_id", workspace.id)
        .maybeSingle(),
    ]);

  const intelligenceByLead = new Map<string, Intelligence>();
  for (const row of (intelligenceResult.data ?? []) as Intelligence[]) {
    if (!intelligenceByLead.has(row.lead_id)) {
      intelligenceByLead.set(row.lead_id, row);
    }
  }

  const eligibleLeads = (leadsResult.data ?? []).filter((lead) => {
    const intel = intelligenceByLead.get(lead.id);
    return intel && intel.qualification !== "unqualified";
  });
  const plans = plansResult.data ?? [];
  const packs = packsResult.data ?? [];
  const leadNames = new Map(
    (leadsResult.data ?? []).map((lead) => [
      lead.id,
      lead.company ?? lead.name,
    ]),
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
            Qualified lead → approved pricing → proposal → founder-approved send →
            controlled follow-up.
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
              <p>Orbit refuses to invent pricing or bypass qualification.</p>
            </div>
          </div>
        </div>

        {!plans.length ? (
          <div className={styles.blocker}>
            <strong>No active pricing plans.</strong>
            <p>
              This engine is correctly blocked until Urava publishes approved pricing
              truth. No amount will be invented by the system.
            </p>
          </div>
        ) : null}

        {!eligibleLeads.length ? (
          <div className={styles.blocker}>
            <strong>No qualified leads with persisted intelligence.</strong>
            <p>Run Lead Intelligence / qualification before building a send pack.</p>
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
            <span>Channel</span>
            <select name="channel" defaultValue="auto">
              <option value="auto">Auto — prefer verified email</option>
              <option value="email">Email</option>
              <option value="whatsapp">WhatsApp</option>
            </select>
          </label>
          <button
            type="submit"
            disabled={!plans.length || !eligibleLeads.length}
          >
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
            const snapshot =
              pack.pricing_snapshot &&
              typeof pack.pricing_snapshot === "object" &&
              !Array.isArray(pack.pricing_snapshot)
                ? (pack.pricing_snapshot as Record<string, unknown>)
                : {};
            const currency = String(snapshot.currency ?? "");
            const selected = Number(snapshot.base_price ?? 0);
            const canSend = ["waiting_approval", "ready"].includes(pack.status);
            return (
              <article className={styles.card} key={pack.id}>
                <div className={styles.cardTop}>
                  <div>
                    <span className={styles.status}>{humanize(pack.status)}</span>
                    <h3>{pack.proposal_title}</h3>
                    <p>
                      {leadNames.get(pack.lead_id) ?? "Lead"} ·{" "}
                      {planNames.get(pack.pricing_plan_id) ?? String(snapshot.name ?? "Pricing plan")}
                    </p>
                  </div>
                  <strong>
                    {currency ? formatMoney(selected, currency) : "Priced"}
                  </strong>
                </div>
                <div className={styles.meta}>
                  <span>{humanize(pack.channel)}</span>
                  <span>{pack.confidence}% confidence</span>
                  <span>{new Date(pack.created_at).toLocaleDateString("en-PK", { timeZone: "Asia/Karachi" })}</span>
                </div>
                {pack.blocked_reason ? (
                  <p className={styles.reason}>{pack.blocked_reason}</p>
                ) : null}
                {pack.status === "sent" ? (
                  <div className={styles.sent}>
                    <CheckCircle2 size={16} /> Sent through governed Stage 4
                  </div>
                ) : canSend ? (
                  <form action={approveAndSendPackAction}>
                    <input type="hidden" name="sendPackId" value={pack.id} />
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
