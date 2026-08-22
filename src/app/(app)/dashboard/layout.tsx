import { OrbitMark } from "@/components/OrbitMark";
import { AppNavigation } from "@/components/AppNavigation";
import { WorkspaceSwitcher } from "@/components/WorkspaceSwitcher";
import { humanize } from "@/lib/format";
import { listFounderWorkspaces, requireWorkspace } from "@/lib/workspace";
import { getWorkspaceProfile } from "@/lib/workspace-profile";
import styles from "./WorkspaceExperience.module.css";

export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { user, role, workspace } = await requireWorkspace();
  const workspaceOptions = await listFounderWorkspaces();
  const profile = getWorkspaceProfile(workspace);
  const initial = (user.user_metadata.full_name ?? user.email ?? "O")
    .slice(0, 1)
    .toUpperCase();
  const shellClassName =
    profile.experience === "apex"
      ? `app-shell ${styles.apexWorkspace}`
      : "app-shell";

  return (
    <div className={shellClassName} data-workspace-experience={profile.experience}>
      <aside className="sidebar">
        <OrbitMark />
        <WorkspaceSwitcher
          currentWorkspace={workspace}
          workspaces={workspaceOptions}
        />
        <AppNavigation
          experience={profile.experience}
          workspaceName={workspace.name}
          productLabel={profile.productLabel}
        />
        <div className="sidebar-foot">
          <div className="sidebar-status">
            <i aria-hidden="true" />
            {profile.sidebarStatus}
          </div>
        </div>
      </aside>

      <main className="app-main">
        <header className="topbar">
          <AppNavigation
            mobile
            experience={profile.experience}
            workspaceName={workspace.name}
            productLabel={profile.productLabel}
          />
          <span className="topbar-context">{profile.topbarContext}</span>
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
