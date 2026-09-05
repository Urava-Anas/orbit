"use client";

import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Banknote,
  Check,
  ClipboardCheck,
  Gauge,
  Hand,
  Radar,
  Rocket,
  Sparkles,
  Users,
  Workflow,
} from "lucide-react";
import { SubmitButton } from "@/components/SubmitButton";
import { ORBIT_TRIAL_DAYS } from "@/lib/orbit-plans";
import { completeFounderOnboarding } from "./actions";
import styles from "./onboarding.module.css";

const priorities = [
  { key: "growth", label: "Leads & sales", detail: "Pipeline, outreach and next actions", icon: Radar },
  { key: "delivery", label: "Projects & delivery", detail: "Work, deadlines and client progress", icon: Workflow },
  { key: "cash", label: "Cash", detail: "Money in, money due and financial risk", icon: Banknote },
  { key: "people", label: "Team", detail: "People, responsibilities and capacity", icon: Users },
  { key: "approvals", label: "Approvals", detail: "Decisions that need founder authority", icon: ClipboardCheck },
  { key: "overview", label: "Company overview", detail: "One command view of what matters", icon: Gauge },
] as const;

const operatingModes = [
  {
    key: "recommend",
    label: "Recommend first",
    detail: "Orbit analyses and recommends. You make the move.",
    icon: Hand,
  },
  {
    key: "prepare",
    label: "Prepare for approval",
    detail: "Orbit prepares actions and places them in your approval queue.",
    icon: ClipboardCheck,
  },
  {
    key: "governed",
    label: "Governed automation",
    detail: "Orbit may execute low-risk actions only inside explicit policy boundaries.",
    icon: Rocket,
  },
] as const;

const priorityLabel = Object.fromEntries(priorities.map((item) => [item.key, item.label]));

