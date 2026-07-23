"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Banknote,
  FileCheck2,
  FolderKanban,
  LayoutDashboard,
  Menu,
  MessageSquareText,
  Settings,
  UsersRound,
} from "lucide-react";

const links = [
  { href: "/dashboard", label: "Command Center", icon: LayoutDashboard },
  { href: "/dashboard/leads", label: "Leads", icon: UsersRound },
  { href: "/dashboard/projects", label: "Projects", icon: FolderKanban },
  { href: "/dashboard/cash", label: "Cash", icon: Banknote },
  { href: "/dashboard/proof", label: "Proof", icon: FileCheck2 },
  { href: "/dashboard/content", label: "Content", icon: MessageSquareText },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
] as const;

type AppNavigationProps = {
  mobile?: boolean;
};

export function AppNavigation({ mobile = false }: AppNavigationProps) {
  const pathname = usePathname();
  const list = (
    <nav className={mobile ? "mobile-nav-links" : "nav-list"} aria-label="Orbit modules">
      {links.map(({ href, label, icon: Icon }) => {
        const active =
          href === "/dashboard" ? pathname === href : pathname.startsWith(href);

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

