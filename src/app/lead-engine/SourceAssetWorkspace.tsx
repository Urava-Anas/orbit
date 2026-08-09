"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ComponentType } from "react";
import { SiFacebook, SiGoogle, SiInstagram, SiWhatsapp } from "react-icons/si";
import {
  TbActivity,
  TbAlertTriangle,
  TbArrowLeft,
  TbArrowRight,
  TbArrowUpRight,
  TbBolt,
  TbChartDots3,
  TbCheck,
  TbChevronRight,
  TbCircleCheck,
  TbKey,
  TbLock,
  TbPlayerPause,
  TbPlayerPlay,
  TbRefresh,
  TbSettings,
  TbShieldCheck,
  TbTargetArrow,
  TbUsers,
  TbWorld,
} from "react-icons/tb";
import type { SourceAsset, SourceDefinition, SourceSlug } from "./source-data";
import { LeadEnginePageShell } from "./LeadEnginePageShell";
import styles from "./source-workspace.module.css";

type Icon = ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
type ControlRow = { title: string; detail: string; status: string; tone: "good" | "watch" | "protected" };

const sourceIcons: Record<SourceSlug, Icon> = {
  website: TbWorld,
  instagram: SiInstagram,
  facebook: SiFacebook,
  google: SiGoogle,
  whatsapp: SiWhatsapp,
  referrals: TbUsers,
  "lead-finder": TbTargetArrow,
};

const tabDescriptions: Record<string, string> = {
  Leads: "See every lead, its source evidence, qualification state, owner and next action.",
  Analytics: "Measure attention, conversion and revenue without losing source attribution.",
  "Pages & Content": "Control published pages, drafts, ownership and conversion purpose.",
  Content: "Control the content queue, proof permission and conversion purpose.",
  Posts: "Control published posts, drafts and the approved campaign policy.",
  SEO: "Control indexation, technical health, queries and search opportunities.",
  Forms: "Control lead forms, spam protection, consent and routing.",
  DMs: "Control inbound conversations, qualification and safe follow-up.",
  Messages: "Control page conversations, assignment and response standards.",
  Profiles: "Control business information, visibility and conversion actions.",
  Reviews: "Control review monitoring, response drafts and escalation.",
  Search: "Control search visibility, index coverage and query opportunities.",
  Inbox: "Control conversations, ownership, SLA and qualification.",
  Templates: "Control approved message templates and policy limits.",
  Partners: "Control introducers, attribution and relationship ownership.",
  Rewards: "Control reward rules and founder-confirmed payouts.",
  Searches: "Control discovery territories, ICP filters and run limits.",
  Scoring: "Control fit, risk, intent and delivery-feasibility scoring.",
  Automations: "Control what Orbit can run, retry, pause and escalate.",
  Integrations: "Control connected systems without exposing credentials.",
  Access: "Control roles, permissions, auditability and sensitive actions.",
  Activity: "See the immutable history of people, policies and automation.",
};

