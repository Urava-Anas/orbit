"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Check, Sparkles } from "lucide-react";
import {
  ORBIT_FEATURE_COMPARISON,
  ORBIT_PLANS,
  ORBIT_TRIAL_DAYS,
  monthlyEquivalent,
  planPrice,
  yearlySaving,
  type OrbitBillingInterval,
} from "@/lib/orbit-plans";
import styles from "./pricing.module.css";

const trialHref =
  "/login?notice=Your%2015-day%20Business%20trial%20begins%20when%20your%20workspace%20is%20provisioned.";
const enterpriseHref =
  "/login?notice=Enterprise%20access%20is%20arranged%20with%20the%20Orbit%20team.";

function displayPrice(value: number | null) {
  if (value === null) return "Custom";
  return `$${value}`;
}

function displayCell(value: boolean | string) {
  if (value === true) return <Check size={16} aria-label="Included" />;
  return value;
}

export function PricingExperience() {
  const [interval, setInterval] = useState<OrbitBillingInterval>("monthly");

  return (
    <>
      <section className={styles.hero}>
        <span className={styles.kicker}>Orbit pricing</span>
        <h1>One operating system. A plan for every stage.</h1>
        <p>
          Start with the complete Business experience for {ORBIT_TRIAL_DAYS} days.
          Keep the plan that matches the way your organisation actually runs.
        </p>

        <div className={styles.billingToggle} aria-label="Billing interval">
          <button
            type="button"
            className={interval === "monthly" ? styles.activeToggle : ""}
            onClick={() => setInterval("monthly")}
            aria-pressed={interval === "monthly"}
          >
            Monthly
          </button>
          <button
            type="button"
            className={interval === "yearly" ? styles.activeToggle : ""}
            onClick={() => setInterval("yearly")}
            aria-pressed={interval === "yearly"}
          >
            Yearly <span>2 months free</span>
          </button>
        </div>
      </section>

      <section className={styles.planGrid} aria-label="Orbit subscription plans">
        {ORBIT_PLANS.map((plan) => {
          const price = planPrice(plan, interval);
          const saving = yearlySaving(plan);
          const equivalent = monthlyEquivalent(plan);

          return (
            <article
              key={plan.key}
              className={`${styles.planCard} ${plan.recommended ? styles.recommended : ""}`}
            >
              {plan.recommended ? (
                <div className={styles.popularBadge}>
                  <Sparkles size={13} aria-hidden="true" /> Most popular
                </div>
              ) : null}

              <div className={styles.planTop}>
                <span>{plan.eyebrow}</span>
                <h2>{plan.name}</h2>
                <p>{plan.description}</p>
              </div>

              <div className={styles.priceBlock}>
                <strong>{displayPrice(price)}</strong>
                {price !== null ? (
                  <small>/{interval === "yearly" ? "year" : "month"}</small>
                ) : null}
              </div>

              {interval === "yearly" && equivalent !== null && saving !== null ? (
                <div className={styles.savingLine}>
                  ${equivalent.toFixed(2)}/mo equivalent · save ${saving}/yr
                </div>
              ) : (
                <div className={styles.savingLine}>
                  {plan.key === "enterprise"
                    ? "Designed around your organisation"
                    : "Plan activation is manual until checkout goes live"}
                </div>
              )}

              <Link
                href={plan.key === "enterprise" ? enterpriseHref : trialHref}
                className={`${styles.planCta} ${plan.recommended ? styles.primaryCta : ""}`}
              >
                {plan.key === "enterprise" ? "Talk to Orbit" : `Start ${ORBIT_TRIAL_DAYS}-day trial`}
                <ArrowRight size={16} aria-hidden="true" />
              </Link>

              <div className={styles.featureList}>
                {plan.features.map((feature) => (
                  <div key={feature}>
                    <Check size={15} aria-hidden="true" />
                    <span>{feature}</span>
                  </div>
                ))}
              </div>
            </article>
          );
        })}
      </section>

      <section className={styles.trialBand}>
        <div>
          <span>Start with the real product</span>
          <h2>{ORBIT_TRIAL_DAYS} days on Business. No crippled demo.</h2>
        </div>
        <p>
          Your trial includes the Business operating experience so you can test Orbit
          with real workflows, real team structure and real founder visibility before
          choosing a paid plan.
        </p>
        <Link href={trialHref} className={styles.bandCta}>
          Start free trial <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </section>

      <section className={styles.comparisonSection}>
        <div className={styles.sectionHeading}>
          <span>Compare plans</span>
          <h2>Choose by operating complexity, not feature clutter.</h2>
        </div>

        <div className={styles.comparisonWrap}>
          <table className={styles.comparisonTable}>
            <thead>
              <tr>
                <th>Capability</th>
                {ORBIT_PLANS.map((plan) => (
                  <th key={plan.key}>{plan.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ORBIT_FEATURE_COMPARISON.map((row) => (
                <tr key={row.label}>
                  <th>{row.label}</th>
                  <td>{displayCell(row.founder)}</td>
                  <td>{displayCell(row.business)}</td>
                  <td>{displayCell(row.autopilot)}</td>
                  <td>{displayCell(row.enterprise)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.bottomCta}>
        <span>Founder-first. Organisation-ready.</span>
        <h2>Run the company. Not the chaos.</h2>
        <p>Open a Business trial now and decide the permanent plan after Orbit proves its value.</p>
        <Link href={trialHref} className={styles.bottomButton}>
          Start {ORBIT_TRIAL_DAYS}-day trial <ArrowRight size={17} aria-hidden="true" />
        </Link>
      </section>
    </>
  );
}
