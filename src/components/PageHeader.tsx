import type { ReactNode } from "react";
import styles from "./PageHeader.module.css";

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
    <header className={`page-header ${styles.header}`}>
      <div className={styles.copy}>
        <span className="section-kicker">{kicker}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action ? <div className={styles.actions}>{action}</div> : null}
    </header>
  );
}
