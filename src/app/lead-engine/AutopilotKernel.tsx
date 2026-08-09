"use client";

import { useEffect, useState } from "react";
import {
  TbActivity,
  TbAlertTriangle,
  TbArrowUpRight,
  TbCash,
  TbCheck,
  TbCircleCheck,
  TbFileDescription,
  TbInbox,
  TbPlayerPause,
  TbPlayerPlay,
  TbRefresh,
  TbShieldCheck,
  TbStack2,
  TbTargetArrow,
  TbUsers,
} from "react-icons/tb";
import styles from "./lead-engine.module.css";
import {
  AUTHORITY_RULES,
  AUTOPILOT_STORAGE_KEY,
  CASHVERTISING_GATE,
  DEFAULT_PREFLIGHT_CHECKS,
  LOOP_STAGES,
  REPLY_CLASSES,
  completeAutopilotStart,
  completeAutopilotStop,
  createInitialAutopilotSnapshot,
  formatKernelTime,
  getGovernor,
  getQueueCounts,
  isAutopilotSnapshot,
  requestAutopilotStart,
  requestAutopilotStop,
  tickAutopilot,
  type AutopilotSnapshot,
  type AutopilotState,
  type QueueStatus,
} from "./autopilot-kernel";

type KernelTab = "system" | "authority" | "replies" | "learning";

const STATE_COPY: Record<
  AutopilotState,
  { label: string; title: string; detail: string; action: string }
> = {
  off: {
    label: "Off",
    title: "Autopilot is safely off",
    detail: "Discovery and unsent outreach are stopped. Inbound replies and paid work stay protected.",
    action: "Start engine",
  },
  checking: {
    label: "Checking",
    title: "Running preflight",
    detail: "Orbit is checking policy, capacity, working hours and every connected channel.",
    action: "Checking…",
  },
  running: {
    label: "Running",
    title: "Autopilot is running",
    detail: "Routine work is moving automatically. Only true exceptions reach the founder.",
    action: "Stop safely",
  },
  pausing: {
    label: "Pausing safely",
    title: "Finishing the safe stop",
    detail: "Unsent outreach is draining without abandoning inbound replies or paid delivery.",
    action: "Pausing…",
  },
  blocked: {
    label: "Blocked",
    title: "Autopilot needs one fix",
    detail: "A required safety check failed, so Orbit refused to release new work.",
    action: "Check again",
  },
  degraded: {
    label: "Degraded",
    title: "Autopilot is running with limits",
    detail: "Healthy channels continue while affected work is throttled and isolated.",
    action: "Stop safely",
  },
};

const QUEUE_STATUS_LABELS: Record<QueueStatus, string> = {
  queued: "Queued",
  running: "Running",
  retrying: "Retrying",
  waiting_approval: "Founder gate",
  quarantined: "Quarantined",
  completed: "Completed",
};

const tabs: Array<{ id: KernelTab; label: string }> = [
  { id: "system", label: "System" },
  { id: "authority", label: "Authority" },
  { id: "replies", label: "Replies + quality" },
  { id: "learning", label: "Profit learning" },
];

