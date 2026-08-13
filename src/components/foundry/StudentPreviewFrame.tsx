import Link from "next/link";
import {
  Bell,
  BookOpen,
  CalendarDays,
  FileText,
  House,
  Map,
  Orbit,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";

export type StudentPreviewSection =
  | "home"
  | "map"
  | "classes"
  | "resources"
  | "tasks"
  | "studio"
  | "profile";

const links = [
  { key: "home", label: "Home", icon: House },
  { key: "map", label: "Map", icon: Map },
  { key: "classes", label: "Classes", icon: CalendarDays },
  { key: "resources", label: "Resources", icon: FileText },
  { key: "tasks", label: "Tasks", icon: BookOpen },
  { key: "studio", label: "Studio", icon: Sparkles },
  { key: "profile", label: "Profile", icon: UserRound },
] as const;

export function StudentPreviewFrame({
  active,
  children,
  foundryId,
  studentId,
  unreadCount = 0,
}: {
  active: StudentPreviewSection;
  children: React.ReactNode;
  foundryId: string;
  studentId: string;
  unreadCount?: number;
}) {
  const memberRoot = `/dashboard/people/${studentId}`;

  function href(section: StudentPreviewSection) {
    return `${memberRoot}?view=member&tab=${section}`;
  }

  return (
    <div className="student-shell is-founder-preview">
      <header className="student-shell-header">
        <Link className="student-brand" href={href("home")}>
          <span><Orbit aria-hidden="true" size={18} /></span>
          <strong>Orbit <small>by Urava</small></strong>
        </Link>
        <span className="student-header-promise">One record · One journey · One next move</span>
        <span className="student-notification-link" aria-label={`${unreadCount} unread Foundry updates`}>
          <Bell aria-hidden="true" size={17} />
          <span>Updates</span>
          {unreadCount ? <b>{unreadCount > 9 ? "9+" : unreadCount}</b> : null}
        </span>
        <span className="student-role-pill">
          <ShieldCheck aria-hidden="true" size={16} />
          <span><strong>View as student</strong><small>{foundryId} · read-only preview</small></span>
        </span>
      </header>

      <main className="student-shell-main" id="student-preview-main">
        {children}
      </main>

      <nav className="student-nav" aria-label="Student preview navigation">
        {links.map(({ key, label, icon: Icon }) => (
          <Link
            aria-current={active === key ? "page" : undefined}
            className={`student-nav-link ${active === key ? "is-active" : ""}`}
            href={href(key)}
            key={key}
          >
            <Icon aria-hidden="true" size={20} strokeWidth={2.1} />
            <span>{label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
