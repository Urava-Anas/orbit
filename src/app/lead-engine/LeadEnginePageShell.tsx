"use client";

import Link from "next/link";
import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import {
  TbActivity,
  TbBriefcase2,
  TbFileDescription,
  TbFlask2,
  TbLayoutDashboard,
  TbMail,
  TbReceiptDollar,
  TbShieldCheck,
  TbStack2,
  TbTargetArrow,
} from "react-icons/tb";
import { LuOrbit } from "react-icons/lu";
import styles from "./lead-engine.module.css";

type Icon = ComponentType<{ className?: string; "aria-hidden"?: boolean }>;

const navigation: Array<{
  label: string;
  icon: Icon;
  href?: string;
  badge?: string;
  comingSoon?: boolean;
}> = [
  { label: "Lead Engine", icon: TbTargetArrow, href: "/lead-engine" },
  { label: "Overview", icon: TbLayoutDashboard, href: "/dashboard" },
  { label: "Inbox", icon: TbMail, href: "/dashboard/leads", badge: "6" },
  { label: "Studio", icon: TbBriefcase2, href: "/dashboard/projects" },
  { label: "Foundry", icon: TbStack2, href: "/dashboard/foundry" },
  { label: "Labs", icon: TbFlask2 },
  { label: "Proof", icon: TbShieldCheck, href: "/dashboard/proof" },
  { label: "Policies", icon: TbFileDescription },
  { label: "Pricing Model", icon: TbReceiptDollar, comingSoon: true },
];

export function LeadEnginePageShell({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar} aria-label="Orbit navigation">
        <Link className={styles.brand} href="/lead-engine" aria-label="Orbit Lead Engine home">
          <LuOrbit className={styles.brandIcon} aria-hidden />
          <span>Orbit</span>
        </Link>

        <nav className={styles.navigation} aria-label="Product sections">
          {navigation.map(({ label, icon: NavIcon, href, badge, comingSoon }) => {
            const content = (
              <>
                <NavIcon className={styles.navIcon} aria-hidden />
                <span>{label}</span>
                {badge ? <b className={styles.navBadge}>{badge}</b> : null}
                {comingSoon ? <b className={styles.soonBadge}>Soon</b> : null}
              </>
            );

            if (href) {
              return (
                <Link
                  className={`${styles.navItem} ${label === "Lead Engine" ? styles.navItemActive : ""}`}
                  href={href}
                  key={label}
                  aria-current={label === "Lead Engine" ? "page" : undefined}
                >
                  {content}
                </Link>
              );
            }

            return (
              <button
                className={styles.navItem}
                type="button"
                key={label}
                onClick={() =>
                  setToast(
                    comingSoon
                      ? "Pricing Model is reserved for the next build phase."
                      : `${label} will open from this workspace in the full product.`,
                  )
                }
              >
                {content}
              </button>
            );
          })}
        </nav>

        <div className={styles.sidebarFooter}>
          <button
            className={styles.organisation}
            type="button"
            onClick={() => setToast("Organisation switcher is disabled in the public preview.")}
          >
            <span>Urava Studio</span>
            <small>Founder</small>
          </button>
          <p>Public product preview</p>
          <p>Demo data only</p>
        </div>
      </aside>

      <main className={styles.main}>{children}</main>

      <div className={`${styles.toast} ${toast ? styles.toastVisible : ""}`} role="status" aria-live="polite">
        <TbActivity aria-hidden />
        {toast}
      </div>
    </div>
  );
}
