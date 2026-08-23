"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, Check, Sparkles } from "lucide-react";
import {
  ORBIT_PLANS,
  ORBIT_TRIAL_DAYS,
  monthlyEquivalent,
  planPrice,
  yearlySaving,
  type OrbitBillingInterval,
} from "@/lib/orbit-plans";
import styles from "./OrbitPricingTable.module.css";

export function OrbitPricingTable() {
  const [interval, setInterval] = useState<OrbitBillingInterval>("monthly");

  return (
    <section className={styles.pricingSection} aria-labelledby="pricing-heading">
      <div className={styles.pricingHeading}>
        <div>
          <span className={styles.kicker}>Workspace-based pricing</span>
          <h2 id="pricing-heading">Choose how much Orbit should carry.</h2>
          <p>
            Every new workspace starts with {ORBIT_TRIAL_DAYS} days of Business.
            No card is required while payments are being connected.
          </p>
        </div>

        <div className={styles.toggle} aria-label="Billing interval">
          <button
            type="button"
            className={interval === "monthly" ? styles.toggleActive : ""}
            aria-pressed={interval === "monthly"}
            onClick={() => setInterval("monthly")}
          >
            Monthly
          </button>
          <button
            type="button"
            className={interval === "yearly" ? styles.toggleActive : ""}
            aria-pressed={interval === "yearly"}
            onClick={() => setInterval("yearly")}
          >
            Yearly <span>2 months free</span>
          </button>
        </div>
      </div>

      <div className={styles.grid}>
        {ORBIT_PLANS.map((plan) => {
          const price = planPrice(plan, interval);
          const saving = yearlySaving(plan);
          const equivalent = monthlyEquivalent(plan);

          return (
            <article
              key={plan.key}
              className={`${styles.card} ${plan.recommended ? styles.recommended : ""}`}
            >
              {plan.recommended ? (
                <span className={styles.recommendedLabel}>
                  <Sparkles size={13} aria-hidden="true" /> Most popular
                </span>
              ) : null}

              <div className={styles.cardTop}>
                <span className={styles.planEyebrow}>{plan.eyebrow}</span>
                <h3>{plan.name}</h3>
                <p>{plan.description}</p>
              </div>

              <div className={styles.priceBlock}>
                {price === null ? (
                  <>
                    <strong>Custom</strong>
                    <small>Built around your organisation</small>
                  </>
                ) : (
                  <>
                    <div>
                      <span>$</span>
                      <strong>{price.toLocaleString("en-US")}</strong>
                      <em>/{interval === "monthly" ? "mo" : "yr"}</em>
                    </div>
                    <small>
                      {interval === "yearly" && equivalent !== null
                        ? `$${equivalent.toFixed(2)}/mo equivalent · save $${saving}`
                        : "Cancel or change plan later"}
                    </small>
                  </>
                )}
              </div>

              <Link
                className={`${styles.cta} ${plan.recommended ? styles.ctaPrimary : ""}`}
                href={`/login?notice=${encodeURIComponent(
                  plan.key === "enterprise"
                    ? "Enterprise access is arranged with the Orbit team."
                    : `Your ${ORBIT_TRIAL_DAYS}-day Business trial begins when your workspace is provisioned.`,
                )}`}
              >
                {plan.key === "enterprise" ? "Talk about Enterprise" : `Start ${ORBIT_TRIAL_DAYS}-day trial`}
                <ArrowUpRight size={15} aria-hidden="true" />
              </Link>

              <div className={styles.divider} />

              <ul className={styles.features}>
                {plan.features.map((feature) => (
                  <li key={feature}>
                    <span><Check size={14} aria-hidden="true" /></span>
                    {feature}
                  </li>
                ))}
              </ul>
            </article>
          );
        })}
      </div>
    </section>
  );
}
