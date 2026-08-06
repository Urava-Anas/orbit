"use client";

import { useEffect, useMemo, useState, type ComponentType } from "react";
import {
  SiFacebook,
  SiGoogle,
  SiInstagram,
  SiWhatsapp,
} from "react-icons/si";
import {
  TbActivity,
  TbArrowRight,
  TbArrowUpRight,
  TbBriefcase2,
  TbBuildingBank,
  TbCash,
  TbCheck,
  TbCircleCheck,
  TbCircleX,
  TbFileDescription,
  TbFlask2,
  TbInbox,
  TbLayoutDashboard,
  TbMail,
  TbPlayerPause,
  TbPlayerPlay,
  TbReceiptDollar,
  TbShieldCheck,
  TbStack2,
  TbTargetArrow,
  TbTools,
  TbUsers,
  TbWorld,
} from "react-icons/tb";
import { LuOrbit } from "react-icons/lu";
import styles from "./lead-engine.module.css";

type Icon = ComponentType<{ className?: string; "aria-hidden"?: boolean }>;

type Source = {
  label: string;
  value: number;
  status: string;
  href: string;
  icon: Icon;
  tone: string;
  external?: boolean;
};

const sources: Source[] = [
  {
    label: "Website",
    value: 12,
    status: "Connected",
    href: "https://urava-main-site.vercel.app",
    icon: TbWorld,
    tone: "blue",
    external: true,
  },
  {
    label: "Instagram",
    value: 8,
    status: "Connected",
    href: "https://www.instagram.com/urava.online/",
    icon: SiInstagram,
    tone: "pink",
    external: true,
  },
  {
    label: "Facebook",
    value: 5,
    status: "Connected",
    href: "https://www.facebook.com/61591507679936/",
    icon: SiFacebook,
    tone: "facebook",
    external: true,
  },
  {
    label: "Google",
    value: 9,
    status: "Connected",
    href: "https://share.google/ACV2Ar0l1gER5fReL",
    icon: SiGoogle,
    tone: "google",
    external: true,
  },
  {
    label: "WhatsApp",
    value: 7,
    status: "Connected",
    href: "https://web.whatsapp.com/",
    icon: SiWhatsapp,
    tone: "whatsapp",
    external: true,
  },
  {
    label: "Referrals",
    value: 3,
    status: "Connected",
    href: "#attention",
    icon: TbUsers,
    tone: "blue",
  },
  {
    label: "Lead Finder",
    value: 14,
    status: "Connected",
    href: "/dashboard/leads/finder",
    icon: TbTargetArrow,
    tone: "coral",
  },
  {
    label: "Unified Inbox",
    value: 58,
    status: "Healthy",
    href: "/dashboard/leads",
    icon: TbInbox,
    tone: "coral",
  },
];

const navigation: Array<{
  label: string;
  icon: Icon;
  href?: string;
  badge?: string;
  active?: boolean;
  comingSoon?: boolean;
}> = [
  { label: "Lead Engine", icon: TbTargetArrow, href: "/lead-engine", active: true },
  { label: "Overview", icon: TbLayoutDashboard, href: "/dashboard" },
  { label: "Inbox", icon: TbMail, href: "/dashboard/leads", badge: "6" },
  { label: "Studio", icon: TbBriefcase2, href: "/dashboard/projects" },
  { label: "Foundry", icon: TbStack2, href: "/dashboard/foundry" },
  { label: "Labs", icon: TbFlask2 },
  { label: "Proof", icon: TbShieldCheck, href: "/dashboard/proof" },
  { label: "Policies", icon: TbFileDescription },
  { label: "Pricing Model", icon: TbReceiptDollar, comingSoon: true },
];

const pipeline = [
  {
    title: "Internet Presence",
    description: "Active sources",
    value: "7",
    progress: 56,
    icon: TbWorld,
  },
  {
    title: "Leads",
    description: "Total / Qualified",
    value: "58 / 12",
    progress: 49,
    icon: TbUsers,
  },
  {
    title: "Urava Studio",
    description: "Active clients",
    value: "6",
    progress: 38,
    icon: TbTargetArrow,
  },
  {
    title: "Cash + Proof",
    description: "Pipeline / Approved proofs",
    value: "PKR 1.4M / 3",
    progress: 63,
    icon: TbCash,
  },
];

const activity = [
  {
    title: "Discovery call booked",
    detail: "Demo lead #12831",
    source: "Website",
    time: "10:20 AM",
    status: "Success",
    icon: TbCircleCheck,
  },
  {
    title: "Proposal sent",
    detail: "Demo immigration partner",
    source: "Google",
    time: "10:14 AM",
    status: "Success",
    icon: TbCircleCheck,
  },
  {
    title: "Email verification failed",
    detail: "Demo lead #12819",
    source: "Lead Finder",
    time: "10:11 AM",
    status: "Failed",
    icon: TbCircleX,
  },
  {
    title: "WhatsApp message sent",
    detail: "Demo lead #12817",
    source: "WhatsApp",
    time: "10:07 AM",
    status: "Success",
    icon: TbCircleCheck,
  },
];

