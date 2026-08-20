import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BadgeCheck, CircleDollarSign, ExternalLink, FileImage, Mail, MessageSquareText, Send, ShieldCheck, Sparkles, Target, TriangleAlert } from "lucide-react";
import { Notice } from "@/components/Notice";
import { formatMoney, humanize } from "@/lib/format";
import {
  buildRecommendedSendPack,
  isLeadReadyForSendPack,
  planPriceLabel,
  type SendPackContentAsset,
  type SendPackLead,
  type SendPackPricingPlan,
} from "@/lib/send-packs";
import { requireWorkspace } from "@/lib/workspace";
import { prepareRecommendedSendPack, sendRecommendedPack } from "./actions";
import styles from "./send-pack.module.css";

export const metadata: Metadata = { title: "Recommended Send Pack", robots: { index: false, follow: false } };

type PageProps = { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; notice?: string }> };
type SendPackRow = {
  id: string; channel: "email" | "whatsapp" | "manual"; subject: string | null; message_body: string;
  proposal_title: string; proposal_scope: Array<{ item: string; source: string }>; pricing_snapshot: Record<string, unknown>;
  content_snapshot: Record<string, unknown>; recommendation_basis: Record<string, unknown>; confidence: number;
  requires_approval: boolean; status: string; blocked_reason: string | null; created_at: string; sent_at: string | null;
};
type AutopilotConfig = { state: string; mode: string; external_actions_enabled: boolean; kill_switch_engaged: boolean; last_preflight_result: string | null };

function priceFromSnapshot(snapshot: Record<string, unknown>) {
  const currency = String(snapshot.currency ?? "PKR");
  const type = String(snapshot.pricingType ?? "fixed");
  if (type === "custom") return "Custom quote";
  if (type === "range") return `${formatMoney(Number(snapshot.minPrice ?? 0), currency)} – ${formatMoney(Number(snapshot.maxPrice ?? 0), currency)}`;
  return formatMoney(Number(snapshot.basePrice ?? 0), currency);
}