export function SourceAssetWorkspace({
  source,
  asset,
}: {
  source: SourceDefinition;
  asset: SourceAsset;
}) {
  const [activeTab, setActiveTab] = useState("Overview");
  const [monitoring, setMonitoring] = useState(asset.status !== "Draft");
  const [toast, setToast] = useState<string | null>(null);
  const [handledControls, setHandledControls] = useState<string[]>([]);
  const SourceIcon = sourceIcons[source.slug];

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const controls = useMemo(() => getControlsForTab(activeTab, source, asset), [activeTab, asset, source]);

  return (
    <LeadEnginePageShell>
      <div className={styles.workspace} data-accent={source.accent}>
        <nav className={styles.breadcrumbs} aria-label="Breadcrumb">
          <Link href={`/lead-engine/sources/${source.slug}`}>
            <TbArrowLeft aria-hidden />
            {source.label}
          </Link>
          <span>/</span>
          <span aria-current="page">{asset.name}</span>
        </nav>

        <header className={styles.assetHeader}>
          <div className={styles.sourceIdentity}>
            <span className={styles.assetMark}>
              <SourceIcon aria-hidden />
            </span>
            <div>
              <div className={styles.assetStatusLine}>
                <span className={asset.health === "Healthy" ? styles.statusGood : styles.statusWarning}>
                  {asset.health === "Healthy" ? <TbCircleCheck aria-hidden /> : <TbAlertTriangle aria-hidden />}
                  {asset.health}
                </span>
                <span>{asset.status}</span>
                <span>Demo control workspace</span>
              </div>
              <h1>{asset.name}</h1>
              <p>{asset.identifier} · {asset.summary}</p>
            </div>
          </div>

          <div className={styles.headerActions}>
            {asset.liveHref ? (
              <a className={styles.secondaryButton} href={asset.liveHref} target="_blank" rel="noreferrer">
                Open live
                <TbArrowUpRight aria-hidden />
              </a>
            ) : null}
            <button
              className={styles.secondaryButton}
              type="button"
              onClick={() => setToast("A fresh source sync has been queued for this preview.")}
            >
              <TbRefresh aria-hidden />
              Sync
            </button>
            <button
              className={monitoring ? styles.pauseButton : styles.primaryButton}
              type="button"
              onClick={() => {
                setMonitoring((current) => !current);
                setToast(monitoring ? "Monitoring paused safely." : "Monitoring resumed.");
              }}
            >
              {monitoring ? <TbPlayerPause aria-hidden /> : <TbPlayerPlay aria-hidden />}
              {monitoring ? "Pause" : "Resume"}
            </button>
          </div>
        </header>

        <section className={styles.assetSummaryGrid} aria-label={`${asset.name} summary`}>
          <article>
            <span>Leads · 30 days</span>
            <strong>{asset.leads}</strong>
            <small>Every lead keeps its source evidence</small>
          </article>
          <article>
            <span>Conversion</span>
            <strong>{asset.conversion}</strong>
            <small>Qualified conversion across active paths</small>
          </article>
          <article>
            <span>Owner</span>
            <strong>{asset.owner}</strong>
            <small>One accountable operating owner</small>
          </article>
          <article>
            <span>Last sync</span>
            <strong>{asset.lastSync}</strong>
            <small>{monitoring ? "Monitoring is active" : "Monitoring is paused"}</small>
          </article>
        </section>

        <nav className={styles.tabs} aria-label={`${asset.name} controls`}>
          {source.tabs.map((tab) => (
            <button
              type="button"
              key={tab}
              className={activeTab === tab ? styles.tabActive : ""}
              onClick={() => setActiveTab(tab)}
              aria-pressed={activeTab === tab}
            >
              {tab}
            </button>
          ))}
        </nav>

        {activeTab === "Overview" ? (
          <OverviewPanel source={source} asset={asset} monitoring={monitoring} onNotice={setToast} />
        ) : (
          <div className={styles.detailGrid}>
            <section className={styles.detailPanel} aria-labelledby="active-tab-heading">
              <div className={styles.detailHeading}>
                <div>
                  <span className={styles.titleEyebrow}>{source.label} control area</span>
                  <h2 id="active-tab-heading">{activeTab}</h2>
                  <p>{tabDescriptions[activeTab] ?? `Control ${activeTab.toLowerCase()} for this ${source.singular}.`}</p>
                </div>
                <button type="button" onClick={() => setToast(`${activeTab} settings are ready for the integration phase.`)}>
                  <TbSettings aria-hidden />
                  Configure
                </button>
              </div>

              <div className={styles.controlRows}>
                {controls.map((control) => {
                  const handled = handledControls.includes(control.title);
                  return (
                    <article className={styles.manageRow} key={control.title}>
                      <span className={`${styles.manageIcon} ${control.tone === "watch" ? styles.manageWatch : ""}`}>
                        {control.tone === "protected" ? <TbLock aria-hidden /> : control.tone === "watch" ? <TbAlertTriangle aria-hidden /> : <TbCheck aria-hidden />}
                      </span>
                      <span className={styles.manageCopy}>
                        <strong>{control.title}</strong>
                        <small>{control.detail}</small>
                      </span>
                      <span className={`${styles.manageStatus} ${control.tone === "watch" ? styles.statusWarning : styles.statusGood}`}>
                        {handled ? "Reviewed" : control.status}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setHandledControls((current) =>
                            current.includes(control.title) ? current : [...current, control.title],
                          );
                          setToast(`${control.title} opened in preview control mode.`);
                        }}
                      >
                        {handled ? "Reviewed" : "Manage"}
                        <TbChevronRight aria-hidden />
                      </button>
                    </article>
                  );
                })}
              </div>
            </section>

            <aside className={styles.detailSidebar}>
              <section className={styles.guardrailCard}>
                <TbShieldCheck aria-hidden />
                <div>
                  <span className={styles.titleEyebrow}>Always enforced</span>
                  <h2>Orbit guardrails</h2>
                </div>
                <ul>
                  <li><TbCheck aria-hidden /> Routine work stays inside policy</li>
                  <li><TbCheck aria-hidden /> Sensitive changes reach the founder</li>
                  <li><TbCheck aria-hidden /> Credentials are never shown here</li>
                  <li><TbCheck aria-hidden /> Every action enters the audit log</li>
                </ul>
              </section>

              <section className={styles.contextCard}>
                <div className={styles.panelHeaderCompact}>
                  <h2>Live context</h2>
                  <TbActivity aria-hidden />
                </div>
                <dl>
                  <div><dt>Source</dt><dd>{source.label}</dd></div>
                  <div><dt>Asset</dt><dd>{asset.identifier}</dd></div>
                  <div><dt>Owner</dt><dd>{asset.owner}</dd></div>
                  <div><dt>Policy</dt><dd>Urava Lead Policy v1</dd></div>
                  <div><dt>Monitoring</dt><dd>{monitoring ? "Active" : "Paused"}</dd></div>
                </dl>
              </section>
            </aside>
          </div>
        )}

        <div className={`${styles.toast} ${toast ? styles.toastVisible : ""}`} role="status" aria-live="polite">
          <TbActivity aria-hidden />
          {toast}
        </div>
      </div>
    </LeadEnginePageShell>
  );
}

