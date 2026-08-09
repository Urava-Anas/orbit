"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ComponentType } from "react";
import { SiFacebook, SiGoogle, SiInstagram, SiWhatsapp } from "react-icons/si";
import {
  TbActivity,
  TbAlertTriangle,
  TbArrowLeft,
  TbArrowUpRight,
  TbCheck,
  TbChevronRight,
  TbCircleCheck,
  TbClock,
  TbPlus,
  TbSearch,
  TbTargetArrow,
  TbUsers,
  TbWorld,
} from "react-icons/tb";
import type { SourceDefinition, SourceSlug } from "./source-data";
import { LeadEnginePageShell } from "./LeadEnginePageShell";
import styles from "./source-workspace.module.css";

type Icon = ComponentType<{ className?: string; "aria-hidden"?: boolean }>;

const sourceIcons: Record<SourceSlug, Icon> = {
  website: TbWorld,
  instagram: SiInstagram,
  facebook: SiFacebook,
  google: SiGoogle,
  whatsapp: SiWhatsapp,
  referrals: TbUsers,
  "lead-finder": TbTargetArrow,
};

export function LeadSourceWorkspace({ source }: { source: SourceDefinition }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"All" | "Healthy" | "Attention">("All");
  const [controlState, setControlState] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(source.controls.map((control) => [control.id, control.enabled])),
  );
  const [toast, setToast] = useState<string | null>(null);
  const SourceIcon = sourceIcons[source.slug];

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const filteredAssets = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return source.assets.filter((asset) => {
      const matchesQuery =
        !normalized ||
        asset.name.toLowerCase().includes(normalized) ||
        asset.identifier.toLowerCase().includes(normalized);
      const matchesFilter =
        filter === "All" ||
        (filter === "Healthy" && asset.health === "Healthy") ||
        (filter === "Attention" && asset.health !== "Healthy");
      return matchesQuery && matchesFilter;
    });
  }, [filter, query, source.assets]);

  const firstLiveAsset = source.assets.find((asset) => asset.liveHref);

  return (
    <LeadEnginePageShell>
      <div className={styles.workspace} data-accent={source.accent}>
        <nav className={styles.breadcrumbs} aria-label="Breadcrumb">
          <Link href="/lead-engine">
            <TbArrowLeft aria-hidden />
            Lead Engine
          </Link>
          <span>/</span>
          <span aria-current="page">{source.label}</span>
        </nav>

        <header className={styles.sourceHeader}>
          <div className={styles.sourceIdentity}>
            <span className={styles.sourceMark}>
              <SourceIcon aria-hidden />
            </span>
            <div>
              <div className={styles.titleEyebrow}>Source workspace</div>
              <h1>{source.label}</h1>
              <p>{source.description}</p>
            </div>
          </div>

          <div className={styles.headerActions}>
            {firstLiveAsset?.liveHref ? (
              <a className={styles.secondaryButton} href={firstLiveAsset.liveHref} target="_blank" rel="noreferrer">
                Open live source
                <TbArrowUpRight aria-hidden />
              </a>
            ) : null}
            <button
              className={styles.primaryButton}
              type="button"
              onClick={() => setToast(`Connect ${source.singular} will open during the integration phase.`)}
            >
              <TbPlus aria-hidden />
              Connect {source.singular}
            </button>
          </div>
        </header>

        <section className={styles.summaryGrid} aria-label={`${source.label} summary`}>
          {source.summary.map((metric) => (
            <article className={styles.summaryCard} key={metric.label}>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
              <small>{metric.detail}</small>
            </article>
          ))}
        </section>

        <section className={styles.controlStrip} aria-labelledby="source-controls-heading">
          <div className={styles.stripIntro}>
            <span className={styles.livePulse} aria-hidden />
            <div>
              <h2 id="source-controls-heading">Source controls</h2>
              <p>Orbit runs routine work inside these approved limits.</p>
            </div>
          </div>

          <div className={styles.controlList}>
            {source.controls.map((control) => {
              const enabled = controlState[control.id];
              return (
                <button
                  className={styles.controlItem}
                  type="button"
                  key={control.id}
                  aria-pressed={enabled}
                  onClick={() => {
                    setControlState((current) => ({ ...current, [control.id]: !enabled }));
                    setToast(`${control.title} ${enabled ? "paused" : "activated"} for this preview.`);
                  }}
                >
                  <span>
                    <strong>{control.title}</strong>
                    <small>{control.detail}</small>
                  </span>
                  <i className={enabled ? styles.toggleOn : styles.toggleOff} aria-label={enabled ? "Active" : "Paused"}>
                    <b />
                  </i>
                </button>
              );
            })}
          </div>
        </section>

        <div className={styles.workspaceGrid}>
          <section className={styles.assetPanel} aria-labelledby="assets-heading">
            <div className={styles.panelHeader}>
              <div>
                <h2 id="assets-heading">All {source.unit}</h2>
                <p>Open one to control its complete operation.</p>
              </div>
              <span>{source.assets.length} total</span>
            </div>

            <div className={styles.assetTools}>
              <label className={styles.searchField}>
                <TbSearch aria-hidden />
                <span className={styles.visuallyHidden}>Search {source.unit}</span>
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={`Search ${source.unit}`}
                />
              </label>
              <div className={styles.filters} aria-label="Asset filters">
                {(["All", "Healthy", "Attention"] as const).map((item) => (
                  <button
                    type="button"
                    key={item}
                    className={filter === item ? styles.filterActive : ""}
                    onClick={() => setFilter(item)}
                    aria-pressed={filter === item}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.assetList}>
              {filteredAssets.map((asset) => (
                <Link
                  className={styles.assetRow}
                  href={`/lead-engine/sources/${source.slug}/${asset.slug}`}
                  key={asset.slug}
                >
                  <span className={styles.assetAvatar}>
                    <SourceIcon aria-hidden />
                  </span>
                  <span className={styles.assetIdentity}>
                    <strong>{asset.name}</strong>
                    <small>{asset.identifier}</small>
                  </span>
                  <span className={styles.assetStat}>
                    <strong>{asset.leads}</strong>
                    <small>Leads</small>
                  </span>
                  <span className={styles.assetStat}>
                    <strong>{asset.conversion}</strong>
                    <small>Conversion</small>
                  </span>
                  <span className={`${styles.healthPill} ${asset.health === "Healthy" ? styles.healthy : styles.warning}`}>
                    {asset.health === "Healthy" ? <TbCircleCheck aria-hidden /> : <TbAlertTriangle aria-hidden />}
                    {asset.health}
                  </span>
                  <span className={styles.lastSync}>
                    <TbClock aria-hidden />
                    {asset.lastSync}
                  </span>
                  <TbChevronRight className={styles.rowArrow} aria-hidden />
                </Link>
              ))}

              {filteredAssets.length === 0 ? (
                <div className={styles.emptyState}>No {source.unit} match this view.</div>
              ) : null}
            </div>
          </section>

          <aside className={styles.sideColumn}>
            <section className={styles.sidePanel} aria-labelledby="attention-heading">
              <div className={styles.panelHeaderCompact}>
                <h2 id="attention-heading">Needs attention</h2>
                <span>{source.attention.filter((item) => item.level === "Warning").length}</span>
              </div>
              {source.attention.map((item) => (
                <article className={styles.noticeRow} key={item.title}>
                  {item.level === "Warning" ? <TbAlertTriangle aria-hidden /> : <TbCheck aria-hidden />}
                  <span>
                    <strong>{item.title}</strong>
                    <small>{item.detail}</small>
                  </span>
                </article>
              ))}
            </section>

            <section className={styles.sidePanel} aria-labelledby="activity-heading">
              <div className={styles.panelHeaderCompact}>
                <h2 id="activity-heading">Recent activity</h2>
                <TbActivity aria-hidden />
              </div>
              {source.activity.map((item) => (
                <article className={styles.activityRow} key={`${item.title}-${item.time}`}>
                  <i className={item.status === "Success" ? styles.activitySuccess : styles.activityWatch} aria-hidden />
                  <span>
                    <strong>{item.title}</strong>
                    <small>{item.detail}</small>
                  </span>
                  <time>{item.time}</time>
                </article>
              ))}
            </section>
          </aside>
        </div>

        <div className={`${styles.toast} ${toast ? styles.toastVisible : ""}`} role="status" aria-live="polite">
          <TbActivity aria-hidden />
          {toast}
        </div>
      </div>
    </LeadEnginePageShell>
  );
}
