import Link from "next/link";
import {
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  Sparkles,
} from "lucide-react";
import type { FoundryHealth } from "@/lib/foundry";

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
  return (
    <span className={`health-badge health-${health}`}>
      <i aria-hidden="true" />
      {label ?? health.charAt(0).toUpperCase() + health.slice(1)}
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
  return (
    <div
      className={`foundry-progress ${compact ? "is-compact" : ""}`}
      aria-label={`${safeValue}% progress`}
    >
      <span style={{ width: `${safeValue}%` }} />
    </div>
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
