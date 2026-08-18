import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Blocks,
  CheckCircle2,
  CircleAlert,
  Clock3,
  ExternalLink,
  KeyRound,
  LockKeyhole,
  PlugZap,
  ShieldCheck,
  Sparkles,
  Workflow,
} from "lucide-react";
import { GeoapifyConnectionFlow } from "@/components/plugins/GeoapifyConnectionFlow";
import { getGeoapifyRuntimeStatus } from "@/lib/geoapify";
import { requireWorkspace } from "@/lib/workspace";
import { getPluginBySlug, getPluginEvents } from "@/lib/plugins/catalog";
import {
  getWorkspacePluginConnections,
  providerLabel,
  resolvePluginAppConnections,
} from "@/lib/plugins/connections";
import { approvePluginUpdate, disablePlugin, enablePlugin, installPlugin, uninstallPlugin } from "../actions";
import styles from "./selected-plugin.module.css";

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ notice?: string; error?: string; connect?: string }>;
};

function humanModule(value: string) {
  return value.replaceAll("_", " ");
}

export default async function PluginDetailPage({ params, searchParams }: PageProps) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const { supabase, workspace, role } = await requireWorkspace();
  const plugin = await getPluginBySlug(supabase, workspace.id, slug);
  if (!plugin) notFound();

  const [events, workspaceConnections] = await Promise.all([
    getPluginEvents(supabase, workspace.id, plugin.catalog.id, 8),
    getWorkspacePluginConnections(supabase, workspace.id),
  ]);
  const appConnections = resolvePluginAppConnections(plugin.manifest, workspaceConnections);
  const requiredMissing = appConnections.filter((app) => app.required && !app.connected);
  const canManage = role === "owner" || role === "admin";
  const installation = plugin.installation?.status === "revoked" ? null : plugin.installation;
  const isGeoapify = slug === "geoapify-lead-discovery";
  const geoapify = isGeoapify ? await getGeoapifyRuntimeStatus(workspace.id) : null;
  const geoapifyFlowOpen = Boolean(isGeoapify && (query.connect === "1" || query.error || query.notice));

  const connected = Boolean(isGeoapify && geoapify?.connected);
  const statusLabel = connected
    ? "Connected"
    : !installation
      ? "Available"
      : installation.status === "pending_connections"
        ? "Needs connection"
        : installation.status === "pending_review"
          ? "Needs review"
          : installation.status === "disabled"
            ? "Disabled"
            : "Installed";
  const statusClass = connected
    ? styles.statusGood
    : !installation
      ? styles.statusReady
      : installation.status === "pending_connections" || installation.status === "pending_review"
        ? styles.statusWarn
        : installation.status === "installed"
          ? styles.statusGood
          : styles.statusMuted;

  const capabilities = [
    ...plugin.manifest.skills.map((item) => ({ id: `skill-${item.id}`, name: item.name, description: item.description, icon: "skill" as const })),
    ...plugin.manifest.workflows.map((item) => ({ id: `workflow-${item.id}`, name: item.name, description: item.description, icon: "workflow" as const })),
  ].slice(0, 4);

  const setupTime = isGeoapify ? "1–2 minutes" : "2–5 minutes";
  const firstWorkflow = plugin.manifest.workflows[0] ?? null;

  return (
    <main className={styles.page}>
      <Link className={styles.back} href="/dashboard/plugins"><ArrowLeft size={13} /> Back to plugins</Link>

      <section className={styles.hero}>
        <div className={styles.heroMain}>
          <div className={styles.logo}><Blocks size={34} /></div>
          <div>
            <div className={styles.eyebrow}>
              {plugin.catalog.verified ? <><BadgeCheck size={12} /> Orbit reviewed</> : <>Orbit plugin</>}
            </div>
            <h1>{plugin.catalog.name}</h1>
            <p className={styles.summary}>{plugin.catalog.short_description}</p>
            <div className={styles.meta}>
              <span>{plugin.catalog.developer_name}</span>
              <span>{plugin.manifest.category}</span>
              <span>v{plugin.catalog.current_version}</span>
              <span>{plugin.catalog.first_party ? "First-party" : "Marketplace"}</span>
              {plugin.catalog.verified ? <span className={styles.good}><ShieldCheck size={10} /> Reviewed</span> : null}
            </div>
          </div>
        </div>

        <aside className={styles.actionCard}>
          <div className={styles.actionTop}>
            <div>
              <strong>{statusLabel}</strong>
              <span>{connected ? "Ready to use in Orbit." : installation ? "Continue setup to unlock this plugin." : "Review it, then install when ready."}</span>
            </div>
            <span className={`${styles.status} ${statusClass}`}><i /> {statusLabel}</span>
          </div>

          <div>
            <div className={styles.actionStack}>
              {canManage && !installation ? (
                <form action={installPlugin}>
                  <input type="hidden" name="pluginSlug" value={slug} />
                  <button className={styles.primary} type="submit">Install plugin <ArrowRight size={13} /></button>
                </form>
              ) : null}

              {canManage && isGeoapify && installation && !connected ? (
                <Link className={styles.primary} href="/dashboard/plugins/geoapify-lead-discovery?connect=1">Connect Geoapify <ArrowRight size={13} /></Link>
              ) : null}

              {canManage && isGeoapify && connected ? (
                <Link className={styles.secondary} href="/dashboard/plugins/geoapify-lead-discovery?connect=1">Manage connection</Link>
              ) : null}

              {canManage && !isGeoapify && installation?.status === "installed" ? (
                <form action={disablePlugin}>
                  <input type="hidden" name="pluginSlug" value={slug} />
                  <button className={styles.secondary} type="submit">Disable plugin</button>
                </form>
              ) : null}

              {canManage && installation?.status === "disabled" ? (
                <form action={enablePlugin}>
                  <input type="hidden" name="pluginSlug" value={slug} />
                  <button className={styles.primary} type="submit">Enable plugin</button>
                </form>
              ) : null}

              {canManage && installation?.status === "pending_review" ? (
                <form action={approvePluginUpdate}>
                  <input type="hidden" name="pluginSlug" value={slug} />
                  <button className={styles.primary} type="submit">Review & approve v{plugin.catalog.current_version}</button>
                </form>
              ) : null}
            </div>
            <div className={styles.actionHint}><Clock3 size={12} /> Typical setup: {setupTime}. Nothing connects without your approval.</div>
          </div>
        </aside>
      </section>

      <section className={styles.trustStrip} aria-label="Plugin summary">
        <div className={styles.trustItem}><span className={styles.trustIcon}><Sparkles size={14} /></span><div><strong>{plugin.manifest.skills.length} capabilities</strong><span>What this adds to Orbit</span></div></div>
        <div className={styles.trustItem}><span className={styles.trustIcon}><Workflow size={14} /></span><div><strong>{plugin.manifest.workflows.length} workflow{plugin.manifest.workflows.length === 1 ? "" : "s"}</strong><span>Ready-made execution paths</span></div></div>
        <div className={styles.trustItem}><span className={styles.trustIcon}><ShieldCheck size={14} /></span><div><strong>{plugin.manifest.permissions.length} permissions</strong><span>Explicit, reviewable access</span></div></div>
        <div className={styles.trustItem}><span className={styles.trustIcon}><Clock3 size={14} /></span><div><strong>{setupTime}</strong><span>Estimated setup time</span></div></div>
      </section>

      {query.notice && !geoapifyFlowOpen ? <div className={styles.notice}><CheckCircle2 size={14} /> {query.notice}</div> : null}
      {query.error && !geoapifyFlowOpen ? <div className={`${styles.notice} ${styles.noticeError}`}><CircleAlert size={14} /> {query.error}</div> : null}

      <div className={styles.layout}>
        <div className={styles.mainColumn}>
          <section className={styles.panel}>
            <div className={styles.sectionEyebrow}><Sparkles size={11} /> What this unlocks</div>
            <h2>What changes after you add it</h2>
            <p className={styles.panelIntro}>Outcome first. These are the useful things this plugin adds to the workspace before you decide to connect anything.</p>
            <div className={styles.unlockGrid}>
              {capabilities.map((item) => (
                <article className={styles.unlock} key={item.id}>
                  <span className={styles.unlockIcon}>{item.icon === "workflow" ? <Workflow size={15} /> : <Sparkles size={15} />}</span>
                  <strong>{item.name}</strong>
                  <span>{item.description}</span>
                </article>
              ))}
            </div>
          </section>

          <section className={styles.panel}>
            <div className={styles.sectionEyebrow}><Workflow size={11} /> How Orbit uses it</div>
            <h2>{firstWorkflow?.name ?? "From plugin to useful work"}</h2>
            <p className={styles.panelIntro}>{firstWorkflow?.description ?? "Orbit keeps the plugin inside a clear reviewable workflow instead of giving it open-ended access."}</p>
            <div className={styles.flow}>
              {plugin.manifest.skills.slice(0, 3).map((skill, index) => (
                <div style={{ display: "contents" }} key={skill.id}>
                  <div className={styles.flowStep}>
                    <b>{String(index + 1).padStart(2, "0")}</b>
                    <strong>{skill.name}</strong>
                    <span>{skill.description}</span>
                  </div>
                  {index < Math.min(plugin.manifest.skills.length, 3) - 1 ? <span className={styles.flowArrow}><ArrowRight size={14} /></span> : null}
                </div>
              ))}
            </div>
          </section>

          <section className={styles.panel}>
            <div className={styles.sectionEyebrow}><ShieldCheck size={11} /> Trust & access</div>
            <h2>What Orbit is allowed to access</h2>
            <p className={styles.panelIntro}>The access boundary is explicit. Installing or connecting this plugin does not silently widen its permissions later.</p>
            <div className={styles.permissionList}>
              {plugin.manifest.permissions.map((permission) => (
                <div className={styles.permission} key={permission}><CheckCircle2 size={13} /><code>{permission}</code></div>
              ))}
            </div>
            <div className={styles.securityNote}><LockKeyhole size={14} /><span>Provider credentials stay server-side. Orbit only unlocks the features covered by this reviewed permission set.</span></div>
          </section>
        </div>

        <aside className={styles.sideColumn}>
          <section className={styles.panel}>
            <div className={styles.sectionEyebrow}><PlugZap size={11} /> Connection</div>
            <h2>Setup status</h2>
            {isGeoapify && geoapify ? (
              <>
                <div className={styles.connectionState}>
                  <span className={styles.stateIcon}>{geoapify.connected ? <CheckCircle2 size={17} /> : <PlugZap size={17} />}</span>
                  <div>
                    <strong>{geoapify.connected ? `${geoapify.accountName ?? "Geoapify Places"} connected` : installation ? "Ready to connect" : "Install first"}</strong>
                    <span>{geoapify.connected ? "Lead Finder can use the approved Geoapify capabilities." : "The guided onboarding handles API key validation, security and completion."}</span>
                  </div>
                </div>
                {canManage && installation ? (
                  <div className={styles.connectionCta}><Link className={geoapify.connected ? styles.secondary : styles.primary} href="/dashboard/plugins/geoapify-lead-discovery?connect=1">{geoapify.connected ? "Manage connection" : "Start connection"}</Link></div>
                ) : null}
              </>
            ) : (
              <div className={styles.connectionState}>
                <span className={styles.stateIcon}><PlugZap size={17} /></span>
                <div><strong>{installation ? "Plugin installed" : "Not installed"}</strong><span>{installation ? "Review required app connections below." : "Install this plugin to continue setup."}</span></div>
              </div>
            )}
          </section>

          <section className={styles.panel}>
            <div className={styles.sectionEyebrow}><KeyRound size={11} /> What Orbit needs</div>
            <h2>Setup requirements</h2>
            <div className={styles.needList}>
              <div className={styles.need}><CheckCircle2 size={13} /><div><strong>Workspace approval</strong><span>An owner or admin approves installation and connection.</span></div></div>
              {isGeoapify ? <div className={styles.need}><KeyRound size={13} /><div><strong>Geoapify API key</strong><span>Validated during the guided connection flow.</span></div></div> : null}
              <div className={styles.need}><Clock3 size={13} /><div><strong>{setupTime}</strong><span>Typical setup when credentials are ready.</span></div></div>
            </div>
          </section>

          <section className={styles.panel}>
            <div className={styles.sectionEyebrow}><PlugZap size={11} /> Connected apps</div>
            <h2>Dependencies</h2>
            <div className={styles.connectionList}>
              {appConnections.length ? appConnections.map((app) => (
                <div className={styles.connectionRow} key={app.provider}>
                  {app.connected ? <CheckCircle2 size={13} /> : <PlugZap size={13} />}
                  <div>
                    <strong>{providerLabel(app.provider)}</strong>
                    <span>{app.connected ? `${app.accountName ?? "Connected account"}${app.assetCount ? ` · ${app.assetCount} assets` : ""}` : `${app.required ? "Required" : "Optional"} · not connected`}</span>
                  </div>
                  {!app.connected && !isGeoapify ? <Link href={app.connectHref}>Connect <ExternalLink size={10} /></Link> : null}
                </div>
              )) : <div className={styles.empty}>No external app is required.</div>}
            </div>
          </section>

          <section className={styles.panel}>
            <div className={styles.sectionEyebrow}><Blocks size={11} /> Used inside Orbit</div>
            <h2>Workspace modules</h2>
            <div className={styles.moduleChips}>{plugin.manifest.orbit_modules.map((module) => <span key={module}>{humanModule(module)}</span>)}</div>
          </section>

          {events.length ? (
            <section className={styles.panel}>
              <div className={styles.sectionEyebrow}><Clock3 size={11} /> Activity</div>
              <h2>Recent changes</h2>
              <div className={styles.activity}>{events.slice(0, 5).map((event) => <div key={event.id}><strong>{event.event_type.replaceAll("_", " ")}</strong><span>{new Date(event.occurred_at).toLocaleDateString()}</span></div>)}</div>
            </section>
          ) : null}

          {canManage && installation ? (
            <section className={styles.panel}>
              <div className={styles.sectionEyebrow}><CircleAlert size={11} /> Management</div>
              <h2>Plugin controls</h2>
              <p className={styles.panelIntro}>Uninstall removes this plugin from the workspace. External provider access may need to be revoked separately.</p>
              <div className={styles.connectionCta}>
                <form action={uninstallPlugin}>
                  <input type="hidden" name="pluginSlug" value={slug} />
                  <button className={styles.danger} type="submit">Uninstall plugin</button>
                </form>
              </div>
            </section>
          ) : null}
        </aside>
      </div>

      {installation?.status === "pending_review" ? <div className={styles.notice}><CircleAlert size={14} /> This version changed its permission or runtime boundary. Review the access above before approving the update.</div> : null}
      {installation?.status === "pending_connections" && requiredMissing.length && !isGeoapify ? <div className={styles.notice}><CircleAlert size={14} /> Setup is waiting for {requiredMissing.map((app) => providerLabel(app.provider)).join(", ")}.</div> : null}

      {isGeoapify && geoapify ? (
        <GeoapifyConnectionFlow
          open={geoapifyFlowOpen}
          installed={geoapify.installed}
          connected={geoapify.connected}
          canManage={canManage}
          accountName={geoapify.accountName}
          notice={query.notice ?? null}
          error={query.error ?? null}
        />
      ) : null}
    </main>
  );
}
