"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ExternalLink, PlugZap, ShieldCheck } from "lucide-react";
import { ConnectionFlowModal, type ConnectionFlowStep, type ConnectionStatusItem, type ConnectionSuccessItem } from "./ConnectionFlowModal";
import styles from "./ConnectionFlowModal.module.css";

type ProviderId = "github" | "vercel" | "google_search_console" | "google_analytics" | "meta" | "linkedin";

type ProviderConfig = {
  name: string;
  mark: string;
  description: string;
  authLabel: string;
  connectPath?: string;
  manageUrl?: string;
  unlock: string;
};

type RuntimeStatus = {
  connected: boolean;
  status: string;
  accountName: string | null;
  accountType: string | null;
  assetCount: number;
  platformReady: boolean;
};

const providers: Record<ProviderId, ProviderConfig> = {
  github: {
    name: "GitHub",
    mark: "GH",
    description: "Repository access for delivery, website management and governed automation.",
    authLabel: "Continue with GitHub",
    connectPath: "/api/integrations/github/start",
    manageUrl: "https://github.com/settings/installations",
    unlock: "Approved repositories become available to Orbit delivery and automation tools.",
  },
  vercel: {
    name: "Vercel",
    mark: "V",
    description: "Deployment and project access for production delivery and website operations.",
    authLabel: "Continue with Vercel",
    connectPath: "/api/integrations/vercel/start",
    manageUrl: "https://vercel.com/dashboard/integrations",
    unlock: "Approved projects become available to Orbit deployment and production workflows.",
  },
  google_search_console: {
    name: "Search Console",
    mark: "SC",
    description: "Verified search properties for indexing health, visibility and SEO operations.",
    authLabel: "Connect Search Console",
    unlock: "Verified properties will power SEO and indexing workflows after the provider integration is enabled.",
  },
  google_analytics: {
    name: "Google Analytics",
    mark: "GA",
    description: "Traffic, acquisition and conversion analytics for Growth and Evidence.",
    authLabel: "Connect Google Analytics",
    unlock: "Analytics properties will power traffic and conversion reporting after the provider integration is enabled.",
  },
  meta: {
    name: "Meta",
    mark: "M",
    description: "Facebook Pages and Instagram business assets for Growth and Publishing.",
    authLabel: "Connect Meta",
    unlock: "Approved Meta assets will become available to publishing and growth workflows.",
  },
  linkedin: {
    name: "LinkedIn",
    mark: "in",
    description: "Organisation assets for professional publishing, outreach and lead operations.",
    authLabel: "Connect LinkedIn",
    unlock: "Approved organisation assets will become available to Growth and Publishing.",
  },
};

function isProvider(value: string | null): value is ProviderId {
  return Boolean(value && Object.prototype.hasOwnProperty.call(providers, value));
}

