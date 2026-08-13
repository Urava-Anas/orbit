"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  CalendarDays,
  FileText,
  Gauge,
  House,
  Map,
  Sparkles,
  UserRound,
  UsersRound,
  Workflow,
} from "lucide-react";

const founderLinks = [
  { href: "/dashboard/development", label: "Command", icon: House },
  { href: "/dashboard/people", label: "Members", icon: UsersRound },
  { href: "/dashboard/development/journey", label: "Map", icon: Map },
  { href: "/dashboard/development/sessions", label: "Classes", icon: CalendarDays },
  { href: "/dashboard/development/notes", label: "Notes", icon: FileText },
  { href: "/dashboard/tasks", label: "Tasks", icon: BookOpen },
  { href: "/dashboard/projects?view=delivery", label: "Studio Work", icon: Sparkles },
  { href: "/dashboard/development/operations", label: "Activity", icon: Workflow },
] as const;

const studentLinks = [
  { href: "/portal", label: "Home", icon: House },
  { href: "/portal/journey", label: "Map", icon: Map },
  { href: "/portal/sessions", label: "Classes", icon: CalendarDays },
  { href: "/portal/resources", label: "Resources", icon: FileText },
  { href: "/portal/tasks", label: "Tasks", icon: BookOpen },
  { href: "/portal/work", label: "Studio", icon: Sparkles },
  { href: "/portal/profile", label: "Profile", icon: UserRound },
] as const;

export function FounderFoundryNavigation() {
  const pathname = usePathname();

  return (
    <nav className="foundry-nav" aria-label="Foundry founder navigation">
      {founderLinks.map(({ href, label, icon: Icon }) => {
        const route = href.split("?")[0];
        const active =
          route === "/dashboard/development"
            ? pathname === route
            : pathname.startsWith(route);
        return (
          <Link
            className={`foundry-nav-link ${active ? "is-active" : ""}`}
            href={href}
            key={href}
            aria-current={active ? "page" : undefined}
          >
            <Icon aria-hidden="true" size={19} strokeWidth={2} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function StudentFoundryNavigation() {
  const pathname = usePathname();

  return (
    <nav className="student-nav" aria-label="Foundry student navigation">
      {studentLinks.map(({ href, label, icon: Icon }) => {
        const active =
          href === "/portal" ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            className={`student-nav-link ${active ? "is-active" : ""}`}
            href={href}
            key={href}
            aria-current={active ? "page" : undefined}
          >
            <Icon aria-hidden="true" size={20} strokeWidth={2.1} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function FoundryMiniMark() {
  return (
    <span className="foundry-mini-mark" aria-hidden="true">
      <Gauge size={18} strokeWidth={2.3} />
    </span>
  );
}
