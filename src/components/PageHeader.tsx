import type { ReactNode } from "react";

type PageHeaderProps = {
  kicker: string;
  title: string;
  description: string;
  action?: ReactNode;
};

export function PageHeader({
  kicker,
  title,
  description,
  action,
}: PageHeaderProps) {
  return (
    <header className="page-header">
      <div>
        <span className="section-kicker">{kicker}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </header>
  );
}