function OverviewPanel({
  source,
  asset,
  monitoring,
  onNotice,
}: {
  source: SourceDefinition;
  asset: SourceAsset;
  monitoring: boolean;
  onNotice: (message: string) => void;
}) {
  const healthItems = [
    { label: "Connection", detail: `Latest source sync: ${asset.lastSync}`, good: asset.status !== "Draft" },
    { label: "Lead routing", detail: "Verified leads enter Unified Inbox with source evidence", good: true },
    { label: "Conversion tracking", detail: asset.health === "Setup required" ? "One conversion event still needs setup" : "Core conversion events are active", good: asset.health !== "Setup required" },
    { label: "Security", detail: "Least-privilege access and action logging enforced", good: true },
  ];

  return (
    <div className={styles.overviewGrid}>
      <section className={styles.detailPanel} aria-labelledby="operating-health-heading">
        <div className={styles.detailHeading}>
          <div>
            <span className={styles.titleEyebrow}>Current state</span>
            <h2 id="operating-health-heading">Operating health</h2>
            <p>What is working, what is blocked and what Orbit will do next.</p>
          </div>
          <span className={monitoring ? styles.monitoringActive : styles.monitoringPaused}>
            <i aria-hidden />
            {monitoring ? "Monitoring active" : "Monitoring paused"}
          </span>
        </div>

        <div className={styles.healthList}>
          {healthItems.map((item) => (
            <article key={item.label}>
              <span className={item.good ? styles.healthIconGood : styles.healthIconWatch}>
                {item.good ? <TbCheck aria-hidden /> : <TbAlertTriangle aria-hidden />}
              </span>
              <span>
                <strong>{item.label}</strong>
                <small>{item.detail}</small>
              </span>
              <b>{item.good ? "Healthy" : "Action needed"}</b>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.journeyPanel} aria-labelledby="journey-heading">
        <div className={styles.detailHeading}>
          <div>
            <span className={styles.titleEyebrow}>Revenue path</span>
            <h2 id="journey-heading">From {source.label.toLowerCase()} to client</h2>
            <p>Orbit preserves the path instead of hiding it inside one lead count.</p>
          </div>
        </div>
        <div className={styles.journeySteps}>
          {[
            [source.label, "Attention captured"],
            ["Unified Inbox", "Lead verified"],
            ["Qualification", "Fit and intent scored"],
            ["Urava Studio", "Next action assigned"],
          ].map(([title, detail], index) => (
            <article key={title}>
              <span>{index + 1}</span>
              <div><strong>{title}</strong><small>{detail}</small></div>
              {index < 3 ? <TbArrowRight aria-hidden /> : <TbCheck aria-hidden />}
            </article>
          ))}
        </div>
      </section>

      <section className={styles.controlMap} aria-labelledby="control-map-heading">
        <div className={styles.detailHeading}>
          <div>
            <span className={styles.titleEyebrow}>Control depth</span>
            <h2 id="control-map-heading">Everything stays reachable</h2>
            <p>Open a control area above; routine actions stay automated and exceptions stay visible.</p>
          </div>
        </div>
        <div className={styles.controlMapGrid}>
          {[
            { icon: TbTargetArrow, title: "Capture", detail: "Leads and source evidence" },
            { icon: TbChartDots3, title: "Measure", detail: "Traffic, actions and conversion" },
            { icon: TbBolt, title: "Automate", detail: "Routing, follow-up and retries" },
            { icon: TbKey, title: "Protect", detail: "Roles, policies and audit logs" },
          ].map(({ icon: ItemIcon, title, detail }) => (
            <button type="button" key={title} onClick={() => onNotice(`${title} controls are available in the tabs above.`)}>
              <ItemIcon aria-hidden />
              <span><strong>{title}</strong><small>{detail}</small></span>
              <TbChevronRight aria-hidden />
            </button>
          ))}
        </div>
      </section>

      <aside className={styles.nextActionCard}>
        <span className={asset.health === "Healthy" ? styles.nextActionGood : styles.nextActionWatch}>
          {asset.health === "Healthy" ? <TbCircleCheck aria-hidden /> : <TbAlertTriangle aria-hidden />}
        </span>
        <span className={styles.titleEyebrow}>Orbit recommendation</span>
        <h2>{asset.health === "Healthy" ? "No founder action needed" : "Complete one setup action"}</h2>
        <p>
          {asset.health === "Healthy"
            ? "Routine monitoring, lead routing and audit logging are operating inside policy."
            : "Resolve the flagged tracking or connection gap before Orbit treats this asset as fully autonomous."}
        </p>
        <button type="button" onClick={() => onNotice("Recommendation opened in founder control mode.")}>Review recommendation <TbArrowRight aria-hidden /></button>
      </aside>
    </div>
  );
}

function getControlsForTab(tab: string, source: SourceDefinition, asset: SourceAsset): ControlRow[] {
  const standard: Record<string, ControlRow[]> = {
    Leads: [
      { title: "Unified Inbox routing", detail: `Every verified ${source.label.toLowerCase()} lead keeps its source evidence.`, status: "Active", tone: "good" },
      { title: "Qualification gate", detail: "Need, fit, intent, budget and decision authority are scored before outreach.", status: "Policy locked", tone: "protected" },
      { title: "Response ownership", detail: `Primary owner: ${asset.owner}. Exceptions cannot remain ownerless.`, status: "Assigned", tone: "good" },
    ],
    Analytics: [
      { title: "Source attribution", detail: "First touch, last touch and conversion path remain attached to each lead.", status: "Active", tone: "good" },
      { title: "Conversion events", detail: "Lead, qualified lead, booked call and client events are measured separately.", status: asset.health === "Setup required" ? "Incomplete" : "Healthy", tone: asset.health === "Setup required" ? "watch" : "good" },
      { title: "Founder reporting", detail: "Only decisions, anomalies and revenue movement reach the founder view.", status: "Weekly", tone: "protected" },
    ],
    Automations: [
      { title: "Bounded execution", detail: "Orbit can run routine actions only inside the approved source policy.", status: "Policy locked", tone: "protected" },
      { title: "Retry and quarantine", detail: "Failed jobs retry with limits, then move to a visible exception queue.", status: "Active", tone: "good" },
      { title: "Emergency stop", detail: "Founder can pause this asset without disabling the rest of Lead Engine.", status: "Ready", tone: "protected" },
    ],
    Integrations: [
      { title: "Operational data connection", detail: "Lead and activity events sync without exposing provider credentials.", status: asset.status === "Draft" ? "Not connected" : "Connected", tone: asset.status === "Draft" ? "watch" : "good" },
      { title: "Failure monitoring", detail: "Sync delays and schema failures create exceptions instead of silent data loss.", status: "Active", tone: "good" },
      { title: "Secret boundary", detail: "Tokens remain server-side and are never rendered in Orbit controls.", status: "Protected", tone: "protected" },
    ],
    Access: [
      { title: "Founder ownership", detail: "Authority limits and irreversible changes remain founder-controlled.", status: "Protected", tone: "protected" },
      { title: "Least-privilege roles", detail: "Operators see only the controls and data required for their assigned work.", status: "Enforced", tone: "good" },
      { title: "Credential isolation", detail: "Students and routine operators never receive production secrets.", status: "Enforced", tone: "protected" },
    ],
    Activity: [
      { title: "Source sync", detail: `${asset.name} synchronized ${asset.lastSync}.`, status: "Recorded", tone: "good" },
      { title: "Policy evaluation", detail: "Latest automated actions remained inside Urava Lead Policy v1.", status: "Passed", tone: "good" },
      { title: "Audit retention", detail: "Actor, policy, data touched, outcome and timestamp are preserved.", status: "Immutable", tone: "protected" },
    ],
  };

  if (standard[tab]) return standard[tab];

  const specialised: Record<string, ControlRow[]> = {
    "Pages & Content": contentControls("pages and content", "publishing", asset),
    Content: contentControls("content", "publishing", asset),
    Posts: contentControls("posts", "publishing", asset),
    Profiles: contentControls("profile information", "visibility", asset),
    Partners: contentControls("partners", "relationship ownership", asset),
    Searches: contentControls("search runs", "ICP territory", asset),
    SEO: diagnosticControls("Search indexation", "Technical SEO scan", "Query opportunity queue", asset),
    Search: diagnosticControls("Search visibility", "Index coverage", "Query opportunity queue", asset),
    Forms: diagnosticControls("Form submission health", "Spam and consent guard", "Conversion routing", asset),
    DMs: diagnosticControls("Conversation capture", "Qualification prompts", "Opt-out protection", asset),
    Messages: diagnosticControls("Message capture", "Response ownership", "Opt-out protection", asset),
    Reviews: diagnosticControls("Review monitor", "Policy-safe reply drafts", "Reputation escalation", asset),
    Inbox: diagnosticControls("Conversation queue", "Response SLA", "Owner assignment", asset),
    Templates: diagnosticControls("Approved templates", "Follow-up limits", "Language clarity", asset),
    Rewards: diagnosticControls("Referral attribution", "Reward eligibility", "Founder payout gate", asset),
    Scoring: diagnosticControls("ICP fit score", "Contact confidence", "Delivery feasibility", asset),
  };

  return specialised[tab] ?? diagnosticControls(`${tab} inventory`, `${tab} quality gate`, `${tab} ownership`, asset);
}

function contentControls(inventory: string, policy: string, asset: SourceAsset): ControlRow[] {
  return [
    { title: `Active ${inventory}`, detail: `See what is live, planned or blocked for ${asset.name}.`, status: "Visible", tone: "good" },
    { title: `${policy[0].toUpperCase()}${policy.slice(1)} policy`, detail: "Only approved claims, proof and next actions can publish automatically.", status: "Policy locked", tone: "protected" },
    { title: "Owner and next action", detail: "Every draft has one accountable owner and one explicit next action.", status: "Assigned", tone: "good" },
  ];
}

function diagnosticControls(first: string, second: string, third: string, asset: SourceAsset): ControlRow[] {
  return [
    { title: first, detail: `Live health and operating state for ${asset.name}.`, status: asset.health === "Healthy" ? "Healthy" : "Review", tone: asset.health === "Healthy" ? "good" : "watch" },
    { title: second, detail: "Orbit checks quality automatically and creates an exception when policy is crossed.", status: "Active", tone: "good" },
    { title: third, detail: `Owner: ${asset.owner}. Sensitive changes require founder authority.`, status: "Protected", tone: "protected" },
  ];
}
