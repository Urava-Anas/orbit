import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  BadgeCheck,
  Blocks,
  CheckCircle2,
  ExternalLink,
  PlugZap,
  ShieldCheck,
  Sparkles,
  Workflow,
} from "lucide-react";
import { requireWorkspace } from "@/lib/workspace";
import { getPluginBySlug, getPluginEvents } from "@/lib/plugins/catalog";
import { disablePlugin, enablePlugin, installPlugin, uninstallPlugin } from "../actions";
import styles from "../plugins.module.css";

type PageProps = { params: Promise<{ slug: string }> };

export default async function PluginDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const { supabase, workspace, role } = await requireWorkspace();
  const plugin = await getPluginBySlug(supabase, workspace.id, slug);
  if (!plugin) notFound();

  const events = await getPluginEvents(supabase, workspace.id, plugin.catalog.id, 12);
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
            {canManage && (installation?.status === "disabled" || installation?.status === "pending_connections") ? (
              <form action={enablePlugin}><input type="hidden" name="pluginSlug" value={slug} /><button className={styles.button} type="submit">Enable</button></form>
            ) : null}
            {canManage && installation ? (
              <form action={uninstallPlugin}><input type="hidden" name="pluginSlug" value={slug} /><button className={styles.buttonDanger} type="submit">Uninstall</button></form>
            ) : null}
          </div>
        </div>
      </section>

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
          <h2>Required apps</h2>
          <p>Stage 2 binds these requirements to Orbit Connect so users never paste provider secrets into a plugin.</p>
          <div className={styles.list}>
            {plugin.manifest.apps.length ? plugin.manifest.apps.map((app) => (
              <div className={styles.listItem} key={app.provider}><PlugZap size={15} /><span><strong>{app.provider.replaceAll("_", " ")}</strong><small>{app.required ? "Required connection" : "Optional connection"}</small></span></div>
            )) : <div className={styles.listItem}><ShieldCheck size={15} /><span><strong>No external app required</strong><small>This plugin stays inside Orbit.</small></span></div>}
          </div>
          <div className={styles.actions}><div><Link className={styles.buttonQuiet} href="/dashboard/connect">Open Connect <ExternalLink size={11} /></Link></div></div>
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
