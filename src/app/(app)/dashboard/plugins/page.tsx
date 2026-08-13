import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Blocks,
  CheckCircle2,
  PlugZap,
  ShieldCheck,
  Sparkles,
  Workflow,
} from "lucide-react";
import { requireWorkspace } from "@/lib/workspace";
import { getPluginMarketplace } from "@/lib/plugins/catalog";
import { disablePlugin, enablePlugin, installPlugin, uninstallPlugin } from "./actions";
import styles from "./plugins.module.css";

function statusLabel(status: string | null) {
  if (status === "installed") return "Installed";
  if (status === "disabled") return "Disabled";
  if (status === "pending_connections") return "Needs connection";
  return "Available";
}

function statusClass(status: string | null) {
  if (status === "installed") return styles.installed;
  if (status === "disabled") return styles.disabled;
  if (status === "pending_connections") return styles.pending;
  return styles.disabled;
}

export default async function PluginsPage() {
  const { supabase, workspace, role } = await requireWorkspace();
  const plugins = await getPluginMarketplace(supabase, workspace.id);
  const canManage = role === "owner" || role === "admin";
  const active = plugins.filter((plugin) => plugin.installation?.status === "installed").length;
  const disabled = plugins.filter((plugin) => plugin.installation?.status === "disabled").length;
  const firstParty = plugins.filter((plugin) => plugin.catalog.first_party).length;

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.eyebrow}><Blocks size={14} /> Orbit Plugin Platform v1</div>
        <h1>Plugins</h1>
        <p>
          Extend Orbit without bloating the core product. Each plugin declares its skills, apps,
          workflows and permissions before installation, and every organisation keeps its own isolated state.
        </p>
        <div className={styles.heroMeta}>
          <span><ShieldCheck size={11} /> Permissioned by default</span>
          <span><PlugZap size={11} /> Connect apps once</span>
          <span><Sparkles size={11} /> Zero extra hosting for plugin logic</span>
        </div>
      </section>

      <section className={styles.stats} aria-label="Plugin summary">
        <article className={styles.stat}><small>Available</small><strong>{plugins.length}</strong><span>Published in Orbit</span></article>
        <article className={styles.stat}><small>Active</small><strong>{active}</strong><span>Enabled for {workspace.name}</span></article>
        <article className={styles.stat}><small>Disabled</small><strong>{disabled}</strong><span>Installed but paused</span></article>
        <article className={styles.stat}><small>Verified</small><strong>{firstParty}</strong><span>First-party Urava plugins</span></article>
      </section>

      <section>
        <div className={styles.sectionHead}>
          <div><h2>Plugin directory</h2><p>Review capabilities and permissions before anything enters your organisation.</p></div>
          <Link href="/dashboard/connect">Manage connected apps <ArrowRight size={11} /></Link>
        </div>
      </section>

      <section className={styles.grid} aria-label="Available plugins">
        {plugins.map(({ catalog, manifest, installation }) => {
          const effectiveStatus = installation?.status === "revoked" ? null : installation?.status ?? null;
          return (
            <article className={styles.card} key={catalog.id}>
              <div className={styles.cardTop}>
                <div className={styles.identity}>
                  <div className={styles.logo}><Blocks size={20} /></div>
                  <div>
                    <h3>{catalog.name}</h3>
                    <small>{catalog.developer_name} · {manifest.category} · v{catalog.current_version}</small>
                  </div>
                </div>
                <div className={styles.badges}>
                  {catalog.verified ? <span className={styles.verified}><BadgeCheck size={10} /> Verified</span> : null}
                  {effectiveStatus ? <span className={statusClass(effectiveStatus)}>{statusLabel(effectiveStatus)}</span> : null}
                </div>
              </div>

              <p className={styles.description}>{catalog.short_description}</p>

              <div className={styles.metaGrid}>
                <div><small>Skills</small><strong>{manifest.skills.length}</strong></div>
                <div><small>Apps</small><strong>{manifest.apps.length}</strong></div>
                <div><small>Workflows</small><strong>{manifest.workflows.length}</strong></div>
              </div>

              <div className={styles.capRow}>
                {manifest.orbit_modules.slice(0, 4).map((module) => <span key={module}>{module.replaceAll("_", " ")}</span>)}
              </div>

              <div className={styles.permissions} aria-label="Requested permissions">
                {manifest.permissions.slice(0, 4).map((permission) => <code key={permission}>{permission}</code>)}
                {manifest.permissions.length > 4 ? <code>+{manifest.permissions.length - 4} more</code> : null}
              </div>

              <div className={styles.actions}>
                <div>
                  {canManage && !effectiveStatus ? (
                    <form action={installPlugin}><input type="hidden" name="pluginSlug" value={catalog.slug} /><button className={styles.button} type="submit">Install plugin</button></form>
                  ) : null}
                  {canManage && effectiveStatus === "installed" ? (
                    <form action={disablePlugin}><input type="hidden" name="pluginSlug" value={catalog.slug} /><button className={styles.buttonQuiet} type="submit">Disable</button></form>
                  ) : null}
                  {canManage && (effectiveStatus === "disabled" || effectiveStatus === "pending_connections") ? (
                    <form action={enablePlugin}><input type="hidden" name="pluginSlug" value={catalog.slug} /><button className={styles.button} type="submit">Enable</button></form>
                  ) : null}
                  {canManage && effectiveStatus ? (
                    <form action={uninstallPlugin}><input type="hidden" name="pluginSlug" value={catalog.slug} /><button className={styles.buttonDanger} type="submit">Uninstall</button></form>
                  ) : null}
                </div>
                <Link className={styles.detailLink} href={`/dashboard/plugins/${catalog.slug}`}>Review plugin <ArrowRight size={11} /></Link>
              </div>
            </article>
          );
        })}
      </section>

      {!plugins.length ? <div className={styles.empty}>No published plugins are available yet.</div> : null}

      <section className={styles.notice}>
        <CheckCircle2 size={12} /> Stage 1 keeps plugin metadata, permission grants, installation state and audit history inside the existing Orbit + Supabase stack—no new paid infrastructure.
      </section>
    </main>
  );
}
