import type { Metadata } from "next";
import Link from "next/link";
import { Archive, BadgeCheck, BarChart3, ExternalLink, FileImage, Library, MessageSquareText, Plus, Send, Sparkles, Target } from "lucide-react";
import { Notice } from "@/components/Notice";
import { humanize } from "@/lib/format";
import { requireWorkspace } from "@/lib/workspace";
import { createCommercialContentAsset, setCommercialContentAssetStatus } from "./actions";
import styles from "./content.module.css";

export const metadata: Metadata = { title: "Content Library", robots: { index: false, follow: false } };

type PageProps = { searchParams: Promise<{ error?: string; notice?: string }> };
type ContentAsset = {
  id: string; title: string; asset_type: string; asset_url: string | null; body: string;
  audience_tags: string[]; industry_tags: string[]; service_categories: string[]; lead_stages: string[];
  channels: string[]; goal: string; language: string; cta: string; proof_id: string | null;
  linked_pricing_plan_id: string | null; status: "draft" | "approved" | "expired" | "archived";
  sent_count: number; reply_count: number; meeting_count: number; won_count: number; updated_at: string;
};
type PricingOption = { id: string; name: string; service_category: string };
type ProofOption = { id: string; title: string };

function performance(asset: ContentAsset) {
  return asset.sent_count ? `${Math.round((asset.reply_count / asset.sent_count) * 100)}% reply rate` : "Not used yet";
}

