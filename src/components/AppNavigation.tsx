"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Banknote,
  Blocks,
  Building2,
  CreditCard,
  Crosshair,
  FileCheck2,
  FolderKanban,
  GraduationCap,
  LayoutDashboard,
  Menu,
  MessageSquareText,
  ShieldCheck,
  UsersRound,
  X,
} from "lucide-react";
import type { WorkspaceExperience } from "@/lib/workspace-profile";
import styles from "./AppNavigation.module.css";

const orbitLinks = [
  { href: "/dashboard", label: "Founder Command", icon: LayoutDashboard },
  { href: "/dashboard/foundry", label: "Foundry OS", icon: GraduationCap },
  { href: "/dashboard/leads", label: "Growth", icon: UsersRound },
  { href: "/dashboard/sales", label: "Sales Desk", icon: Crosshair },
  { href: "/dashboard/projects", label: "Delivery", icon: FolderKanban },
  { href: "/dashboard/cash", label: "Finance", icon: Banknote },
  { href: "/dashboard/proof", label: "Evidence", icon: FileCheck2 },
  { href: "/dashboard/content", label: "Publishing", icon: MessageSquareText },
  { href: "/dashboard/plugins", label: "Plugins", icon: Blocks },
  { href: "/dashboard/organisation", label: "Organisation", icon: Building2 },
  { href: "/dashboard/billing", label: "Plan & Billing", icon: CreditCard },
  { href: "/dashboard/security", label: "Security", icon: ShieldCheck },
] as const;

const apexLinks = [
  { href: "/dashboard", label: "Founder Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/leads", label: "Carrier Pipeline", icon: UsersRound },
  { href: "/dashboard/sales", label: "Sales & Onboarding", icon: Crosshair },
  { href: "/dashboard/projects", label: "Dispatch Operations", icon: FolderKanban },
  { href: "/dashboard/cash", label: "Revenue", icon: Banknote },
  { href: "/dashboard/proof", label: "Proof & Reviews", icon: FileCheck2 },
  { href: "/dashboard/content", label: "Marketing Content", icon: MessageSquareText },
  { href: "/dashboard/plugins", label: "Integrations", icon: Blocks },
  { href: "/dashboard/organisation", label: "Workspace", icon: Building2 },
  { href: "/dashboard/billing", label: "Plan & Billing", icon: CreditCard },
  { href: "/dashboard/security", label: "Security", icon: ShieldCheck },
] as const;

type AppNavigationProps = {
  mobile?: boolean;
  experience?: WorkspaceExperience;
  workspaceName?: string;
  productLabel?: string;
};

function isActive(pathname: string, href: string) {
  return href === "/dashboard" ? pathname === href : pathname.startsWith(href);
}

export function AppNavigation({
  mobile = false,
  experience = "orbit",
  workspaceName = "Orbit",
  productLabel = "Organisation workspace",
}: AppNavigationProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const links = experience === "apex" ? apexLinks : orbitLinks;
  const primaryCutoff = experience === "apex" ? 6 : 8;
  const primaryLinks = links.slice(0, primaryCutoff);
  const systemLinks = links.slice(primaryCutoff);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        requestAnimationFrame(() => triggerRef.current?.focus());
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!mobile) {
    return (
      <nav className="nav-list" aria-label="Orbit operating domains">
        {links.map(({ href, label, icon: Icon }) => (
          <Link
            className={`nav-link ${isActive(pathname, href) ? "nav-link-active" : ""}`}
            href={href}
            key={href}
          >
            <Icon size={16} strokeWidth={1.8} aria-hidden="true" />
            {label}
          </Link>
        ))}
      </nav>
    );
  }

  const closeMenu = () => {
    setOpen(false);
  };

  const drawer =
    mounted && open
      ? createPortal(
          <>
            <button
              type="button"
              className={styles.backdrop}
              aria-label="Close navigation"
              onClick={() => {
                closeMenu();
                requestAnimationFrame(() => triggerRef.current?.focus());
              }}
            />
            <aside
              className={`${styles.drawer} ${experience === "apex" ? styles.apexDrawer : ""}`}
              role="dialog"
              aria-modal="true"
              aria-label={`${workspaceName} navigation`}
            >
              <div className={styles.drawerHeader}>
                <div className={styles.drawerBrand}>
                  <span className={styles.brandMark} aria-hidden="true" />
                  <div>
                    <strong>{experience === "apex" ? workspaceName : "Orbit"}</strong>
                    <small>{productLabel}</small>
                  </div>
                </div>
                <button
                  ref={closeRef}
                  type="button"
                  className={styles.closeButton}
                  aria-label="Close navigation"
                  onClick={() => {
                    closeMenu();
                    requestAnimationFrame(() => triggerRef.current?.focus());
                  }}
                >
                  <X size={18} aria-hidden="true" />
                </button>
              </div>

              <div className={styles.drawerScroll}>
                <nav className={styles.mobileLinks} aria-label="Primary operating areas">
                  <span className={styles.groupLabel}>Operate</span>
                  {primaryLinks.map(({ href, label, icon: Icon }) => {
                    const active = isActive(pathname, href);
                    return (
                      <Link
                        key={href}
                        href={href}
                        onClick={closeMenu}
                        className={`${styles.mobileLink} ${active ? styles.mobileLinkActive : ""}`}
                      >
                        <span className={styles.linkIcon}>
                          <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
                        </span>
                        <span>{label}</span>
                      </Link>
                    );
                  })}
                </nav>

                <nav className={styles.mobileLinks} aria-label="Workspace controls">
                  <span className={styles.groupLabel}>Workspace</span>
                  {systemLinks.map(({ href, label, icon: Icon }) => {
                    const active = isActive(pathname, href);
                    return (
                      <Link
                        key={href}
                        href={href}
                        onClick={closeMenu}
                        className={`${styles.mobileLink} ${active ? styles.mobileLinkActive : ""}`}
                      >
                        <span className={styles.linkIcon}>
                          <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
                        </span>
                        <span>{label}</span>
                      </Link>
                    );
                  })}
                </nav>
              </div>

              <div className={styles.drawerFooter}>
                <span>
                  <i aria-hidden="true" /> {workspaceName}
                </span>
                <small>Secure workspace · isolated data</small>
              </div>
            </aside>
          </>,
          document.body,
        )
      : null;

  return (
    <div className={`mobile-nav ${styles.mobileNav}`}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.menuButton}
        aria-label={open ? "Close navigation" : "Open navigation"}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <Menu size={21} strokeWidth={1.8} aria-hidden="true" />
      </button>
      {drawer}
    </div>
  );
}
