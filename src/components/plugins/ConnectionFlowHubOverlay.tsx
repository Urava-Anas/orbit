"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ExternalLink, KeyRound, LockKeyhole, PlugZap, ShieldCheck } from "lucide-react";
import { connectGeoapify, disconnectGeoapify } from "@/app/(app)/dashboard/plugins/geoapify-actions";
import { ConnectionFlowModal, type ConnectionFlowStep, type ConnectionStatusItem, type ConnectionSuccessItem } from "./ConnectionFlowModal";
import styles from "./ConnectionFlowModal.module.css";

type ProviderId = "github" | "vercel" | "google_search_console" | "google_analytics" | "meta" | "linkedin" | "geoapify";

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
  installed?: boolean;
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
  geoapify: {
    name: "Geoapify",
    mark: "G",
    description: "Location intelligence for local business discovery, geocoding and lead enrichment.",
    authLabel: "Connect & validate",
    manageUrl: "https://myprojects.geoapify.com",
    unlock: "Validated Geoapify access unlocks local business discovery inside Orbit Lead Finder.",
  },
};

function isProvider(value: string | null): value is ProviderId {
  return Boolean(value && Object.prototype.hasOwnProperty.call(providers, value));
}

function noticeText(value: string | null) {
  if (!value) return null;
  const map: Record<string, string> = {
    github_connected: "GitHub connected successfully.",
    vercel_connected: "Vercel connected successfully.",
  };
  return map[value] ?? value;
}

function errorText(value: string | null) {
  if (!value) return null;
  const map: Record<string, string> = {
    github_platform_setup: "GitHub connector setup is not enabled in production yet.",
    vercel_platform_setup: "Vercel connector setup is not enabled in production yet.",
    github_oauth_incomplete: "GitHub did not return a complete authorization response.",
    github_state_mismatch: "GitHub connection validation failed. Start again.",
    github_installation_unverified: "Orbit could not verify the GitHub installation.",
    github_installation_token_failed: "Orbit could not obtain GitHub installation access.",
    github_save_failed: "GitHub was authorized, but Orbit could not save the connection.",
    github_callback_failed: "GitHub connection failed before completion.",
    vercel_oauth_incomplete: "Vercel did not return a complete authorization response.",
    vercel_state_mismatch: "Vercel connection validation failed. Start again.",
    vercel_oauth_exchange: "Vercel authorization could not be completed.",
    vercel_save_failed: "Vercel was authorized, but Orbit could not save the connection.",
    vercel_callback_failed: "Vercel connection failed before completion.",
  };
  return map[value] ?? value;
}

