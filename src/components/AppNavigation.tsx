"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Banknote,
  Blocks,
  Building2,
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
  const [openPath, setOpenPath] = useState<string | null>(null);
  const open = openPath === pathname;
  const links = experience === "apex" ? apexLinks : orbitLinks;

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenPath(null);
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

  return (
    <div className={`mobile-nav ${styles.mobileNav}`}>
      <button
        type="button"
        className={`button button-quiet ${styles.menuButton}`}
        aria-label="Open Orbit navigation"
        aria-expanded={open}
        onClick={() => setOpenPath(pathname)}
      >
        <Menu size={19} aria-hidden="true" />
      </button>

      {open ? (
        <>
          <button
            type="button"
            className={styles.backdrop}
            aria-label="Close Orbit navigation"
            onClick={() => setOpenPath(null)}
          />
          <aside className={styles.drawer} role="dialog" aria-modal="true" aria-label="Orbit navigation">
            <div className={styles.drawerHeader}>
              <div className={styles.drawerBrand}>
                <span className={styles.brandMark} aria-hidden="true" />
                <div>
                  <strong>{experience === "apex" ? workspaceName : "Orbit"}</strong>
                  <small>{productLabel}</small>
                </div>
              </div>
              <button type="button" className={styles.closeButton} aria-label="Close navigation" onClick={() => setOpenPath(null)}>
                <X size={17} aria-hidden="true" />
              </button>
            </div>

            <nav className={styles.mobileLinks} aria-label="Orbit operating domains">
              {links.map(({ href, label, icon: Icon }) => {
                const active = isActive(pathname, href);
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setOpenPath(null)}
                    className={`${styles.mobileLink} ${active ? styles.mobileLinkActive : ""}`}
                  >
                    <Icon size={17} strokeWidth={1.8} aria-hidden="true" />
                    {label}
                  </Link>
                );
              })}
            </nav>

            <div className={styles.drawerFooter}>
              <span><i aria-hidden="true" /> {workspaceName} · secure workspace</span>
            </div>
          </aside>
        </>
      ) : null}
    </div>
  );
}