export default async function LeadSendPackPage({ params, searchParams }: PageProps) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const { supabase, workspace } = await requireWorkspace();
  const [leadResult, plansResult, assetsResult, packResult, configResult] = await Promise.all([
    supabase.from("leads").select("id,name,company,email,phone,whatsapp,niche,stage,pain_point,notes,lead_score,currency,source,estimated_value,created_at").eq("workspace_id", workspace.id).eq("id", id).maybeSingle(),
    supabase.from("pricing_plans").select("id,name,service_category,summary,pricing_type,base_price,min_price,max_price,currency,max_discount_percent,installment_options,included_features,add_ons,offer_valid_days,requires_approval,status,version").eq("workspace_id", workspace.id).eq("status", "active"),
    supabase.from("commercial_content_assets").select("id,title,asset_type,asset_url,body,audience_tags,industry_tags,service_categories,lead_stages,channels,goal,language,cta,linked_pricing_plan_id,status,sent_count,reply_count,meeting_count,won_count").eq("workspace_id", workspace.id).eq("status", "approved"),
    supabase.from("orbit_recommended_send_packs").select("id,channel,subject,message_body,proposal_title,proposal_scope,pricing_snapshot,content_snapshot,recommendation_basis,confidence,requires_approval,status,blocked_reason,created_at,sent_at").eq("workspace_id", workspace.id).eq("lead_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("orbit_autopilot_configs").select("state,mode,external_actions_enabled,kill_switch_engaged,last_preflight_result").eq("workspace_id", workspace.id).maybeSingle(),
  ]);
  if (!leadResult.data) notFound();
  const lead = leadResult.data as SendPackLead & { source: string; estimated_value: number; created_at: string };
  const plans = (plansResult.data ?? []) as SendPackPricingPlan[];
  const assets = (assetsResult.data ?? []) as SendPackContentAsset[];
  const frozenPack = (packResult.data ?? null) as SendPackRow | null;
  const config = (configResult.data ?? null) as AutopilotConfig | null;
  let recommendation = null;
  try { recommendation = plans.length ? buildRecommendedSendPack({ lead, plans, assets }) : null; } catch { recommendation = null; }
  const eligibleAssets = recommendation
    ? assets.filter((asset) => recommendation.channel === "manual" || asset.channels.includes(recommendation.channel))
    : [];
  const ready = isLeadReadyForSendPack(lead);
  const business = lead.company ?? lead.name;
  const sourceSlug = lead.source === "local_search" || lead.source === "google"
    ? "google"
    : lead.source === "referral"
      ? "referrals"
      : ["website", "instagram", "linkedin", "facebook", "youtube"].includes(lead.source)
        ? lead.source
        : null;
  const configReady = config && ["running", "degraded"].includes(config.state) && (config.mode === "simulation" || (config.external_actions_enabled && !config.kill_switch_engaged));

  return (
    <main className={styles.page}>
      <header className={styles.pageHeader}>
        <div><Link href={sourceSlug ? `/dashboard/leads/sources/${sourceSlug}` : "/dashboard/leads"}><ArrowLeft size={14} /> Back to leads</Link><span className={styles.eyebrow}><Sparkles size={13} /> Phase One · one-click sell</span><h1>{business}</h1><p>Orbit has assembled the best approved commercial action for this lead.</p></div>
        <div className={styles.leadScore}><span>Lead score</span><strong>{lead.lead_score ?? "—"}</strong><small>{humanize(lead.stage)}</small></div>
      </header>

      <Notice error={query.error} notice={query.notice} />

      <section className={styles.flow} aria-label="One-click send flow">
        {["Qualified lead", "Pricing truth", "Best content", "Proposal + message", "Governed send"].map((step, index) => <div key={step}><span>{index + 1}</span><strong>{step}</strong>{index < 4 ? <i /> : null}</div>)}
      </section>

      <div className={styles.layout}>
        <section className={styles.mainColumn}>
          <article className={styles.leadContext}>
            <div className={styles.sectionHeading}><div><span>Lead context</span><h2>Why Orbit chose this action</h2></div><Target size={19} /></div>
            <div className={styles.contextGrid}>
              <div><small>Industry</small><strong>{lead.niche ?? "Not specified"}</strong></div>
              <div><small>Source</small><strong>{humanize(lead.source)}</strong></div>
              <div><small>Detected problem</small><strong>{lead.pain_point ?? "Needs commercial discovery"}</strong></div>
              <div><small>Available channel</small><strong>{lead.whatsapp || lead.phone ? "WhatsApp" : lead.email ? "Email" : "Manual only"}</strong></div>
            </div>
          </article>

          {frozenPack ? (
            <article className={styles.packCard}>
              <div className={styles.packHeader}>
                <div><span className={styles.packLabel}><BadgeCheck size={13} /> Frozen send pack</span><h2>{frozenPack.proposal_title}</h2><p>Price, message and content are locked to this preview.</p></div>
                <div className={styles.confidence}><strong>{frozenPack.confidence}%</strong><small>match confidence</small></div>
              </div>
              <div className={styles.packMetrics}>
                <div><CircleDollarSign size={16} /><p><small>Approved price</small><strong>{priceFromSnapshot(frozenPack.pricing_snapshot)}</strong></p></div>
                <div>{frozenPack.channel === "email" ? <Mail size={16} /> : <MessageSquareText size={16} />}<p><small>Channel</small><strong>{humanize(frozenPack.channel)}</strong></p></div>
                <div><FileImage size={16} /><p><small>Content</small><strong>{String(frozenPack.content_snapshot.title ?? "No visual attached")}</strong></p></div>
                <div><ShieldCheck size={16} /><p><small>Authority</small><strong>{frozenPack.requires_approval ? "Founder approval" : "Inside policy"}</strong></p></div>
              </div>
              <div className={styles.previewGrid}>
                <div className={styles.messagePreview}><span>Message preview</span><h3>{frozenPack.subject ?? "WhatsApp proposal message"}</h3><p>{frozenPack.message_body}</p></div>
                <div className={styles.proposalPreview}><span>Proposal scope</span><h3>{String(frozenPack.pricing_snapshot.name ?? "Approved plan")}</h3><ul>{frozenPack.proposal_scope.map((scope) => <li key={scope.item}><BadgeCheck size={13} />{scope.item}</li>)}</ul>{typeof frozenPack.content_snapshot.assetUrl === "string" ? <a href={frozenPack.content_snapshot.assetUrl} target="_blank" rel="noreferrer">Open recommended asset <ExternalLink size={12} /></a> : null}</div>
              </div>
              {frozenPack.blocked_reason ? <div className={styles.blocked}><TriangleAlert size={16} /><span>{frozenPack.blocked_reason}</span></div> : null}
              <div className={styles.packActions}>
                <form action={sendRecommendedPack}><input type="hidden" name="leadId" value={lead.id} /><input type="hidden" name="packId" value={frozenPack.id} /><button type="submit" disabled={frozenPack.status !== "ready" || frozenPack.channel === "manual"}><Send size={16} /> {frozenPack.status === "ready" ? "Send Recommended" : humanize(frozenPack.status)}</button></form>
                <a href="#rebuild-pack">Choose another plan or asset</a>
              </div>
            </article>
          ) : recommendation ? (
            <article className={styles.recommendationCard}>
              <div><span><Sparkles size={14} /> Orbit recommendation</span><h2>{recommendation.plan.name}</h2><p>{recommendation.plan.summary}</p></div>
              <strong>{planPriceLabel(recommendation.plan)}</strong>
              <small>{recommendation.asset ? `With ${recommendation.asset.title}` : "Message + proposal · no visual available"}</small>
              <a href="#rebuild-pack">Review and prepare</a>
            </article>
          ) : <article className={styles.missing}><TriangleAlert size={22} /><div><h2>No approved commercial path yet</h2><p>Create an active pricing plan first. Orbit will not invent a price.</p><Link href="/dashboard/pricing">Open Pricing Model</Link></div></article>}

          {recommendation ? <article className={styles.builder} id="rebuild-pack">
            <div className={styles.sectionHeading}><div><span>Founder override</span><h2>Prepare the send pack</h2><p>Orbit’s recommendation is selected. Change only if you know something the system does not.</p></div><Sparkles size={19} /></div>
            <form action={prepareRecommendedSendPack} className={styles.builderForm}>
              <input type="hidden" name="leadId" value={lead.id} />
              <label><span>Pricing plan</span><select name="planId" defaultValue={recommendation.plan.id}>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} · {planPriceLabel(plan)}</option>)}</select></label>
              <label><span>Content asset</span><select name="assetId" defaultValue={recommendation.asset?.id ?? ""}><option value="">No visual asset</option>{eligibleAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.title} · {humanize(asset.asset_type)}</option>)}</select></label>
              <button type="submit" disabled={!ready}><Sparkles size={15} /> {ready ? "Prepare Recommended Pack" : "Qualify Lead First"}</button>
            </form>
          </article> : null}
        </section>

        <aside className={styles.sideColumn}>
          <section className={styles.sideCard}><h2>Send readiness</h2><div className={styles.checkList}>
            <div><span className={ready ? styles.good : styles.bad} /> Lead qualified <strong>{ready ? "Ready" : "Blocked"}</strong></div>
            <div><span className={plans.length ? styles.good : styles.bad} /> Active pricing <strong>{plans.length}</strong></div>
            <div><span className={assets.length ? styles.good : styles.warn} /> Approved content <strong>{assets.length}</strong></div>
            <div><span className={configReady ? styles.good : styles.bad} /> Governed sender <strong>{configReady ? "Ready" : "Needs setup"}</strong></div>
          </div></section>
          <section className={styles.sideCard}><h2>Non-negotiable rules</h2><ul className={styles.rules}><li>Price only from an active plan.</li><li>Only approved content can attach.</li><li>One frozen preview before send.</li><li>Kill switch and working hours still win.</li><li>Every send creates an audit trail.</li></ul></section>
          <section className={styles.sideCard}><h2>What one click does</h2><ol className={styles.oneClick}><li>Approves this exact frozen pack</li><li>Creates governed send action</li><li>Uses connected WhatsApp or email</li><li>Marks Proposal Sent</li><li>Schedules follow-up in 72 hours</li></ol></section>
        </aside>
      </div>
    </main>
  );
}
