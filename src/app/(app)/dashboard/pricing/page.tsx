import type { Metadata } from "next";
import {
  Archive,
  BadgeCheck,
  Banknote,
  CircleDollarSign,
  FileLock2,
  Gauge,
  Plus,
  ReceiptText,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Notice } from "@/components/Notice";
import { formatMoney, humanize } from "@/lib/format";
import type { PricingCurrency, PricingStatus, PricingType } from "@/lib/pricing";
import { requireWorkspace } from "@/lib/workspace";
import { createPricingPlan, setPricingPlanStatus, updatePricingPlan } from "./actions";
import styles from "./pricing.module.css";

export const metadata: Metadata = {
  title: "Pricing Model",
  robots: { index: false, follow: false },
};

type PageProps = {
  searchParams: Promise<{ error?: string; notice?: string }>;
};

type PricingPlan = {
  id: string;
  plan_key: string;
  name: string;
  service_category: string;
  summary: string;
  pricing_type: PricingType;
  base_price: number | null;
  min_price: number | null;
  max_price: number | null;
  currency: PricingCurrency;
  max_discount_percent: number;
  installment_options: string[];
  included_features: string[];
  add_ons: string[];
  offer_valid_days: number;
  requires_approval: boolean;
  status: PricingStatus;
  version: number;
  updated_at: string;
};

function planPrice(plan: PricingPlan) {
  if (plan.pricing_type === "custom") return "Custom quote";
  if (plan.pricing_type === "range" && plan.min_price !== null && plan.max_price !== null) {
    return `${formatMoney(Number(plan.min_price), plan.currency)} - ${formatMoney(Number(plan.max_price), plan.currency)}`;
  }
  return formatMoney(Number(plan.base_price ?? 0), plan.currency);
}

function lines(values: string[]) {
  return values.join("\n");
}

