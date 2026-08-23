"use client";

import { useEffect } from "react";

const START_PATHS: Record<string, string> = {
  github: "/api/integrations/github/start",
  vercel: "/api/integrations/vercel/start",
  google_search_console: "/api/integrations/oauth/google_search_console/start",
  google_analytics: "/api/integrations/oauth/google_analytics/start",
  meta: "/api/integrations/oauth/meta/start",
  linkedin: "/api/integrations/oauth/linkedin/start",
};

type Props = {
  provider: string;
  label: string;
};

export function OAuthConnectionLauncher({ provider, label }: Props) {
  const startPath = START_PATHS[provider];

  useEffect(() => {
    if (startPath) window.location.replace(startPath);
  }, [startPath]);

  return (
    <main
      style={{
        minHeight: "70vh",
        display: "grid",
        placeItems: "center",
        padding: "40px 20px",
        textAlign: "center",
      }}
    >
      <div style={{ maxWidth: 520 }}>
        <p style={{ opacity: 0.72, marginBottom: 10 }}>Orbit connection</p>
        <h1 style={{ marginBottom: 12 }}>Opening {label}…</h1>
        <p style={{ opacity: 0.72, marginBottom: 20 }}>
          Orbit is handing this connection to the provider securely.
        </p>
        <a href={startPath}>Continue if nothing happens</a>
      </div>
    </main>
  );
}