export function ConnectionFlowHubOverlay() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const providerId = searchParams.get("connection");
  const config = isProvider(providerId) ? providers[providerId] : null;
  const [runtime, setRuntime] = useState<RuntimeStatus | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!config || !providerId || pathname !== "/dashboard/plugins") {
      setRuntime(null);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    fetch(`/api/integrations/connection-status?provider=${encodeURIComponent(providerId)}`, {
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("status_failed");
        return response.json() as Promise<RuntimeStatus>;
      })
      .then((data) => setRuntime(data))
      .catch(() => {
        if (!controller.signal.aborted) setRuntime(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [config, pathname, providerId]);

  const close = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("connection");
    params.delete("notice");
    params.delete("error");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const flow = useMemo(() => {
    if (!config) return null;
    const connected = runtime?.connected === true;
    const platformReady = runtime?.platformReady === true;
    const authState = connected ? "done" : platformReady ? "current" : "pending";
    const steps: ConnectionFlowStep[] = [
      { title: "Connect account", description: `Authorize Orbit with ${config.name}.`, state: authState },
      { title: "Validate access", description: "Orbit verifies the provider response and account access.", state: connected ? "done" : "pending" },
      { title: "Review permissions", description: "Keep access inside the explicit provider permission boundary.", state: connected ? "done" : "pending" },
      { title: "Choose assets", description: "Use only the repositories, projects or properties you approve.", state: connected ? "done" : "pending" },
      { title: "Complete setup", description: "Unlock the provider inside the relevant Orbit modules.", state: connected ? "done" : "pending" },
    ];
    const statuses: ConnectionStatusItem[] = [
      { label: "Connection", detail: connected ? `${runtime?.accountName ?? config.name} is connected.` : platformReady ? "Ready for secure authorization." : "Provider setup is not enabled yet.", badge: connected ? "Connected" : platformReady ? "Ready" : "Pending", state: connected ? "done" : platformReady ? "current" : "pending" },
      { label: "Validation", detail: connected ? "Provider access has been verified." : "Runs immediately after authorization.", badge: connected ? "Verified" : "Waiting", state: connected ? "done" : "pending" },
      { label: "Permissions", detail: connected ? "Approved provider boundary is active." : "Explicit approval is required before use.", badge: connected ? "Approved" : "Pending", state: connected ? "done" : "pending" },
      { label: "Assets", detail: connected ? `${runtime?.assetCount ?? 0} approved asset${runtime?.assetCount === 1 ? "" : "s"}.` : "Selected during or after provider authorization.", badge: connected ? "Ready" : "Locked", state: connected ? "done" : "pending" },
      { label: "Security", detail: "Tokens and provider secrets stay on Orbit's server boundary.", badge: "Protected", state: "done" },
    ];
    const successPath: ConnectionSuccessItem[] = [
      { label: "Connected", detail: "Account linked", state: connected ? "done" : "pending" },
      { label: "Validated", detail: "Access verified", state: connected ? "done" : "pending" },
      { label: "Permissions approved", detail: "Boundary confirmed", state: connected ? "done" : "pending" },
      { label: "Assets selected", detail: "Resources scoped", state: connected ? "done" : "pending" },
      { label: "Ready in Orbit", detail: "Integration active", state: connected ? "done" : "pending" },
    ];
    return { connected, platformReady, steps, statuses, successPath };
  }, [config, runtime]);

  if (!config || !flow || pathname !== "/dashboard/plugins") return null;

  return (
    <ConnectionFlowModal
      open
      title={`Connect ${config.name}`}
      subtitle={`A guided setup from authorization to a working ${config.name} connection.`}
      providerName={config.name}
      providerDescription={config.description}
      providerMark={config.mark}
      steps={flow.steps}
      statuses={flow.statuses}
      successPath={flow.successPath}
      onClose={close}
    >
      {loading ? (
        <div className={styles.completeCard}><strong>Checking connection</strong><span>Orbit is loading the current workspace state.</span></div>
      ) : flow.connected ? (
        <>
          <h4>{config.name} is connected</h4>
          <p>{config.unlock}</p>
          <div className={styles.completeCard}><strong>{runtime?.accountName ?? "Connected account"}</strong><span>{runtime?.assetCount ?? 0} approved asset{runtime?.assetCount === 1 ? "" : "s"} available to Orbit.</span></div>
          {config.manageUrl ? <a className={styles.secondary} href={config.manageUrl} target="_blank" rel="noreferrer">Manage at {config.name} <ExternalLink size={13} /></a> : null}
        </>
      ) : flow.platformReady && config.connectPath ? (
        <>
          <h4>Authorize {config.name}</h4>
          <p>Orbit will send you to {config.name} to sign in and approve access. No provider password is handled by Orbit.</p>
          <a className={styles.primary} href={config.connectPath}><PlugZap size={15} /> {config.authLabel}</a>
          <div className={styles.inputHelp}><ShieldCheck size={13} /><span>After authorization, Orbit validates the callback and stores only the provider credential required for the approved scope.</span></div>
        </>
      ) : (
        <>
          <h4>{config.name} connection is being prepared</h4>
          <p>The onboarding interface is ready, but the provider-side OAuth/application registration has not been enabled in production yet.</p>
          <div className={styles.completeCard}><strong>No fake connection</strong><span>Orbit keeps this capability locked until the real provider integration is configured and verifiable.</span></div>
        </>
      )}
    </ConnectionFlowModal>
  );
}
