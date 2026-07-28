"use client";

import { RefreshCw, ShieldAlert } from "lucide-react";

export default function StudentError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section className="student-role-error" role="alert">
      <span>
        <ShieldAlert aria-hidden="true" size={26} />
      </span>
      <small>Temporary connection problem</small>
      <h1>Aap ka record abhi load nahi ho saka</h1>
      <p>
        Aap ka work safe hai. Internet check karke dobara try karein—koi record
        delete ya change nahi hua.
      </p>
      <button className="student-primary-action" onClick={reset} type="button">
        Dobara try karein
        <RefreshCw aria-hidden="true" size={16} />
      </button>
    </section>
  );
}
