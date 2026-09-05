"use client";

import Link from "next/link";
import { AlertTriangle, RefreshCw, Settings2 } from "lucide-react";
import styles from "./ContentState.module.css";

export default function ContentEngineError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className={styles.state}>
      <section className={styles.card} role="alert">
        <div className={styles.icon}><AlertTriangle size={18} /></div>
        <h2>Content Engine could not load safely</h2>
        <p>Orbit stopped this view instead of showing incomplete operational data. Retry the read first; if the problem remains, review Content Engine readiness and connections.</p>
        <div className={styles.actions}>
          <button type="button" onClick={reset}><RefreshCw size={13} /> Retry</button>
          <Link href="/dashboard/content/settings"><Settings2 size={13} /> Settings</Link>
        </div>
      </section>
    </main>
  );
}
