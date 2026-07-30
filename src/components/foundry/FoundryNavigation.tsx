"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  CalendarDays,
  Gauge,
  House,
  PlugZap,
  Workflow,
  Send,
  Sparkles,
  Trophy,
  UserRound,
  UsersRound,
} from "lucide-react";

const founderLinks = [
  { href: "/dashboard/foundry", label: "Command", icon: House },
  { href: "/dashboard/foundry/students", label: "Students", icon: UsersRound },
  { href: "/dashboard/foundry/classes", label: "Classes", icon: CalendarDays },
  { href: "/dashboard/foundry/tasks", label: "Tasks", icon: BookOpen },
  { href: "/dashboard/foundry/progress?view=studio", label: "Studio", icon: Sparkles },
  { href: "/dashboard/foundry/operations", label: "Ops", icon: Workflow },
  { href: "/dashboard/foundry/integrations", label: "Connect", icon: PlugZap },
] as const;

const studentLinks = [
  { href: "/learn", label: "Today", icon: House },
  { href: "/learn/learn", label: "Learn", icon: BookOpen },
  { href: "/learn/submit", label: "Submit", icon: Send },
  { href: "/learn/progress", label: "Progress", icon: Trophy },
  { href: "/learn/profile", label: "Profile", icon: UserRound },
] as const;

export function FounderFoundryNavigation() {
  const pathname = usePathname();

  return (
    <nav className="foundry-nav" aria-label="Foundry founder navigation">
      {founderLinks.map(({ href, label, icon: Icon }) => {
        const path = href.split("?")[0];
        const active =
          path === "/dashboard/foundry"
            ? pathname === path
            : pathname.startsWith(path);
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
