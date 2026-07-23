import type { LucideIcon } from "lucide-react";

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description: string;
};

export function EmptyState({
  icon: Icon,
  title,
  description,
}: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div>
        <span className="empty-state-icon">
          <Icon size={22} strokeWidth={1.7} aria-hidden="true" />
        </span>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
    </div>
  );
}

