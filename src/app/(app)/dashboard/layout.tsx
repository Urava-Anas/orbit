import Link from "next/link";
import { OrbitMark } from "@/components/OrbitMark";
import { AppNavigation } from "@/components/AppNavigation";
import { WorkspaceSwitcher } from "@/components/WorkspaceSwitcher";
import { humanize } from "@/lib/format";
import { readWorkspaceSubscription } from "@/lib/subscription";
import { listFounderWorkspaces, requireWorkspace } from "@/lib/workspace";
import { getWorkspaceProfile } from "@/lib/workspace-profile";
import experienceStyles from "./WorkspaceExperience.module.css";
import layoutStyles from "./DashboardLayout.module.css";

export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { supabase, user, role, workspace } = await requireWorkspace();
  const [workspaceOptions, subscription] = await Promise.all([
    listFounderWorkspaces(),
    readWorkspaceSubscription(supabase, workspace.id),
  ]);
  const profile = getWorkspaceProfile(workspace);
  const initial = (user.user_metadata.full_name ?? user.email ?? "O")
    .slice(0, 1)
    .toUpperCase();
  const shellClassName =
    profile.experience === "apex"
      ? `app-shell ${experienceStyles.apexWorkspace}`
      : "app-shell";
  const billingAttention = ["expired", "past_due", "cancelled"].includes(
    subscription.effectiveStatus,
  );

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
        <header className={`topbar ${layoutStyles.topbar}`}>
          <AppNavigation
            mobile
            experience={profile.experience}
            workspaceName={workspace.name}
            productLabel={profile.productLabel}
          />

          <div className={layoutStyles.mobileWorkspace}>
            <WorkspaceSwitcher
              compact
              currentWorkspace={workspace}
              workspaces={workspaceOptions}
            />
          </div>

          <span className={`topbar-context ${layoutStyles.context}`}>
            {profile.topbarContext}
          </span>
          <div className={`topbar-user ${layoutStyles.user}`}>
            <span>
              {humanize(role)} · {user.email}
            </span>
            <span className="avatar" aria-hidden="true">
              {initial}
            </span>
          </div>
        </header>

        {subscription.isTrial || billingAttention ? (
          <Link
            href="/dashboard/billing"
            className={`${layoutStyles.subscriptionStrip} ${
              billingAttention ? layoutStyles.subscriptionAttention : ""
            }`}
          >
            <span>
              {subscription.isTrial
                ? `Business trial · ${subscription.trialDaysRemaining ?? 0} days left`
                : subscription.effectiveStatus === "expired"
                  ? "Trial ended · workspace writes are paused"
                  : subscription.effectiveStatus === "past_due"
                    ? "Billing needs attention"
                    : "Subscription cancelled · workspace writes are paused"}
            </span>
            <strong>{subscription.isTrial ? "Choose plan" : "Open Plan & Billing"} →</strong>
          </Link>
        ) : null}

        {children}
      </main>
    </div>
  );
}