export function LeadEnginePreview() {
  const [autopilotActive, setAutopilotActive] = useState(true);
  const [handled, setHandled] = useState<string[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  const exceptionCount = useMemo(() => Math.max(0, 2 - handled.length), [handled]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function showToast(message: string) {
    setToast(message);
  }

  function handleException(id: string, label: string) {
    setHandled((current) => (current.includes(id) ? current : [...current, id]));
    showToast(`${label} moved into founder control.`);
  }

  function jumpToExceptions() {
    document.getElementById("attention")?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar} aria-label="Orbit navigation">
        <a className={styles.brand} href="/lead-engine" aria-label="Orbit Lead Engine home">
          <LuOrbit className={styles.brandIcon} aria-hidden />
          <span>Orbit</span>
        </a>

        <nav className={styles.navigation} aria-label="Product sections">
          {navigation.map(({ label, icon: NavIcon, href, badge, active, comingSoon }) => {
            const content = (
              <>
                <NavIcon className={styles.navIcon} aria-hidden />
                <span>{label}</span>
                {badge ? <b className={styles.navBadge}>{badge}</b> : null}
                {comingSoon ? <b className={styles.soonBadge}>Soon</b> : null}
              </>
            );

            if (href) {
              return (
                <a
                  className={`${styles.navItem} ${active ? styles.navItemActive : ""}`}
                  href={href}
                  key={label}
                  aria-current={active ? "page" : undefined}
                >
                  {content}
                </a>
              );
            }

            return (
              <button
                className={styles.navItem}
                type="button"
                key={label}
                onClick={() =>
                  showToast(
                    comingSoon
                      ? "Pricing Model is reserved for the next build phase."
                      : `${label} will open from this workspace in the full product.`,
                  )
                }
              >
                {content}
              </button>
            );
          })}
        </nav>

        <div className={styles.sidebarFooter}>
          <button
            className={styles.organisation}
            type="button"
            onClick={() => showToast("Organisation switcher is disabled in the public preview.")}
          >
            <span>Urava Studio</span>
            <small>Founder</small>
          </button>
          <p>Public product preview</p>
          <p>Demo data only</p>
        </div>
      </aside>

      <main className={styles.main}>
        <header className={styles.header}>
          <div>
            <div className={styles.titleLine}>
              <h1>Lead Engine</h1>
              <span>Preview</span>
            </div>
            <p>Turn every source into clients, cash and proof.</p>
          </div>

          <div className={styles.systemControls}>
            <button
              className={styles.controlButton}
              type="button"
              aria-pressed={autopilotActive}
              onClick={() => {
                setAutopilotActive((current) => !current);
                showToast(autopilotActive ? "Autopilot paused safely." : "Autopilot resumed.");
              }}
            >
              <i className={autopilotActive ? styles.greenDot : styles.mutedDot} aria-hidden />
              Autopilot {autopilotActive ? "active" : "paused"}
            </button>
            <button className={styles.controlButton} type="button" onClick={jumpToExceptions}>
              <i className={styles.redDot} aria-hidden />
              {exceptionCount} {exceptionCount === 1 ? "exception" : "exceptions"}
            </button>
            <button
              className={styles.controlButton}
              type="button"
              onClick={() => {
                setAutopilotActive((current) => !current);
                showToast(autopilotActive ? "Autopilot paused safely." : "Autopilot resumed.");
              }}
            >
              {autopilotActive ? <TbPlayerPause aria-hidden /> : <TbPlayerPlay aria-hidden />}
              {autopilotActive ? "Pause" : "Resume"}
            </button>
          </div>
        </header>

        <section className={styles.section} aria-labelledby="lead-sources-heading">
          <div className={styles.sectionHeading}>
            <h2 id="lead-sources-heading">Lead Sources</h2>
            <p>Open and manage every place Urava attracts leads.</p>
          </div>

          <div className={styles.sourceGrid}>
            {sources.map(({ label, value, status, href, icon: SourceIcon, tone, external }) => (
              <a
                className={`${styles.sourceCard} ${label === "Unified Inbox" ? styles.sourceCardFeatured : ""}`}
                href={href}
                key={label}
                target={external ? "_blank" : undefined}
                rel={external ? "noreferrer" : undefined}
                aria-label={`Open ${label}`}
              >
                <span className={`${styles.sourceIcon} ${styles[tone]}`}>
                  <SourceIcon aria-hidden />
                </span>
                <TbArrowUpRight className={styles.externalIcon} aria-hidden />
                <strong>{label}</strong>
                <b>{value}</b>
                <small>
                  <i aria-hidden />
                  {status}
                </small>
              </a>
            ))}
          </div>
        </section>

        <section className={styles.section} aria-labelledby="pipeline-heading">
          <div className={styles.sectionHeading}>
            <h2 id="pipeline-heading">Business Pipeline</h2>
            <p>How Urava turns attention into clients, capacity and reusable assets.</p>
          </div>

          <div className={styles.pipeline}>
            {pipeline.map(({ title, description, value, progress, icon: PipelineIcon }) => (
              <article className={styles.pipelineStage} key={title}>
                <PipelineIcon className={styles.pipelineIcon} aria-hidden />
                <div>
                  <h3>{title}</h3>
                  <p>{description}</p>
                  <strong>{value}</strong>
                  <progress max="100" value={progress} aria-label={`${title} progress`} />
                </div>
              </article>
            ))}
          </div>

          <div className={styles.capacityPanel}>
            <article className={styles.capacityRow}>
              <TbStack2 className={styles.capacityIcon} aria-hidden />
              <div className={styles.capacityTitle}>
                <h3>Urava Foundry</h3>
                <p>Reinvests into people</p>
              </div>
              <Metric value="10" label="Active" />
              <Metric value="2" label="Studio-ready" />
              <TbArrowRight className={styles.capacityArrow} aria-hidden />
              <div className={styles.capacityOutput}>
                <TbUsers aria-hidden />
                <span>
                  <strong>Trained Talent</strong>
                  <small>Builds capability</small>
                </span>
              </div>
              <button type="button" onClick={() => showToast("Foundry capacity is feeding Studio.")}>Feeds Studio</button>
            </article>

            <article className={styles.capacityRow}>
              <TbFlask2 className={styles.capacityIcon} aria-hidden />
              <div className={styles.capacityTitle}>
                <h3>Urava Labs</h3>
                <p>Reinvests into systems</p>
              </div>
              <Metric value="3" label="Reusable systems" />
              <Metric value="5" label="Templates" />
              <TbArrowRight className={styles.capacityArrow} aria-hidden />
              <div className={styles.capacityOutput}>
                <TbFileDescription aria-hidden />
                <span>
                  <strong>Products + Templates</strong>
                  <small>Reusable assets</small>
                </span>
              </div>
              <button type="button" onClick={() => showToast("Reusable assets are feeding Studio.")}>Feeds Studio</button>
            </article>
          </div>
        </section>

        <div className={styles.bottomGrid}>
          <section className={styles.panel} id="attention" aria-labelledby="attention-heading">
            <div className={styles.panelHeading}>
              <h2 id="attention-heading">
                Needs attention <span>{exceptionCount}</span>
              </h2>
              <button type="button" onClick={() => showToast("Exception history will open here.")}>View all</button>
            </div>

            <AttentionItem
              id="proposal"
              icon={TbBuildingBank}
              title="Demo immigration partner"
              detail="Proposal exceeds auto-send threshold"
              source="Google"
              time="10:15 AM"
              action="Take control"
              handled={handled.includes("proposal")}
              onAction={handleException}
            />
            <AttentionItem
              id="verification"
              icon={TbTools}
              title="Demo local business"
              detail="Contact could not be verified"
              source="Lead Finder"
              time="10:11 AM"
              action="Resolve"
              handled={handled.includes("verification")}
              onAction={handleException}
            />
          </section>

          <section className={styles.panel} aria-labelledby="activity-heading">
            <div className={styles.panelHeading}>
              <h2 id="activity-heading">Autopilot activity</h2>
              <button type="button" onClick={() => showToast("Full activity history will open here.")}>View all</button>
            </div>
            <div className={styles.activityList}>
              {activity.map(({ title, detail, source, time, status, icon: ActivityIcon }) => (
                <article className={styles.activityRow} key={`${title}-${time}`}>
                  <ActivityIcon
                    className={status === "Success" ? styles.activitySuccess : styles.activityFailed}
                    aria-hidden
                  />
                  <span className={styles.activityCopy}>
                    <strong>{title}</strong>
                    <small>{detail}</small>
                  </span>
                  <span className={styles.sourcePill}>{source}</span>
                  <time>{time}</time>
                  <span className={status === "Success" ? styles.successPill : styles.failedPill}>
                    {status}
                  </span>
                </article>
              ))}
            </div>
          </section>
        </div>

        <div className={`${styles.toast} ${toast ? styles.toastVisible : ""}`} role="status" aria-live="polite">
          <TbActivity aria-hidden />
          {toast}
        </div>
      </main>
    </div>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <span className={styles.metric}>
      <strong>{value}</strong>
      <small>{label}</small>
    </span>
  );
}

function AttentionItem({
  id,
  icon: AttentionIcon,
  title,
  detail,
  source,
  time,
  action,
  handled,
  onAction,
}: {
  id: string;
  icon: Icon;
  title: string;
  detail: string;
  source: string;
  time: string;
  action: string;
  handled: boolean;
  onAction: (id: string, title: string) => void;
}) {
  return (
    <article className={`${styles.attentionRow} ${handled ? styles.attentionRowHandled : ""}`}>
      <AttentionIcon className={styles.attentionIcon} aria-hidden />
      <span className={styles.attentionCopy}>
        <strong>{title}</strong>
        <small>{detail}</small>
      </span>
      <span className={styles.sourcePill}>{source}</span>
      <time>{time}</time>
      <button type="button" disabled={handled} onClick={() => onAction(id, title)}>
        {handled ? (
          <>
            <TbCheck aria-hidden /> Done
          </>
        ) : (
          action
        )}
      </button>
    </article>
  );
}
