import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import styles from "./EmptyState.module.css";

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
};

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className={`empty-state ${styles.empty}`}>
      <div>
        <span className="empty-state-icon">
          <Icon size={22} strokeWidth={1.7} aria-hidden="true" />
        </span>
        <h3>{title}</h3>
        <p>{description}</p>
        {action ? <div className={styles.action}>{action}</div> : null}
      </div>
    </div>
  );
}
