"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowRight,
  Blocks,
  Bot,
  Check,
  Search,
  Sparkles,
  Target,
} from "lucide-react";
import {
  SiGithub,
  SiGoogle,
  SiGoogleanalytics,
  SiLinkedin,
  SiMeta,
  SiOpenai,
  SiVercel,
} from "react-icons/si";
import styles from "./plugin-workspace-picker.module.css";

export type PluginPickerItem = {
  id: string;
  name: string;
  category: string;
  description: string;
  status: "connected" | "installed" | "ready" | "setup" | "available";
  kind: "app" | "plugin";
  href: string;
  tags: string[];
};

type GoalId = "leads" | "websites" | "growth" | "automation" | "publishing";

type Props = {
  workspaceName: string;
  items: PluginPickerItem[];
};

const goals: Array<{ id: GoalId; label: string; hint: string; keywords: string[] }> = [
  {
    id: "leads",
    label: "Find more leads",
    hint: "Discovery, outreach and prospecting",
    keywords: ["lead", "growth", "places", "local", "business", "linkedin", "meta", "marketing", "outreach"],
  },
  {
    id: "websites",
    label: "Build & deploy",
    hint: "Code, websites and production",
    keywords: ["development", "code", "repositories", "github", "vercel", "deployment", "website", "production"],
  },
  {
    id: "growth",
    label: "Measure growth",
    hint: "SEO, analytics and conversion",
    keywords: ["analytics", "seo", "search", "traffic", "conversion", "growth", "evidence"],
  },
  {
    id: "automation",
    label: "Automate work",
    hint: "AI, workflows and operations",
    keywords: ["ai", "automation", "operator", "workflow", "operations", "data", "productivity"],
  },
  {
    id: "publishing",
    label: "Publish content",
    hint: "Social, content and distribution",
    keywords: ["publishing", "content", "social", "facebook", "instagram", "linkedin", "meta"],
  },
];

function iconFor(item: PluginPickerItem) {
  if (item.kind === "plugin") return <Blocks aria-hidden="true" />;
  if (item.id === "github") return <SiGithub aria-hidden="true" />;
  if (item.id === "vercel") return <SiVercel aria-hidden="true" />;
  if (item.id === "google_search_console") return <SiGoogle aria-hidden="true" />;
  if (item.id === "google_analytics") return <SiGoogleanalytics aria-hidden="true" />;
  if (item.id === "meta") return <SiMeta aria-hidden="true" />;
  if (item.id === "linkedin") return <SiLinkedin aria-hidden="true" />;
  if (item.id === "operator") return <SiOpenai aria-hidden="true" />;
  return <Blocks aria-hidden="true" />;
}

function statusLabel(status: PluginPickerItem["status"]) {
  if (status === "connected") return "Connected";
  if (status === "installed") return "Installed";
  if (status === "ready") return "Ready to connect";
  if (status === "setup") return "Setup required";
  return "Available";
}

function matchScore(item: PluginPickerItem, keywords: string[]) {
  const haystack = `${item.name} ${item.category} ${item.description} ${item.tags.join(" ")}`.toLowerCase();
  const matches = keywords.reduce((score, keyword) => score + (haystack.includes(keyword) ? 1 : 0), 0);
  const availabilityBonus = item.status === "connected" || item.status === "installed" ? -2 : item.status === "ready" ? 2 : 0;
  return matches * 4 + availabilityBonus;
}

