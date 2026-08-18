"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { Check, CircleAlert, KeyRound, LockKeyhole, ShieldCheck, X } from "lucide-react";
import styles from "./ConnectionFlowModal.module.css";

export type ConnectionFlowState = "done" | "current" | "pending" | "error";

export type ConnectionFlowStep = {
  title: string;
  description: string;
  state: ConnectionFlowState;
};

export type ConnectionStatusItem = {
  label: string;
  detail: string;
  badge: string;
  state: ConnectionFlowState;
};

export type ConnectionSuccessItem = {
  label: string;
  detail: string;
  state: "done" | "pending";
};

type Props = {
  open: boolean;
  title: string;
  subtitle: string;
  providerName: string;
  providerDescription: string;
  providerMark?: string;
  steps: ConnectionFlowStep[];
  statuses: ConnectionStatusItem[];
  successPath: ConnectionSuccessItem[];
  notice?: string | null;
  error?: string | null;
  securityText?: string;
  children: ReactNode;
  onClose?: () => void;
};

function StateGlyph({ state }: { state: ConnectionFlowState }) {
  if (state === "done") return <Check size={14} aria-hidden="true" />;
  if (state === "error") return <CircleAlert size={14} aria-hidden="true" />;
  if (state === "current") return <KeyRound size={14} aria-hidden="true" />;
  return <ShieldCheck size={14} aria-hidden="true" />;
}

export function ConnectionFlowModal({
  open,
  title,
  subtitle,
  providerName,
  providerDescription,
  providerMark,
  steps,
  statuses,
  successPath,
  notice,
  error,
  securityText = "Credentials are validated on the server, encrypted before storage, and are never returned to browser code.",
  children,
  onClose,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className={styles.backdrop} role="presentation" onMouseDown={(event) => {
      if (event.currentTarget === event.target) onClose?.();
    }}>
      <section className={styles.dialog} role="dialog" aria-modal="true" aria-label={title}>
        <header className={styles.header}>
          <div className={styles.identity}>
            <div className={styles.mark} aria-hidden="true"><strong>{providerMark ?? providerName.slice(0, 2).toUpperCase()}</strong></div>
            <div>
              <h2>{title}</h2>
              <p>{subtitle}</p>
            </div>
          </div>
          <button className={styles.close} type="button" aria-label="Close connection setup" onClick={onClose}>
            <X size={17} />
          </button>
        </header>

        <div className={styles.body}>
          <aside className={`${styles.panel} ${styles.steps}`} aria-label="Connection steps">
            {steps.map((step, index) => (
              <div className={styles.step} data-state={step.state} key={`${step.title}-${index}`}>
                <div className={styles.stepIndex}>{step.state === "done" ? <Check size={13} /> : index + 1}</div>
                <div><strong>{step.title}</strong><small>{step.description}</small></div>
              </div>
            ))}
          </aside>

          <article className={`${styles.panel} ${styles.content}`}>
            <div className={styles.providerHero}>
              <div className={styles.providerLogo}><strong>{providerMark ?? providerName.slice(0, 2).toUpperCase()}</strong></div>
              <div><h3>{providerName}</h3><p>{providerDescription}</p></div>
            </div>
            <div className={styles.actionArea}>
              {notice ? <div className={styles.notice}><Check size={13} /> <span>{notice}</span></div> : null}
              {error ? <div className={styles.error}><CircleAlert size={13} /> <span>{error}</span></div> : null}
              {children}
            </div>
          </article>

          <aside className={`${styles.panel} ${styles.status}`}>
            <h3>Setup status</h3>
            {statuses.map((item) => (
              <div className={styles.statusItem} data-state={item.state} key={item.label}>
                <div className={styles.statusIcon}><StateGlyph state={item.state} /></div>
                <div><strong>{item.label}</strong><small>{item.detail}</small></div>
                <span className={styles.badge}>{item.badge}</span>
              </div>
            ))}
            <div className={styles.securityNote}><LockKeyhole size={14} /><span>{securityText}</span></div>
          </aside>
        </div>

        <footer className={styles.successRail}>
          <div><h3>Your success path</h3><p>From connection to working capability, every step stays visible.</p></div>
          <div className={styles.successNodes}>
            {successPath.map((item, index) => (
              <div className={styles.successNode} data-state={item.state} key={item.label}>
                <div className={styles.successNodeCircle}>{item.state === "done" ? <Check size={13} /> : index + 1}</div>
                <div><strong>{item.label}</strong><small>{item.detail}</small></div>
                {index < successPath.length - 1 ? <span className={styles.connector} /> : null}
              </div>
            ))}
          </div>
        </footer>
      </section>
    </div>
  );
}

export { styles as connectionFlowStyles };