export function AutopilotKernel({
  onToast,
}: {
  onToast: (message: string) => void;
}) {
  const [snapshot, setSnapshot] = useState(createInitialAutopilotSnapshot);
  const [activeTab, setActiveTab] = useState<KernelTab>("system");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let savedSnapshot: AutopilotSnapshot | null = null;
    try {
      const saved = window.localStorage.getItem(AUTOPILOT_STORAGE_KEY);
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (isAutopilotSnapshot(parsed)) {
          savedSnapshot = normalizeSavedSnapshot(parsed);
        }
      }
    } catch {
      window.localStorage.removeItem(AUTOPILOT_STORAGE_KEY);
    }
    const timer = window.setTimeout(() => {
      if (savedSnapshot) setSnapshot(savedSnapshot);
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(AUTOPILOT_STORAGE_KEY, JSON.stringify(snapshot));
  }, [hydrated, snapshot]);

  useEffect(() => {
    if (snapshot.state !== "checking") return;
    const timer = window.setTimeout(() => {
      setSnapshot((current) =>
        completeAutopilotStart(current, DEFAULT_PREFLIGHT_CHECKS, new Date().toISOString()),
      );
      onToast("Preflight passed. Autopilot is running inside policy.");
    }, 1050);
    return () => window.clearTimeout(timer);
  }, [onToast, snapshot.state]);

  useEffect(() => {
    if (snapshot.state !== "pausing") return;
    const timer = window.setTimeout(() => {
      setSnapshot((current) => completeAutopilotStop(current, new Date().toISOString()));
      onToast("Autopilot stopped safely. Inbound replies and paid work remain protected.");
    }, 1050);
    return () => window.clearTimeout(timer);
  }, [onToast, snapshot.state]);

  useEffect(() => {
    if (!["running", "degraded"].includes(snapshot.state)) return;
    const interval = window.setInterval(() => {
      setSnapshot((current) => tickAutopilot(current, new Date().toISOString()));
    }, 5200);
    return () => window.clearInterval(interval);
  }, [snapshot.state]);

  const stateCopy = STATE_COPY[snapshot.state];
  const governor = getGovernor(snapshot.studioCapacity);
  const queueCounts = getQueueCounts(snapshot.jobs);
  const activeStage = LOOP_STAGES[snapshot.activeStageIndex] ?? LOOP_STAGES[0];
  const switchIsOn = ["checking", "running", "degraded"].includes(snapshot.state);
  const transitionInProgress = ["checking", "pausing"].includes(snapshot.state);
  const passedChecks = DEFAULT_PREFLIGHT_CHECKS.filter((check) => check.status === "pass").length;

  function toggleAutopilot() {
    const at = new Date().toISOString();
    if (["off", "blocked"].includes(snapshot.state)) {
      setSnapshot((current) => requestAutopilotStart(current, at));
      onToast("Orbit is running the seven-point preflight.");
      return;
    }
    setSnapshot((current) => requestAutopilotStop(current, at));
    onToast("Safe stop started. Orbit is draining unsent work.");
  }

  function resetPreview() {
    const freshSnapshot = createInitialAutopilotSnapshot();
    setSnapshot(freshSnapshot);
    window.localStorage.setItem(AUTOPILOT_STORAGE_KEY, JSON.stringify(freshSnapshot));
    onToast("Autopilot preview reset to a healthy running state.");
  }

  return (
    <section className={styles.kernelSection} aria-labelledby="autopilot-kernel-heading">
      <article className={`${styles.kernelHero} ${styles[`kernelState_${snapshot.state}`]}`}>
        <div className={styles.kernelIntro}>
          <div className={styles.kernelEyebrow}>
            <span className={styles.kernelStateBadge}>
              <i aria-hidden />
              {stateCopy.label}
            </span>
            <span>Cycle {snapshot.cycle}</span>
            <span>Demo data</span>
          </div>
          <h2 id="autopilot-kernel-heading">{stateCopy.title}</h2>
          <p>{stateCopy.detail}</p>

          <div className={styles.kernelContinuity} aria-label="Always protected work">
            <span>
              <TbInbox aria-hidden /> Inbound replies routed
            </span>
            <span>
              <TbStack2 aria-hidden /> Paid delivery protected
            </span>
            <span>
              <TbShieldCheck aria-hidden /> No duplicates on resume
            </span>
          </div>
        </div>

        <div className={styles.kernelMasterControl}>
          <span className={styles.masterControlLabel}>Master control</span>
          <button
            className={styles.masterSwitch}
            type="button"
            role="switch"
            aria-checked={switchIsOn}
            aria-describedby="autopilot-switch-description"
            disabled={transitionInProgress}
            onClick={toggleAutopilot}
          >
            <span className={styles.masterSwitchTrack} aria-hidden>
              <i />
            </span>
            <span>
              <strong>{stateCopy.action}</strong>
              <small id="autopilot-switch-description">
                {switchIsOn ? "Engine ON" : "Engine OFF"}
              </small>
            </span>
            {switchIsOn ? <TbPlayerPause aria-hidden /> : <TbPlayerPlay aria-hidden />}
          </button>
          <small className={styles.masterControlHint} aria-live="polite">
            {snapshot.state === "running"
              ? `${activeStage.label} · ${queueCounts.queued + queueCounts.retrying} waiting`
              : snapshot.state === "off"
                ? "Your records and queues are preserved"
                : stateCopy.label}
          </small>
        </div>
      </article>

      <div className={styles.kernelHealthGrid}>
        <KernelMetric
          icon={TbCircleCheck}
          label="Preflight"
          value={`${passedChecks}/${DEFAULT_PREFLIGHT_CHECKS.length}`}
          detail="Required checks clear"
          tone="good"
        />
        <KernelMetric
          icon={TbTargetArrow}
          label="Capacity governor"
          value={`${governor.outreachPace}%`}
          detail={`${governor.mode} acquisition pace`}
          tone={governor.mode === "Protect" ? "danger" : "good"}
        />
        <KernelMetric
          icon={TbActivity}
          label="Durable queue"
          value={`${snapshot.jobs.length}`}
          detail={`${queueCounts.retrying} retry · ${queueCounts.quarantined} quarantine`}
          tone={queueCounts.quarantined > 0 ? "warning" : "good"}
        />
        <KernelMetric
          icon={TbCash}
          label="Profit / 100 leads"
          value="PKR 184k"
          detail="Gross profit · demo cohort"
          tone="good"
        />
      </div>

      <article className={styles.liveLoopPanel} aria-labelledby="live-loop-heading">
        <div className={styles.liveLoopHeading}>
          <div>
            <span className={styles.livePulse} aria-hidden />
            <h3 id="live-loop-heading">Live acquisition loop</h3>
            <p>Orbit advances work only when policy, capacity and authority allow it.</p>
          </div>
          <span>
            Now: <strong>{activeStage.label}</strong>
          </span>
        </div>

        <div className={styles.loopScroller} tabIndex={0} aria-label="Autopilot loop stages">
          <ol className={styles.loopTrack}>
            {LOOP_STAGES.map((stage, index) => (
              <li
                className={index === snapshot.activeStageIndex ? styles.loopStageActive : ""}
                key={stage.id}
                aria-current={index === snapshot.activeStageIndex ? "step" : undefined}
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{stage.shortLabel}</strong>
                <small>{stage.count} items</small>
              </li>
            ))}
          </ol>
        </div>
      </article>

      <article className={styles.kernelControlCenter}>
        <div className={styles.kernelControlHeader}>
          <div>
            <h3>Autopilot control center</h3>
            <p>One switch outside; governed systems underneath.</p>
          </div>
          <div className={styles.kernelTabs} role="tablist" aria-label="Autopilot controls">
            {tabs.map((tab) => (
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                className={activeTab === tab.id ? styles.kernelTabActive : ""}
                onClick={() => setActiveTab(tab.id)}
                key={tab.id}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.kernelTabPanel} role="tabpanel">
          {activeTab === "system" ? (
            <SystemPanel
              snapshot={snapshot}
              governor={governor}
              queueCounts={queueCounts}
              onReset={resetPreview}
            />
          ) : null}
          {activeTab === "authority" ? <AuthorityPanel /> : null}
          {activeTab === "replies" ? <RepliesPanel /> : null}
          {activeTab === "learning" ? <LearningPanel /> : null}
        </div>
      </article>
    </section>
  );
}

function KernelMetric({
  icon: Icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: typeof TbActivity;
  label: string;
  value: string;
  detail: string;
  tone: "good" | "warning" | "danger";
}) {
  return (
    <article className={`${styles.kernelMetric} ${styles[`kernelMetric_${tone}`]}`}>
      <Icon aria-hidden />
      <span>
        <small>{label}</small>
        <strong>{value}</strong>
        <p>{detail}</p>
      </span>
    </article>
  );
}

function SystemPanel({
  snapshot,
  governor,
  queueCounts,
  onReset,
}: {
  snapshot: AutopilotSnapshot;
  governor: ReturnType<typeof getGovernor>;
  queueCounts: ReturnType<typeof getQueueCounts>;
  onReset: () => void;
}) {
  const visibleJobs = snapshot.jobs.filter((job) => job.status !== "completed").slice(0, 5);
  return (
    <div className={styles.systemPanelGrid}>
      <section className={styles.kernelSubpanel} aria-labelledby="preflight-heading">
        <div className={styles.kernelSubpanelHeading}>
          <div>
            <span>Safety gate</span>
            <h4 id="preflight-heading">Preflight</h4>
          </div>
          <b className={styles.goodPill}>{DEFAULT_PREFLIGHT_CHECKS.length}/{DEFAULT_PREFLIGHT_CHECKS.length} clear</b>
        </div>
        <ul className={styles.preflightList}>
          {DEFAULT_PREFLIGHT_CHECKS.map((check) => (
            <li key={check.id}>
              <TbCheck aria-hidden />
              <span>
                <strong>{check.label}</strong>
                <small>{check.detail}</small>
              </span>
            </li>
          ))}
        </ul>
        <div className={styles.governorBar}>
          <div>
            <span>Studio capacity</span>
            <strong>{snapshot.studioCapacity}%</strong>
          </div>
          <progress max="100" value={snapshot.studioCapacity} aria-label="Studio capacity" />
          <p>{governor.message}</p>
        </div>
      </section>

      <section className={styles.kernelSubpanel} aria-labelledby="durable-queue-heading">
        <div className={styles.kernelSubpanelHeading}>
          <div>
            <span>Idempotent + retryable</span>
            <h4 id="durable-queue-heading">Durable job queue</h4>
          </div>
          <button type="button" onClick={onReset}>
            <TbRefresh aria-hidden /> Reset demo
          </button>
        </div>

        <div className={styles.queueSummary}>
          <span><strong>{queueCounts.running}</strong> Running</span>
          <span><strong>{queueCounts.queued}</strong> Queued</span>
          <span><strong>{queueCounts.retrying}</strong> Retrying</span>
          <span><strong>{queueCounts.quarantined}</strong> Quarantine</span>
        </div>

        <div className={styles.queueList}>
          {visibleJobs.map((job) => (
            <article key={job.id}>
              <span className={`${styles.queueStatus} ${styles[`queueStatus_${job.status}`]}`}>
                {QUEUE_STATUS_LABELS[job.status]}
              </span>
              <div>
                <strong>{job.title}</strong>
                <small>{job.lead} · attempt {job.attempts}/{job.maxAttempts}</small>
              </div>
              <span className={`${styles.authorityDot} ${styles[`authority_${job.authority}`]}`}>
                {job.authority}
              </span>
            </article>
          ))}
        </div>

        <div className={styles.auditPreview}>
          <span>Latest audit</span>
          <strong>{snapshot.audit[0]?.action ?? "No actions yet"}</strong>
          <small>
            {snapshot.audit[0]?.detail ?? "Queue is waiting"}
            {snapshot.audit[0] ? ` · ${formatKernelTime(snapshot.audit[0].at)}` : ""}
          </small>
        </div>
      </section>
    </div>
  );
}

function AuthorityPanel() {
  return (
    <div className={styles.authorityGrid}>
      {AUTHORITY_RULES.map((rule) => (
        <section className={`${styles.authorityCard} ${styles[`authorityCard_${rule.level}`]}`} key={rule.level}>
          <div>
            <span>{rule.level}</span>
            <i aria-hidden />
          </div>
          <h4>{rule.title}</h4>
          <p>{rule.rule}</p>
          <ul>
            {rule.actions.map((action) => (
              <li key={action}><TbCheck aria-hidden /> {action}</li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function RepliesPanel() {
  return (
    <div className={styles.repliesGrid}>
      <section className={styles.kernelSubpanel}>
        <div className={styles.kernelSubpanelHeading}>
          <div>
            <span>Intent, not keywords</span>
            <h4>Reply + nurture engine</h4>
          </div>
          <b className={styles.goodPill}>10 classified</b>
        </div>
        <div className={styles.replyList}>
          {REPLY_CLASSES.map((reply) => (
            <article key={reply.label}>
              <span className={`${styles.replyTone} ${styles[`replyTone_${reply.tone}`]}`} aria-hidden />
              <div>
                <strong>{reply.label}</strong>
                <small>{reply.action}</small>
              </div>
              <b>{reply.count}</b>
            </article>
          ))}
        </div>
        <p className={styles.optOutRule}>
          <TbShieldCheck aria-hidden /> Opt-outs are suppressed across every future campaign.
        </p>
      </section>

      <section className={styles.kernelSubpanel}>
        <div className={styles.kernelSubpanelHeading}>
          <div>
            <span>Before every send</span>
            <h4>Cashvertising quality gate</h4>
          </div>
          <b className={styles.goodPill}>{CASHVERTISING_GATE.length}/{CASHVERTISING_GATE.length} pass</b>
        </div>
        <div className={styles.qualityScore}>
          <strong>94</strong>
          <span>Message quality</span>
          <small>Approved for policy-bound outreach</small>
        </div>
        <ul className={styles.qualityChecks}>
          {CASHVERTISING_GATE.map((check) => (
            <li key={check}><TbCircleCheck aria-hidden /> {check}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function LearningPanel() {
  return (
    <div className={styles.learningGrid}>
      <section className={styles.profitHero}>
        <span>Primary optimization target</span>
        <h4>PKR 184,000</h4>
        <p>Gross profit per 100 verified leads</p>
        <strong><TbArrowUpRight aria-hidden /> 12% vs previous cohort</strong>
        <small>Total lead volume is deliberately not the goal.</small>
      </section>

      <section className={styles.kernelSubpanel}>
        <div className={styles.kernelSubpanelHeading}>
          <div>
            <span>Source → offer → cash → proof</span>
            <h4>What Orbit learned</h4>
          </div>
          <b className={styles.recommendationPill}>Recommendation only</b>
        </div>
        <div className={styles.learningRows}>
          <article>
            <TbTargetArrow aria-hidden />
            <div><strong>Website leads create the best margin</strong><small>PKR 54k gross profit per 100 verified leads</small></div>
          </article>
          <article>
            <TbFileDescription aria-hidden />
            <div><strong>Benefit-first outreach wins</strong><small>18% more qualified replies than pain-first copy</small></div>
          </article>
          <article>
            <TbUsers aria-hidden />
            <div><strong>Proof shortens the close</strong><small>Case-study leads close 2.1 days faster</small></div>
          </article>
        </div>
        <p className={styles.learningGuardrail}>
          <TbAlertTriangle aria-hidden /> Orbit may recommend experiments; it never changes pricing or authority limits silently.
        </p>
      </section>
    </div>
  );
}

function normalizeSavedSnapshot(snapshot: AutopilotSnapshot): AutopilotSnapshot {
  if (snapshot.state === "checking" || snapshot.state === "pausing") {
    return { ...snapshot, state: "off" };
  }
  return snapshot;
}