export function OnboardingExperience({ defaultWorkspaceName }: { defaultWorkspaceName: string }) {
  const [step, setStep] = useState(1);
  const [workspaceName, setWorkspaceName] = useState(defaultWorkspaceName);
  const [selected, setSelected] = useState<string[]>(["overview", "growth"]);
  const [mode, setMode] = useState("recommend");
  const [localError, setLocalError] = useState<string | null>(null);

  const selectedLabels = useMemo(
    () => selected.map((item) => priorityLabel[item] ?? item),
    [selected],
  );

  function next() {
    setLocalError(null);
    if (step === 1 && workspaceName.trim().length < 2) {
      setLocalError("Give the organisation a name before continuing.");
      return;
    }
    if (step === 2 && selected.length < 1) {
      setLocalError("Choose at least one starting priority.");
      return;
    }
    setStep((current) => Math.min(4, current + 1));
  }

  function previous() {
    setLocalError(null);
    setStep((current) => Math.max(1, current - 1));
  }

  function togglePriority(key: string) {
    setLocalError(null);
    setSelected((current) => {
      if (current.includes(key)) return current.filter((item) => item !== key);
      if (current.length >= 4) {
        setLocalError("Start focused: choose up to four priorities.");
        return current;
      }
      return [...current, key];
    });
  }

  return (
    <form action={completeFounderOnboarding} className={styles.experience}>
      <div className={styles.progress} aria-label={`Setup step ${step} of 4`}>
        {[1, 2, 3, 4].map((item) => (
          <span key={item} className={item <= step ? styles.progressActive : ""} />
        ))}
      </div>

      {localError ? <div className={styles.localError} role="alert">{localError}</div> : null}

      <section className={`${styles.stepPanel} ${step === 1 ? styles.activeStep : ""}`} aria-hidden={step !== 1}>
        <div className={styles.stepNumber}>01 · Your organisation</div>
        <h1>What should Orbit operate around?</h1>
        <p>Start with the real company name. You can rename the workspace later.</p>
        <label className={styles.bigField}>
          <span>Organisation / workspace name</span>
          <input
            name="workspace_name"
            type="text"
            minLength={2}
            maxLength={80}
            autoComplete="organization"
            value={workspaceName}
            onChange={(event) => setWorkspaceName(event.target.value)}
            required
          />
        </label>
      </section>

      <section className={`${styles.stepPanel} ${step === 2 ? styles.activeStep : ""}`} aria-hidden={step !== 2}>
        <div className={styles.stepNumber}>02 · Starting focus</div>
        <h1>What do you want under control first?</h1>
        <p>Choose one to four. Orbit uses this to organise your starting workspace, not to limit what you can use.</p>
        <div className={styles.optionGrid}>
          {priorities.map((item) => {
            const Icon = item.icon;
            const active = selected.includes(item.key);
            return (
              <label key={item.key} className={`${styles.optionCard} ${active ? styles.optionSelected : ""}`}>
                <input
                  type="checkbox"
                  name="priorities"
                  value={item.key}
                  checked={active}
                  onChange={() => togglePriority(item.key)}
                />
                <span className={styles.optionIcon}><Icon size={19} /></span>
                <strong>{item.label}</strong>
                <small>{item.detail}</small>
                <span className={styles.checkMark}>{active ? <Check size={14} /> : null}</span>
              </label>
            );
          })}
        </div>
      </section>

      <section className={`${styles.stepPanel} ${step === 3 ? styles.activeStep : ""}`} aria-hidden={step !== 3}>
        <div className={styles.stepNumber}>03 · Operating posture</div>
        <h1>How should Orbit work with you?</h1>
        <p>This is a starting preference, not a permission grant. Sensitive actions still follow policy and authority.</p>
        <div className={styles.modeGrid}>
          {operatingModes.map((item) => {
            const Icon = item.icon;
            const active = mode === item.key;
            return (
              <label key={item.key} className={`${styles.modeCard} ${active ? styles.optionSelected : ""}`}>
                <input
                  type="radio"
                  name="operating_mode"
                  value={item.key}
                  checked={active}
                  onChange={() => setMode(item.key)}
                />
                <span className={styles.optionIcon}><Icon size={20} /></span>
                <strong>{item.label}</strong>
                <small>{item.detail}</small>
                <span className={styles.checkMark}>{active ? <Check size={14} /> : null}</span>
              </label>
            );
          })}
        </div>
      </section>

      <section className={`${styles.stepPanel} ${step === 4 ? styles.activeStep : ""}`} aria-hidden={step !== 4}>
        <div className={styles.stepNumber}>04 · Review</div>
        <h1>Your Orbit is ready to create.</h1>
        <p>The trial clock starts only when you press the final button below.</p>

        <div className={styles.reviewCard}>
          <div>
            <span>Organisation</span>
            <strong>{workspaceName || "Your organisation"}</strong>
          </div>
          <div>
            <span>Starting focus</span>
            <strong>{selectedLabels.join(" · ")}</strong>
          </div>
          <div>
            <span>Operating posture</span>
            <strong>{operatingModes.find((item) => item.key === mode)?.label}</strong>
          </div>
        </div>

        <div className={styles.trialPromise}>
          <Sparkles size={18} />
          <div>
            <strong>{ORBIT_TRIAL_DAYS} full days on Business</strong>
            <span>No payment method at this stage. One organisation-scoped workspace.</span>
          </div>
        </div>
      </section>

      <footer className={styles.controls}>
        {step > 1 ? (
          <button type="button" className={styles.backButton} onClick={previous}>
            <ArrowLeft size={15} /> Back
          </button>
        ) : <span />}

        {step < 4 ? (
          <button type="button" className={styles.nextButton} onClick={next}>
            Continue <ArrowRight size={15} />
          </button>
        ) : (
          <SubmitButton
            idleLabel={`Start my ${ORBIT_TRIAL_DAYS}-day trial`}
            pendingLabel="Creating your Orbit…"
          />
        )}
      </footer>
    </form>
  );
}
