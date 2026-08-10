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
  { href: "/dashboard/foundry", label: "Command", icon: House },
  { href: "/dashboard/foundry/students", label: "Members", icon: UsersRound },
  { href: "/dashboard/foundry/map", label: "Map", icon: Map },
  { href: "/dashboard/foundry/classes", label: "Classes", icon: CalendarDays },
  { href: "/dashboard/foundry/notes", label: "Notes", icon: FileText },
  { href: "/dashboard/foundry/tasks", label: "Tasks", icon: BookOpen },
  { href: "/dashboard/foundry/studio", label: "Studio", icon: Sparkles },
  { href: "/dashboard/foundry/operations", label: "Activity", icon: Workflow },
] as const;

const studentLinks = [
  { href: "/learn", label: "Home", icon: House },
  { href: "/learn/progress", label: "Map", icon: Map },
  { href: "/learn/classes", label: "Classes", icon: CalendarDays },
  { href: "/learn/resources", label: "Resources", icon: FileText },
  { href: "/learn/tasks", label: "Tasks", icon: BookOpen },
  { href: "/learn/studio", label: "Studio", icon: Sparkles },
  { href: "/learn/profile", label: "Profile", icon: UserRound },
] as const;

export function FounderFoundryNavigation() {
  const pathname = usePathname();

  return (
    <nav className="foundry-nav" aria-label="Foundry founder navigation">
      {founderLinks.map(({ href, label, icon: Icon }) => {
        const active =
          href === "/dashboard/foundry"
            ? pathname === href
            : pathname.startsWith(href);
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
          href === "/learn" ? pathname === href : pathname.startsWith(href);
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
