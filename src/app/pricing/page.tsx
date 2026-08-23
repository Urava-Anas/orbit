import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { OrbitMark } from "@/components/OrbitMark";
import { PricingExperience } from "./PricingExperience";
import styles from "./pricing.module.css";

export const metadata: Metadata = {
  title: "Pricing · Orbit",
  description:
    "Orbit plans for founders and organisations, with a 15-day Business trial.",
};

const trialHref =
  "/login?notice=Your%2015-day%20Business%20trial%20begins%20when%20your%20workspace%20is%20provisioned.";

export default function PricingPage() {
  return (
    <main className={styles.pricingPage}>
      <nav className={styles.nav} aria-label="Pricing navigation">
        <Link href="/" aria-label="Orbit home" className={styles.brandLink}>
          <OrbitMark />
        </Link>
        <div className={styles.navActions}>
          <Link href="/" className={styles.backLink}>
            <ArrowLeft size={14} aria-hidden="true" /> Product
          </Link>
          <Link href="/login" className={styles.signInLink}>
            Sign in
          </Link>
          <Link href={trialHref} className={styles.navCta}>
            Start free trial
          </Link>
        </div>
      </nav>

      <PricingExperience />

      <footer className={styles.footer}>
        <OrbitMark />
        <span>One secure operating layer for the organisation.</span>
      </footer>
    </main>
  );
}
