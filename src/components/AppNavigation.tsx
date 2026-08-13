"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Banknote,
  Building2,
  Crosshair,
  FileCheck2,
  FolderKanban,
  GraduationCap,
  LayoutDashboard,
  Menu,
  MessageSquareText,
  PlugZap,
  ShieldCheck,
  UsersRound,
  X,
} from "lucide-react";
import styles from "./AppNavigation.module.css";

const links = [
  { href: "/dashboard", label: "Founder Command", icon: LayoutDashboard },
  { href: "/dashboard/foundry", label: "Foundry OS", icon: GraduationCap },
  { href: "/dashboard/leads", label: "Growth", icon: UsersRound },
  { href: "/dashboard/sales", label: "Sales Desk", icon: Crosshair },
  { href: "/dashboard/projects", label: "Delivery", icon: FolderKanban },
  { href: "/dashboard/cash", label: "Finance", icon: Banknote },
  { href: "/dashboard/proof", label: "Evidence", icon: FileCheck2 },
  { href: "/dashboard/content", label: "Publishing", icon: MessageSquareText },
  { href: "/dashboard/connect", label: "Connect", icon: PlugZap },
  { href: "/dashboard/organisation", label: "Organisation", icon: Building2 },
  { href: "/dashboard/security", label: "Security", icon: ShieldCheck },
] as const;

type AppNavigationProps = {
  mobile?: boolean;
};

function isActive(pathname: string, href: string) {
  return href === "/dashboard" ? pathname === href : pathname.startsWith(href);
}

export function AppNavigation({ mobile = false }: AppNavigationProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
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
        onClick={() => setOpen(true)}
      >
        <Menu size={19} aria-hidden="true" />
      </button>

      {open ? (
        <>
          <button
            type="button"
            className={styles.backdrop}
            aria-label="Close Orbit navigation"
            onClick={() => setOpen(false)}
          />
          <aside className={styles.drawer} role="dialog" aria-modal="true" aria-label="Orbit navigation">
            <div className={styles.drawerHeader}>
              <div className={styles.drawerBrand}>
                <span className={styles.brandMark} aria-hidden="true" />
                <div>
                  <strong>Orbit</strong>
                  <small>Organisation workspace</small>
                </div>
              </div>
              <button type="button" className={styles.closeButton} aria-label="Close navigation" onClick={() => setOpen(false)}>
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
                    onClick={() => setOpen(false)}
                    className={`${styles.mobileLink} ${active ? styles.mobileLinkActive : ""}`}
                  >
                    <Icon size={17} strokeWidth={1.8} aria-hidden="true" />
                    {label}
                  </Link>
                );
              })}
            </nav>

            <div className={styles.drawerFooter}>
              <span><i aria-hidden="true" /> Organisation isolated · secure workspace</span>
            </div>
          </aside>
        </>
      ) : null}
    </div>
  );
}
