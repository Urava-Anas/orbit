"use client";

import { useState } from "react";
import { Check, Sparkles } from "lucide-react";
import {
  ORBIT_PLANS,
  monthlyEquivalent,
  planPrice,
  yearlySaving,
  type OrbitBillingInterval,
  type OrbitPlanKey,
} from "@/lib/orbit-plans";
import { requestOrbitPlan } from "./actions";
import styles from "./billing.module.css";

type BillingPlanChooserProps = {
  currentPlanKey: OrbitPlanKey;
  currentStatus: string;
  pendingPlanKey?: OrbitPlanKey | null;
};

export function BillingPlanChooser({
  currentPlanKey,
  currentStatus,
  pendingPlanKey,
}: BillingPlanChooserProps) {
  const [interval, setInterval] = useState<OrbitBillingInterval>("monthly");

  return (
    <section className={styles.planChooser}>
      <div className={styles.chooserHead}>
        <div>
          <span className="section-kicker">Plans</span>
          <h2>Choose the operating level you need.</h2>
          <p>Plan changes are recorded now. Online checkout will attach here later.</p>
        </div>
        <div className={styles.intervalToggle} aria-label="Billing interval">
          <button
            type="button"
            className={interval === "monthly" ? styles.intervalActive : ""}
            onClick={() => setInterval("monthly")}
            aria-pressed={interval === "monthly"}
          >
            Monthly
          </button>
          <button
            type="button"
            className={interval === "yearly" ? styles.intervalActive : ""}
            onClick={() => setInterval("yearly")}
            aria-pressed={interval === "yearly"}
          >
            Yearly <span>2 months free</span>
          </button>
        </div>
      </div>

      <div className={styles.planGrid}>
        {ORBIT_PLANS.map((plan) => {
          const price = planPrice(plan, interval);
          const equivalent = monthlyEquivalent(plan);
          const saving = yearlySaving(plan);
          const isCurrent = plan.key === currentPlanKey;
          const isPending = plan.key === pendingPlanKey;
          const isCompedCurrent = isCurrent && currentStatus === "comped";

          return (
            <article
              className={`${styles.planCard} ${plan.recommended ? styles.recommended : ""}`}
              key={plan.key}
            >
              <div className={styles.planTitleRow}>
                <div>
                  <span>{plan.eyebrow}</span>
                  <h3>{plan.name}</h3>
                </div>
                {plan.recommended ? (
                  <em><Sparkles size={12} aria-hidden="true" /> Popular</em>
                ) : null}
              </div>

              <p className={styles.planDescription}>{plan.description}</p>

              <div className={styles.price}>
                <strong>{price === null ? "Custom" : `$${price}`}</strong>
                {price !== null ? <small>/{interval === "yearly" ? "year" : "month"}</small> : null}
              </div>

              <div className={styles.priceNote}>
                {interval === "yearly" && equivalent !== null && saving !== null
                  ? `$${equivalent.toFixed(2)}/mo equivalent · save $${saving}/yr`
                  : plan.key === "enterprise"
                    ? "Custom commercial agreement"
                    : "Workspace subscription"}
              </div>

              <form action={requestOrbitPlan}>
                <input type="hidden" name="plan_key" value={plan.key} />
                <input
                  type="hidden"
                  name="billing_interval"
                  value={plan.key === "enterprise" ? "custom" : interval}
                />
                <button
                  type="submit"
                  className={`${styles.chooseButton} ${plan.recommended ? styles.primaryButton : ""}`}
                  disabled={isCompedCurrent || isPending}
                >
                  {isPending
                    ? "Selection saved"
                    : isCompedCurrent
                      ? "Current managed plan"
                      : isCurrent && currentStatus !== "trialing"
                        ? "Keep this plan"
                        : `Select ${plan.name}`}
                </button>
              </form>

              <div className={styles.featureList}>
                {plan.features.map((feature) => (
                  <div key={feature}>
                    <Check size={14} aria-hidden="true" />
                    <span>{feature}</span>
                  </div>
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