export default async function ContentLibraryPage({ searchParams }: PageProps) {
  const { supabase, workspace, role } = await requireWorkspace();
  const params = await searchParams;
  const [assetsResult, plansResult, proofsResult] = await Promise.all([
    supabase.from("commercial_content_assets").select("id,title,asset_type,asset_url,body,audience_tags,industry_tags,service_categories,lead_stages,channels,goal,language,cta,proof_id,linked_pricing_plan_id,status,sent_count,reply_count,meeting_count,won_count,updated_at").eq("workspace_id", workspace.id).order("status", { ascending: true }).order("updated_at", { ascending: false }),
    supabase.from("pricing_plans").select("id,name,service_category").eq("workspace_id", workspace.id).eq("status", "active").order("name"),
    supabase.from("proofs").select("id,title").eq("workspace_id", workspace.id).eq("status", "approved").order("title"),
  ]);
  const assets = (assetsResult.data ?? []) as ContentAsset[];
  const plans = (plansResult.data ?? []) as PricingOption[];
  const proofs = (proofsResult.data ?? []) as ProofOption[];
  const approved = assets.filter((asset) => asset.status === "approved");
  const totalSends = approved.reduce((sum, asset) => sum + asset.sent_count, 0);
  const totalReplies = approved.reduce((sum, asset) => sum + asset.reply_count, 0);
  const canManage = role === "owner" || role === "admin";

  return (
    <main className={styles.page}>
      <header className={styles.pageHeader}>
        <div><span className={styles.eyebrow}><Sparkles size={14} /> Growth Engine · shared commercial memory</span><h1>Content Library</h1><p>Approved posters, offers, proof and follow-up assets Orbit can match to the right lead.</p></div>
        {canManage ? <a className={styles.primaryButton} href="#new-asset"><Plus size={16} /> Add asset</a> : null}
      </header>

      <Notice error={params.error ?? (assetsResult.error ? "Content Library is not ready yet. Apply the Phase One send-pack migration." : undefined)} notice={params.notice} />

      <section className={styles.metrics} aria-label="Content library readiness">
        <article><span><Library size={18} /></span><p>Approved assets<strong>{approved.length}</strong><small>Available to recommendations</small></p></article>
        <article><span><FileImage size={18} /></span><p>Draft assets<strong>{assets.filter((asset) => asset.status === "draft").length}</strong><small>Cannot be sent yet</small></p></article>
        <article><span><Send size={18} /></span><p>Total sends<strong>{totalSends}</strong><small>Tracked commercial uses</small></p></article>
        <article><span><BarChart3 size={18} /></span><p>Reply rate<strong>{totalSends ? `${Math.round((totalReplies / totalSends) * 100)}%` : "—"}</strong><small>Used later for learning</small></p></article>
      </section>

      <section className={styles.ruleStrip}><Target size={20} /><div><strong>Orbit recommends by lead type, stage, goal, channel and service match.</strong><small>The founder can keep the recommendation, choose another asset or send without one.</small></div><Link href="/dashboard/leads">Use with a lead</Link></section>

      <section className={styles.librarySection} aria-labelledby="asset-library-heading">
        <div className={styles.sectionHeading}><div><h2 id="asset-library-heading">Reusable commercial assets</h2><p>Drafts stay private. Only Approved assets may enter a send pack.</p></div><span>{assets.length} total</span></div>
        {assets.length ? (
          <div className={styles.assetGrid}>
            {assets.map((asset) => (
              <article className={`${styles.assetCard} ${styles[`status_${asset.status}`]}`} key={asset.id}>
                <div className={styles.assetVisual}><FileImage size={28} /><span>{humanize(asset.asset_type)}</span>{asset.asset_url ? <a href={asset.asset_url} target="_blank" rel="noreferrer" aria-label={`Open ${asset.title}`}><ExternalLink size={14} /></a> : null}</div>
                <div className={styles.assetBody}>
                  <div className={styles.assetTitle}><div><small>{humanize(asset.goal)}</small><h3>{asset.title}</h3></div><span>{humanize(asset.status)}</span></div>
                  <p>{asset.body || asset.cta || "Visual asset ready for an approved send pack."}</p>
                  <div className={styles.tags}>{asset.channels.slice(0, 3).map((channel) => <span key={channel}>{humanize(channel)}</span>)}{asset.service_categories.slice(0, 2).map((category) => <span key={category}>{category}</span>)}</div>
                  <div className={styles.assetStats}><span>{performance(asset)}</span><span>{asset.won_count} won</span></div>
                  {canManage ? <div className={styles.assetActions}>
                    {asset.status !== "approved" ? <form action={setCommercialContentAssetStatus}><input type="hidden" name="id" value={asset.id} /><input type="hidden" name="status" value="approved" /><button type="submit"><BadgeCheck size={13} /> Approve</button></form> : null}
                    {!['archived', 'expired'].includes(asset.status) ? <form action={setCommercialContentAssetStatus}><input type="hidden" name="id" value={asset.id} /><input type="hidden" name="status" value="archived" /><button className={styles.quietButton} type="submit"><Archive size={13} /> Archive</button></form> : null}
                  </div> : null}
                </div>
              </article>
            ))}
          </div>
        ) : <div className={styles.emptyState}><MessageSquareText size={28} /><div><h3>No reusable commercial assets yet</h3><p>Add one approved poster, proof card or offer visual. Orbit can then recommend it beside the proposal.</p></div></div>}
      </section>

      {canManage ? <section className={styles.newAsset} id="new-asset">
        <div className={styles.formIntro}><span><Plus size={18} /></span><div><h2>Add content asset</h2><p>Metadata is what turns a folder of images into a recommendation engine.</p></div></div>
        <form action={createCommercialContentAsset} className={styles.assetForm}>
          <label><span>Asset title</span><input name="title" minLength={2} maxLength={180} required placeholder="Restaurant WhatsApp Ordering Poster" /></label>
          <label><span>Asset type</span><select name="assetType" defaultValue="poster">{["poster","offer","service_explainer","case_study","testimonial","before_after","followup","seasonal","authority","proof"].map((type) => <option key={type} value={type}>{humanize(type)}</option>)}</select></label>
          <label className={styles.wide}><span>Public asset URL</span><input name="assetUrl" type="url" maxLength={1000} placeholder="https://.../poster.png" /></label>
          <label className={styles.wide}><span>Reusable supporting copy</span><textarea name="body" maxLength={8000} placeholder="Short explanation Orbit may use when recommending this asset." /></label>
          <label><span>Goal</span><select name="goal" defaultValue="build_trust">{["start_conversation","build_trust","explain_offer","request_decision","follow_up","reactivate","broadcast"].map((goal) => <option key={goal} value={goal}>{humanize(goal)}</option>)}</select></label>
          <label><span>Language</span><input name="language" defaultValue="en" minLength={2} maxLength={20} /></label>
          <label className={styles.wide}><span>Call to action</span><input name="cta" maxLength={500} placeholder="Reply YES and I’ll send the exact starting plan." /></label>
          <label><span>Audience tags</span><input name="audienceTags" placeholder="local business, owner" /></label>
          <label><span>Industry tags</span><input name="industryTags" placeholder="restaurant, consultant" /></label>
          <label><span>Service categories</span><input name="serviceCategories" placeholder="Websites, Automation" /></label>
          <label><span>Lead stages</span><input name="leadStages" placeholder="qualified, interested, proposal" /></label>
          <label><span>Linked pricing plan</span><select name="pricingPlanId" defaultValue=""><option value="">Any matching plan</option>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} · {plan.service_category}</option>)}</select></label>
          <label><span>Linked approved proof</span><select name="proofId" defaultValue=""><option value="">No proof link</option>{proofs.map((proof) => <option key={proof.id} value={proof.id}>{proof.title}</option>)}</select></label>
          <fieldset className={styles.wide}><legend>Allowed channels</legend>{["whatsapp","email","instagram","facebook","linkedin","website"].map((channel) => <label key={channel}><input name="channels" type="checkbox" value={channel} defaultChecked={["whatsapp","email"].includes(channel)} /> {humanize(channel)}</label>)}</fieldset>
          <label><span>State</span><select name="status" defaultValue="draft"><option value="draft">Draft · private</option><option value="approved">Approved · recommendable</option></select></label>
          <input name="thumbnailUrl" type="hidden" value="" />
          <div className={styles.formActions}><button type="submit">Save content asset</button></div>
        </form>
      </section> : null}
    </main>
  );
}
