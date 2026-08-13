import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  BadgeCheck,
  Blocks,
  CheckCircle2,
  CircleAlert,
  ExternalLink,
  PlugZap,
  ShieldCheck,
  Sparkles,
  Workflow,
} from "lucide-react";
import { requireWorkspace } from "@/lib/workspace";
import { getPluginBySlug, getPluginEvents } from "@/lib/plugins/catalog";
import {
  getWorkspacePluginConnections,
  providerLabel,
  resolvePluginAppConnections,
} from "@/lib/plugins/connections";
import { disablePlugin, enablePlugin, installPlugin, uninstallPlugin } from "../actions";
import styles from "../plugins.module.css";

type PageProps = { params: Promise<{ slug: string }> };

export default async function PluginDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const { supabase, workspace, role } = await requireWorkspace();
  const plugin = await getPluginBySlug(supabase, workspace.id, slug);
  if (!plugin) notFound();

  const [events, workspaceConnections] = await Promise.all([
    getPluginEvents(supabase, workspace.id, plugin.catalog.id, 12),
    getWorkspacePluginConnections(supabase, workspace.id),
  ]);
  const appConnections = resolvePluginAppConnections(plugin.manifest, workspaceConnections);
  const requiredMissing = appConnections.filter((app) => app.required && !app.connected);
  const canManage = role === "owner" || role === "admin";
  const installation = plugin.installation?.status === "revoked" ? null : plugin.installation;

  return (
    <main className={styles.detailPage}>
      <Link className={styles.back} href="/dashboard/plugins"><ArrowLeft size={12} /> Plugin directory</Link>

      <section className={styles.detailHero}>
        <div className={styles.detailTitle}>
          <div className={styles.logo}><Blocks size={23} /></div>
          <div>
            <div className={styles.eyebrow}>{plugin.catalog.verified ? <><BadgeCheck size={12} /> Verified plugin</> : <>Orbit plugin</>}</div>
            <h1>{plugin.catalog.name}</h1>
            <p>{plugin.catalog.short_description}</p>
            <div className={styles.heroMeta}>
              <span>{plugin.catalog.developer_name}</span>
              <span>{plugin.manifest.category}</span>
              <span>Version {plugin.catalog.current_version}</span>
              <span>{plugin.catalog.first_party ? "First-party" : "Third-party"}</span>
              {installation ? <span>{installation.status.replaceAll("_", " ")}</span> : null}
            </div>
          </div>
        </div>
        <div className={styles.actions}>
          <div>
            {canManage && !installation ? (
              <form action={installPlugin}><input type="hidden" name="pluginSlug" value={slug} /><button className={styles.button} type="submit">Install plugin</button></form>
            ) : null}
            {canManage && installation?.status === "installed" ? (
              <form action={disablePlugin}><input type="hidden" name="pluginSlug" value={slug} /><button className={styles.buttonQuiet} type="submit">Disable</button></form>
            ) : null}
            {canManage && installation?.status === "disabled" ? (
              <form action={enablePlugin}><input type="hidden" name="pluginSlug" value={slug} /><button className={styles.button} type="submit">Enable</button></form>
            ) : null}
            {canManage && installation ? (
              <form action={uninstallPlugin}><input type="hidden" name="pluginSlug" value={slug} /><button className={styles.buttonDanger} type="submit">Uninstall</button></form>
            ) : null}
          </div>
        </div>
      </section>

      {installation?.status === "pending_connections" && requiredMissing.length ? (
        <section className={styles.notice}>
          <CircleAlert size={13} /> Installed safely, but execution stays blocked until {requiredMissing.map((app) => providerLabel(app.provider)).join(", ")} {requiredMissing.length === 1 ? "is" : "are"} connected.
        </section>
      ) : null}

      <section className={styles.detailColumns}>
        <article className={styles.panel}>
          <h2>What this plugin adds</h2>
          <p>Orbit exposes only the declared capabilities below. Nothing outside this manifest is implicitly trusted.</p>
          <div className={styles.list}>
            {plugin.manifest.skills.map((skill) => (
              <div className={styles.listItem} key={skill.id}><Sparkles size={15} /><span><strong>{skill.name}</strong><small>{skill.description}</small></span></div>
            ))}
            {plugin.manifest.workflows.map((workflow) => (
              <div className={styles.listItem} key={workflow.id}><Workflow size={15} /><span><strong>{workflow.name}</strong><small>{workflow.description}</small></span></div>
            ))}
          </div>
        </article>

        <article className={styles.panel}>
          <h2>Requested permissions</h2>
          <p>Installing is the explicit approval step. Orbit stores this grant per organisation and can revoke it later.</p>
          <div className={styles.permissionList}>
            {plugin.manifest.permissions.map((permission) => <div key={permission}><CheckCircle2 size={12} /><code>{permission}</code></div>)}
          </div>
        </article>
      </section>

      <section className={styles.detailColumns}>
        <article className={styles.panel}>
          <h2>Connected apps</h2>
          <p>Apps are authorised once in Connect and inherited here. The plugin never receives a secret pasted by the user.</p>
          <div className={styles.list}>
            {appConnections.length ? appConnections.map((app) => (
              <div className={styles.listItem} key={app.provider}>
                {app.connected ? <CheckCircle2 size={15} /> : <PlugZap size={15} />}
                <span>
                  <strong>{providerLabel(app.provider)}</strong>
                  <small>
                    {app.connected
                      ? `${app.accountName ?? "Connected account"}${app.assetCount ? ` · ${app.assetCount} approved assets` : ""}`
                      : `${app.required ? "Required" : "Optional"} · not connected`}
                  </small>
                </span>
                {!app.connected ? <Link className={styles.detailLink} href={app.connectHref}>Connect <ExternalLink size={10} /></Link> : null}
              </div>
            )) : <div className={styles.listItem}><ShieldCheck size={15} /><span><strong>No external app required</strong><small>This plugin stays inside Orbit.</small></span></div>}
          </div>
          <div className={styles.actions}><div><Link className={styles.buttonQuiet} href="/dashboard/connect">Manage all apps <ExternalLink size={11} /></Link></div></div>
        </article>

        <article className={styles.panel}>
          <h2>Installation activity</h2>
          <p>Append-only workspace history for install, enable, disable and revoke events.</p>
          <div className={styles.audit}>
            {events.length ? events.map((event) => (
              <div key={event.id}><strong>{event.event_type.replaceAll("_", " ")}</strong><span>{new Date(event.occurred_at).toLocaleString()}</span></div>
            )) : <div><span>No plugin activity yet.</span></div>}
          </div>
        </article>
      </section>
    </main>
  );
}
