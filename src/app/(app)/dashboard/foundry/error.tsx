"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";

export default function FoundryError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="foundry-page">
      <section className="foundry-role-error" role="alert">
        <span>
          <AlertTriangle aria-hidden="true" size={24} />
        </span>
        <small>Secure data connection interrupted</small>
        <h1>Founder Command could not load safely.</h1>
        <p>
          No decision has been assumed and no record was changed. Retry the
          secure request to restore the live operating view.
        </p>
        <button
          className="foundry-button foundry-button-primary"
          onClick={reset}
          type="button"
        >
          Retry Founder Command
          <RefreshCw aria-hidden="true" size={16} />
        </button>
      </section>
    </div>
  );
}
