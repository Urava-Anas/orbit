"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, BarChart3, CalendarDays, Gauge, Library, Settings2, Sparkles } from "lucide-react";
import styles from "./ContentEngineNav.module.css";

const links = [
  { href: "/dashboard/content", label: "Today", icon: Sparkles },
  { href: "/dashboard/content/impact", label: "Impact", icon: Gauge },
  { href: "/dashboard/content/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/dashboard/content/library", label: "Library", icon: Library },
  { href: "/dashboard/content/intelligence", label: "Intelligence", icon: BarChart3 },
  { href: "/dashboard/content/activity", label: "Activity", icon: Activity },
  { href: "/dashboard/content/settings", label: "Settings", icon: Settings2 },
] as const;

export function ContentEngineNav() {
  const pathname = usePathname();
  return (
    <nav className={styles.nav} aria-label="Content Engine sections">
      <div className={styles.scroll}>
        {links.map(({ href, label, icon: Icon }) => {
          const active = href === "/dashboard/content" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link className={`${styles.link} ${active ? styles.active : ""}`} href={href} key={href}>
              <Icon size={14} strokeWidth={1.8} aria-hidden="true" />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
