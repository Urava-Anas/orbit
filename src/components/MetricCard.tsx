import type { LucideIcon } from "lucide-react";
import styles from "./MetricCard.module.css";

type MetricTone = "neutral" | "accent" | "info" | "success" | "warning" | "danger";

type MetricCardProps = {
  label: string;
  value: string | number;
  note: string;
  icon?: LucideIcon;
  tone?: MetricTone;
};

export function MetricCard({
  label,
  value,
  note,
  icon: Icon,
  tone = "neutral",
}: MetricCardProps) {
  return (
    <article className={`metric-card ${styles.card}`} data-tone={tone}>
      <div className={styles.topline}>
        <span>{label}</span>
        {Icon ? (
          <div className={styles.icon} aria-hidden="true">
            <Icon size={17} strokeWidth={1.8} />
          </div>
        ) : null}
      </div>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}
