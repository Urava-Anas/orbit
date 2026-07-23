"use client";

import { AlertTriangle } from "lucide-react";

export default function DashboardError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="page">
      <div className="empty-state panel">
        <div>
          <span className="empty-state-icon">
            <AlertTriangle size={22} aria-hidden="true" />
          </span>
          <h3>Orbit could not load this state</h3>
          <p>
            No success was assumed. Retry the secure request; if it fails again,
            the event requires investigation.
          </p>
          <button
            className="button button-primary"
            onClick={reset}
            style={{ marginTop: 18 }}
            type="button"
          >
            Retry
          </button>
        </div>
      </div>
    </div>
  );
}