export function ConnectionFlowHubOverlay() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const providerId = searchParams.get("connect");
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
    params.delete("connect");
    params.delete("notice");
    params.delete("error");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const flow = useMemo(() => {
    if (!config) return null;
    const connected = runtime?.connected === true;
    const platformReady = runtime?.platformReady === true;
    const geo = providerId === "geoapify";
    const firstTitle = geo ? "Connect API key" : "Connect account";
    const firstDescription = geo ? "Validate the workspace Geoapify credential." : `Authorize Orbit with ${config.name}.`;
    const authState = connected ? "done" : platformReady ? "current" : "pending";
    const steps: ConnectionFlowStep[] = [
      { title: firstTitle, description: firstDescription, state: authState },
      { title: "Validate access", description: "Orbit verifies provider access before enabling anything.", state: connected ? "done" : "pending" },
      { title: "Review permissions", description: "Keep access inside the explicit permission boundary.", state: connected ? "done" : "pending" },
      { title: "Choose assets", description: geo ? "Geoapify capabilities are pre-scoped by the plugin manifest." : "Use only the assets you approve.", state: connected ? "done" : "pending" },
      { title: "Complete setup", description: "Unlock the provider inside the relevant Orbit modules.", state: connected ? "done" : "pending" },
    ];
    const statuses: ConnectionStatusItem[] = [
      { label: "Connection", detail: connected ? `${runtime?.accountName ?? config.name} is connected.` : platformReady ? "Ready for secure authorization." : "Provider setup is not enabled yet.", badge: connected ? "Connected" : platformReady ? "Ready" : "Pending", state: connected ? "done" : platformReady ? "current" : "pending" },
      { label: "Validation", detail: connected ? "Provider access has been verified." : "Runs immediately after authorization.", badge: connected ? "Verified" : "Waiting", state: connected ? "done" : "pending" },
      { label: "Permissions", detail: connected ? "Approved provider boundary is active." : "Explicit approval is required before use.", badge: connected ? "Approved" : "Pending", state: connected ? "done" : "pending" },
      { label: "Assets", detail: connected ? `${runtime?.assetCount ?? 0} approved asset${runtime?.assetCount === 1 ? "" : "s"}.` : geo ? "Capabilities are scoped by the reviewed plugin." : "Selected during provider authorization.", badge: connected ? "Ready" : "Locked", state: connected ? "done" : "pending" },
      { label: "Security", detail: "Tokens and provider secrets stay on Orbit's server boundary.", badge: "Protected", state: "done" },
    ];
    const successPath: ConnectionSuccessItem[] = [
      { label: "Connected", detail: "Provider linked", state: connected ? "done" : "pending" },
      { label: "Validated", detail: "Access verified", state: connected ? "done" : "pending" },
      { label: "Permissions approved", detail: "Boundary confirmed", state: connected ? "done" : "pending" },
      { label: "Assets selected", detail: "Resources scoped", state: connected ? "done" : "pending" },
      { label: "Ready in Orbit", detail: "Integration active", state: connected ? "done" : "pending" },
    ];
    return { connected, platformReady, steps, statuses, successPath };
  }, [config, providerId, runtime]);

  if (!config || !flow || pathname !== "/dashboard/plugins") return null;

  const notice = noticeText(searchParams.get("notice"));
  const error = errorText(searchParams.get("error"));

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
      notice={notice}
      error={error}
      onClose={close}
    >
      {loading ? (
        <div className={styles.completeCard}><strong>Checking connection</strong><span>Orbit is loading the current workspace state.</span></div>
      ) : flow.connected ? (
        <>
          <h4>{config.name} is connected</h4>
          <p>{config.unlock}</p>
          <div className={styles.completeCard}><strong>{runtime?.accountName ?? "Connected account"}</strong><span>{runtime?.assetCount ?? 0} approved asset{runtime?.assetCount === 1 ? "" : "s"} available to Orbit.</span></div>
          {providerId === "geoapify" ? <form action={disconnectGeoapify}><button className={styles.secondary} type="submit">Disconnect Geoapify</button></form> : config.manageUrl ? <a className={styles.secondary} href={config.manageUrl} target="_blank" rel="noreferrer">Manage at {config.name} <ExternalLink size={13} /></a> : null}
        </>
      ) : providerId === "geoapify" && runtime?.installed && flow.platformReady ? (
        <>
          <h4>Connect your Geoapify API key</h4>
          <p>Orbit validates the key first, then encrypts it before persistence.</p>
          <form action={connectGeoapify}>
            <label className={styles.field} htmlFor="geoapify-unified-key">
              <span>Geoapify API key</span>
              <div className={styles.inputWrap}><KeyRound className={styles.keyIcon} size={16} /><input id="geoapify-unified-key" name="apiKey" type="password" minLength={20} maxLength={240} autoComplete="off" required placeholder="Paste your Geoapify API key" /></div>
            </label>
            <div className={styles.inputHelp}><LockKeyhole size={13} /><span>Validated server-side and never embedded in frontend JavaScript.</span></div>
            <button className={styles.primary} type="submit"><ShieldCheck size={15} /> Connect & validate</button>
          </form>
          <a className={styles.secondary} href="https://myprojects.geoapify.com" target="_blank" rel="noreferrer">Open Geoapify dashboard <ExternalLink size={13} /></a>
        </>
      ) : flow.platformReady && config.connectPath ? (
        <>
          <h4>Authorize {config.name}</h4>
          <p>Orbit sends you to {config.name} to sign in and approve access. Your provider password is never handled by Orbit.</p>
          <a className={styles.primary} href={config.connectPath}><PlugZap size={15} /> {config.authLabel}</a>
          <div className={styles.inputHelp}><ShieldCheck size={13} /><span>After authorization, Orbit validates the callback and stores only the provider credential required for the approved scope.</span></div>
        </>
      ) : (
        <>
          <h4>{config.name} connection is being prepared</h4>
          <p>The interface is ready, but the real provider-side integration is not enabled in production yet.</p>
          <div className={styles.completeCard}><strong>No fake connection</strong><span>Orbit keeps this capability locked until the provider integration is configured and verifiable.</span></div>
        </>
      )}
    </ConnectionFlowModal>
  );
}
