import Link from "next/link";
import {
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  Sparkles,
} from "lucide-react";
import type { FoundryHealth } from "@/lib/foundry";
import styles from "./FoundryUI.module.css";

export type FoundryProgressStage =
  | "introduced"
  | "practising"
  | "understood"
  | "applied"
  | "mastered";

export function foundryProgressStage(value: number): FoundryProgressStage {
  const safeValue = Math.max(0, Math.min(100, value));
  if (safeValue >= 85) return "mastered";
  if (safeValue >= 65) return "applied";
  if (safeValue >= 45) return "understood";
  if (safeValue >= 20) return "practising";
  return "introduced";
}

function progressStageLabel(stage: FoundryProgressStage) {
  if (stage === "practising") return "Practising";
  return stage.charAt(0).toUpperCase() + stage.slice(1);
}

export function FoundryNotice({
  notice,
  error,
}: {
  notice?: string;
  error?: string;
}) {
  if (!notice && !error) return null;
  return (
    <div
      className={`foundry-notice ${error ? "is-error" : "is-success"}`}
      role={error ? "alert" : "status"}
    >
      {error ? (
        <AlertCircle aria-hidden="true" size={18} />
      ) : (
        <CheckCircle2 aria-hidden="true" size={18} />
      )}
      <span>{error ?? notice}</span>
    </div>
  );
}

export function HealthBadge({
  health,
  label,
}: {
  health: FoundryHealth;
  label?: string;
}) {
  const visibleLabel =
    label ?? health.charAt(0).toUpperCase() + health.slice(1);

  return (
    <span
      aria-label={`Student health: ${health}`}
      className={`health-badge health-${health} ${visibleLabel ? "" : "is-compact"}`}
    >
      <i aria-hidden="true" />
      {visibleLabel}
    </span>
  );
}

export function FoundryProgressBar({
  value,
  compact = false,
}: {
  value: number;
  compact?: boolean;
}) {
  const safeValue = Math.max(0, Math.min(100, value));
  const stage = foundryProgressStage(safeValue);
  return (
    <div
      className={`foundry-progress ${compact ? "is-compact" : ""}`}
      aria-label={`${progressStageLabel(stage)} learning stage, ${safeValue}% recorded evidence`}
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={safeValue}
      role="progressbar"
    >
      <span style={{ width: `${safeValue}%` }} />
    </div>
  );
}

export function FoundryStageBadge({
  value,
  showEvidence = false,
}: {
  value: number;
  showEvidence?: boolean;
}) {
  const safeValue = Math.max(0, Math.min(100, value));
  const stage = foundryProgressStage(safeValue);
  return (
    <span className={styles.stageDetail}>
      <span className={styles.stage} data-stage={stage}>
        {progressStageLabel(stage)}
      </span>
      {showEvidence ? <small>{safeValue}% evidence</small> : null}
    </span>
  );
}

export function EmptyFoundryState({
  title,
  detail,
  href,
  action,
}: {
  title: string;
  detail: string;
  href?: string;
  action?: string;
}) {
  return (
    <div className="foundry-empty">
      <span className="foundry-empty-icon">
        <Sparkles aria-hidden="true" size={24} />
      </span>
      <strong>{title}</strong>
      <p>{detail}</p>
      {href && action ? (
        <Link className="foundry-text-link" href={href}>
          {action} <ArrowUpRight aria-hidden="true" size={15} />
        </Link>
      ) : null}
    </div>
  );
}

export function DuePill({
  label,
  urgent = false,
}: {
  label: string;
  urgent?: boolean;
}) {
  return (
    <span className={`due-pill ${urgent ? "is-urgent" : ""}`}>
      <Clock3 aria-hidden="true" size={13} />
      {label}
    </span>
  );
}