export default async function PricingPage({ searchParams }: PageProps) {
  const { supabase, role } = await requireWorkspace();
  const params = await searchParams;
  const { data, error } = await supabase
    .from("pricing_plans")
    .select("id,plan_key,name,service_category,summary,pricing_type,base_price,min_price,max_price,currency,max_discount_percent,installment_options,included_features,add_ons,offer_valid_days,requires_approval,status,version,updated_at")
    .order("status", { ascending: true })
    .order("updated_at", { ascending: false });

  const plans = (data ?? []) as PricingPlan[];
  const canManage = role === "owner" || role === "admin";
  const activePlans = plans.filter((plan) => plan.status === "active");
  const policyBound = activePlans.filter((plan) => plan.pricing_type !== "custom" && !plan.requires_approval).length;
  const highestDiscount = activePlans.reduce((max, plan) => Math.max(max, Number(plan.max_discount_percent || 0)), 0);

  return (
    <main className={styles.pricingPage}>
      <header className={styles.pageHeader}>
        <div>
          <div className={styles.eyebrow}><Sparkles size={14} /> Phase One · Commercial truth</div>
          <h1>Pricing Model</h1>
          <p>One approved source for prices, scope, discounts and proposal authority.</p>
        </div>
        {canManage ? <a className={styles.primaryButton} href="#new-plan"><Plus size={16} /> New pricing plan</a> : null}
      </header>

      <Notice error={params.error ?? (error ? "Pricing data is not ready yet. Apply the Phase One database migration." : undefined)} notice={params.notice} />

      <section className={styles.metricsGrid} aria-label="Pricing readiness">
        <article><span className={styles.metricIcon}><BadgeCheck size={18} /></span><p>Active plans<strong>{activePlans.length}</strong><small>Available to new proposals</small></p></article>
        <article><span className={styles.metricIcon}><ReceiptText size={18} /></span><p>Draft plans<strong>{plans.filter((plan) => plan.status === "draft").length}</strong><small>Not used by automation</small></p></article>
        <article><span className={styles.metricIcon}><ShieldCheck size={18} /></span><p>Policy-bound<strong>{policyBound}</strong><small>Safe inside founder limits</small></p></article>
        <article><span className={styles.metricIcon}><Gauge size={18} /></span><p>Largest discount cap<strong>{highestDiscount}%</strong><small>Anything above needs approval</small></p></article>
      </section>

      <section className={styles.ruleStrip}>
        <div><FileLock2 size={20} /><p><strong>Orbit chooses the best-fit active plan.</strong><small>It never invents a price or silently changes commercial limits.</small></p></div>
        <span>Inside plan = policy acts</span>
        <span>Outside plan = founder approves</span>
      </section>

      <section className={styles.plansSection} aria-labelledby="plans-heading">
        <div className={styles.sectionHeading}>
          <div><h2 id="plans-heading">Pricing plans</h2><p>Active plans feed the proposal engine. Archived plans remain preserved for history.</p></div>
        </div>

        {plans.length ? (
          <div className={styles.planGrid}>
            {plans.map((plan) => (
              <article className={`${styles.planCard} ${styles[`status_${plan.status}`]}`} key={plan.id}>
                <div className={styles.planTop}>
                  <span className={styles.planIcon}><CircleDollarSign size={20} /></span>
                  <div><small>{plan.service_category}</small><h3>{plan.name}</h3></div>
                  <span className={styles.statusPill}>{humanize(plan.status)}</span>
                </div>
                <strong className={styles.price}>{planPrice(plan)}</strong>
                <p className={styles.summary}>{plan.summary || "No commercial summary added yet."}</p>
                <div className={styles.policyRow}>
                  <span>Discount cap <b>{Number(plan.max_discount_percent)}%</b></span>
                  <span>Valid <b>{plan.offer_valid_days} days</b></span>
                  <span>Version <b>v{plan.version}</b></span>
                </div>
                <ul className={styles.featureList}>
                  {plan.included_features.slice(0, 5).map((feature) => <li key={feature}><BadgeCheck size={14} />{feature}</li>)}
                  {!plan.included_features.length ? <li className={styles.missingFeature}>No included features yet</li> : null}
                </ul>
                <div className={styles.authorityLine}>
                  <ShieldCheck size={15} />
                  {plan.pricing_type === "custom" || plan.requires_approval ? "Founder approval required" : "Policy may prepare and recommend"}
                </div>

                {canManage ? (
                  <div className={styles.cardActions}>
                    {plan.status !== "active" ? (
                      <form action={setPricingPlanStatus}><input type="hidden" name="id" value={plan.id} /><input type="hidden" name="status" value="active" /><button type="submit"><BadgeCheck size={14} /> Activate</button></form>
                    ) : null}
                    {plan.status !== "archived" ? (
                      <form action={setPricingPlanStatus}><input type="hidden" name="id" value={plan.id} /><input type="hidden" name="status" value="archived" /><button className={styles.archiveButton} type="submit"><Archive size={14} /> Archive</button></form>
                    ) : null}
                  </div>
                ) : null}

                {canManage ? (
                  <details className={styles.editPanel}>
                    <summary>Edit commercial rules</summary>
                    <PricingForm plan={plan} />
                  </details>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <div className={styles.emptyState}>
            <Banknote size={28} />
            <div><h3>No pricing truth exists yet</h3><p>Create the first approved plan before Orbit is allowed to prepare proposals.</p></div>
            {canManage ? <a href="#new-plan">Create first plan</a> : null}
          </div>
        )}
      </section>

      {canManage ? (
        <section className={styles.newPlanSection} id="new-plan">
          <div className={styles.formIntro}><span><Plus size={19} /></span><div><h2>Create pricing plan</h2><p>Start as Draft unless the scope, price and included features are already locked.</p></div></div>
          <PricingForm />
        </section>
      ) : null}
    </main>
  );
}

function PricingForm({ plan }: { plan?: PricingPlan }) {
  return (
    <form action={plan ? updatePricingPlan : createPricingPlan} className={styles.pricingForm}>
      {plan ? <><input type="hidden" name="id" value={plan.id} /><input type="hidden" name="version" value={plan.version} /></> : null}
      <label><span>Plan name</span><input name="name" defaultValue={plan?.name} minLength={2} maxLength={120} required placeholder="Website Starter" /></label>
      <label><span>Service category</span><input name="serviceCategory" defaultValue={plan?.service_category} minLength={2} maxLength={80} required placeholder="Websites" /></label>
      <label className={styles.wideField}><span>Commercial summary</span><textarea name="summary" defaultValue={plan?.summary} maxLength={2000} placeholder="Best for local businesses that need trust and enquiries." /></label>
      <label><span>Pricing type</span><select name="pricingType" defaultValue={plan?.pricing_type ?? "fixed"}><option value="fixed">Fixed</option><option value="range">Approved range</option><option value="custom">Custom · approval required</option></select></label>
      <label><span>Currency</span><select name="currency" defaultValue={plan?.currency ?? "PKR"}><option>PKR</option><option>USD</option><option>GBP</option><option>EUR</option><option>AED</option><option>SAR</option></select></label>
      <label><span>Recommended / fixed price</span><input name="basePrice" type="number" min="0" step="0.01" defaultValue={plan?.base_price ?? ""} placeholder="60000" /></label>
      <label><span>Minimum allowed price</span><input name="minPrice" type="number" min="0" step="0.01" defaultValue={plan?.min_price ?? ""} placeholder="50000" /></label>
      <label><span>Maximum allowed price</span><input name="maxPrice" type="number" min="0" step="0.01" defaultValue={plan?.max_price ?? ""} placeholder="75000" /></label>
      <label><span>Maximum discount %</span><input name="maxDiscountPercent" type="number" min="0" max="100" step="0.01" defaultValue={plan?.max_discount_percent ?? 0} /></label>
      <label><span>Proposal valid for days</span><input name="offerValidDays" type="number" min="1" max="365" defaultValue={plan?.offer_valid_days ?? 14} /></label>
      <label className={styles.checkboxField}><input name="requiresApproval" type="checkbox" defaultChecked={plan?.requires_approval ?? false} /><span>Always require founder approval</span></label>
      <label className={styles.wideField}><span>Included features · one per line</span><textarea name="includedFeatures" defaultValue={plan ? lines(plan.included_features) : ""} maxLength={6000} required={plan?.status === "active"} placeholder={"Conversion-focused page\nWhatsApp enquiry flow\nMobile optimization"} /></label>
      <label className={styles.wideField}><span>Installment options · one per line</span><textarea name="installmentOptions" defaultValue={plan ? lines(plan.installment_options) : ""} maxLength={3000} placeholder={"50% to start\n50% before launch"} /></label>
      <label className={styles.wideField}><span>Optional add-ons · one per line</span><textarea name="addOns" defaultValue={plan ? lines(plan.add_ons) : ""} maxLength={4000} placeholder={"Google Business Profile setup\nMonthly maintenance"} /></label>
      <label><span>Plan state</span><select name="status" defaultValue={plan?.status === "active" ? "active" : "draft"}><option value="draft">Draft · cannot be selected</option><option value="active">Active · available to proposals</option></select></label>
      <div className={styles.formActions}><button type="submit">{plan ? "Save new version" : "Create pricing plan"}</button></div>
    </form>
  );
}