export function PluginWorkspacePicker({ workspaceName, items }: Props) {
  const [search, setSearch] = useState("");
  const [goal, setGoal] = useState<GoalId>("leads");

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return items;
    return items.filter((item) =>
      `${item.name} ${item.category} ${item.description} ${item.tags.join(" ")}`.toLowerCase().includes(query),
    );
  }, [items, search]);

  const activeGoal = goals.find((item) => item.id === goal) ?? goals[0];
  const recommendations = useMemo(
    () =>
      [...items]
        .map((item) => ({ item, score: matchScore(item, activeGoal.keywords) }))
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name))
        .slice(0, 3),
    [items, activeGoal],
  );

  return (
    <section className={styles.shell} aria-labelledby="plugin-picker-heading">
      <header className={styles.header}>
        <div>
          <div className={styles.eyebrow}><Sparkles size={13} /> Workspace plugin setup</div>
          <h2 id="plugin-picker-heading">Choose what {workspaceName} needs</h2>
          <p>Pick one plugin yourself, or choose a workspace goal and let Orbit recommend the best fit.</p>
        </div>
        <div className={styles.rule}><Check size={13} /> One plugin opens one overview</div>
      </header>

      <div className={styles.columns}>
        <article className={styles.panel}>
          <div className={styles.panelTitle}>
            <div className={styles.titleIcon}><Search size={17} /></div>
            <div><strong>Choose a plugin</strong><span>You know what you want</span></div>
          </div>

          <label className={styles.search}>
            <Search size={15} aria-hidden="true" />
            <input
              aria-label="Search plugins"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search plugins, apps or capabilities…"
              value={search}
            />
          </label>

          <div className={styles.manualList}>
            {filtered.slice(0, 6).map((item) => (
              <Link className={styles.manualItem} href={item.href} key={`${item.kind}-${item.id}`}>
                <span className={styles.logo}>{iconFor(item)}</span>
                <span className={styles.manualCopy}>
                  <strong>{item.name}</strong>
                  <small>{item.category}</small>
                </span>
                <span className={`${styles.status} ${styles[`status_${item.status}`]}`}>{statusLabel(item.status)}</span>
                <ArrowRight size={14} aria-hidden="true" />
              </Link>
            ))}
            {!filtered.length ? <div className={styles.empty}>No matching plugin found.</div> : null}
          </div>

          {filtered.length > 6 ? <a className={styles.viewAll} href="#plugin-library">View all {filtered.length} matches <ArrowRight size={12} /></a> : null}
        </article>

        <article className={`${styles.panel} ${styles.recommendPanel}`}>
          <div className={styles.panelTitle}>
            <div className={`${styles.titleIcon} ${styles.recommendIcon}`}><Bot size={17} /></div>
            <div><strong>Recommend for my workspace</strong><span>Tell Orbit the job to be done</span></div>
          </div>

          <div className={styles.goalLabel}><Target size={13} /> What should this workspace do better?</div>
          <div className={styles.goalGrid}>
            {goals.map((item) => (
              <button
                className={item.id === goal ? styles.goalActive : styles.goal}
                key={item.id}
                onClick={() => setGoal(item.id)}
                type="button"
              >
                <strong>{item.label}</strong>
                <span>{item.hint}</span>
              </button>
            ))}
          </div>

          <div className={styles.recommendHeader}>
            <div><Sparkles size={13} /><strong>Orbit recommends</strong></div>
            <span>Best fit for “{activeGoal.label}”</span>
          </div>

          <div className={styles.recommendations}>
            {recommendations.map(({ item }, index) => (
              <Link className={styles.recommendation} href={item.href} key={`${item.kind}-${item.id}`}>
                <span className={styles.rank}>{index + 1}</span>
                <span className={styles.logo}>{iconFor(item)}</span>
                <span className={styles.recommendCopy}>
                  <strong>{item.name}</strong>
                  <small>{item.description}</small>
                </span>
                <span className={styles.fit}>Best fit</span>
                <ArrowRight size={14} aria-hidden="true" />
              </Link>
            ))}
            {!recommendations.length ? <div className={styles.empty}>No strong recommendation yet. Browse the plugin library.</div> : null}
          </div>

          <div className={styles.note}>Orbit recommends only. Nothing installs or connects until you open a plugin and approve its setup.</div>
        </article>
      </div>
    </section>
  );
}
