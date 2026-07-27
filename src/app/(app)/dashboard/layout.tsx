import { OrbitMark } from "@/components/OrbitMark";
import { AppNavigation } from "@/components/AppNavigation";
import { humanize } from "@/lib/format";
import { requireWorkspace } from "@/lib/workspace";

export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { user, role, workspace } = await requireWorkspace();
  const initial = (user.user_metadata.full_name ?? user.email ?? "O")
    .slice(0, 1)
    .toUpperCase();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <OrbitMark />
        <div className="sidebar-workspace">
          <small>Active organisation</small>
          <strong>{workspace.name}</strong>
        </div>
        <AppNavigation />
        <div className="sidebar-foot">
          <div className="sidebar-status">
            <i aria-hidden="true" />
            Organisation isolated
          </div>
        </div>
      </aside>

      <main className="app-main">
        <header className="topbar">
          <AppNavigation mobile />
          <span className="topbar-context">Decisions → Execution → Evidence</span>
          <div className="topbar-user">
            <span>
              {humanize(role)} · {user.email}
            </span>
            <span className="avatar" aria-hidden="true">
              {initial}
            </span>
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}
