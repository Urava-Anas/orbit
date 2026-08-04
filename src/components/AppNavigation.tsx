"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
  Search,
  ShieldCheck,
  UsersRound,
} from "lucide-react";

const links = [
  { href: "/dashboard", label: "Founder Command", icon: LayoutDashboard },
  { href: "/dashboard/foundry", label: "Foundry OS", icon: GraduationCap },
  { href: "/dashboard/leads", label: "Growth", icon: UsersRound, exact: true },
  { href: "/dashboard/sales", label: "Sales Desk", icon: Crosshair },
  { href: "/dashboard/leads/finder", label: "Lead Finder", icon: Search },
  { href: "/dashboard/projects", label: "Delivery", icon: FolderKanban },
  { href: "/dashboard/cash", label: "Finance", icon: Banknote },
  { href: "/dashboard/proof", label: "Evidence", icon: FileCheck2 },
  { href: "/dashboard/content", label: "Publishing", icon: MessageSquareText },
  { href: "/dashboard/organisation", label: "Organisation", icon: Building2 },
  { href: "/dashboard/settings", label: "Security", icon: ShieldCheck },
] as const;

type AppNavigationProps = {
  mobile?: boolean;
};

export function AppNavigation({ mobile = false }: AppNavigationProps) {
  const pathname = usePathname();
  const list = (
    <nav className={mobile ? "mobile-nav-links" : "nav-list"} aria-label="Orbit operating domains">
      {links.map(({ href, label, icon: Icon, ...options }) => {
        const active =
          href === "/dashboard" || "exact" in options
            ? pathname === href
            : pathname.startsWith(href);

        return (
          <Link
            className={`nav-link ${active ? "nav-link-active" : ""}`}
            href={href}
            key={href}
          >
            <Icon size={16} strokeWidth={1.8} aria-hidden="true" />
            {label}
          </Link>
        );
      })}
    </nav>
  );

  if (!mobile) return list;

  return (
    <details className="mobile-nav">
      <summary className="button button-quiet" aria-label="Open navigation">
        <Menu size={19} aria-hidden="true" />
      </summary>
      {list}
    </details>
  );
}
