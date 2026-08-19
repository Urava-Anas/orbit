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
  authType: "oauth" | "api_key";
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

type RuntimeState = {
  provider: ProviderId;
  data: RuntimeStatus | null;
};

const providers: Record<ProviderId, ProviderConfig> = {
  github: {
    name: "GitHub",
    mark: "GH",
    description: "Repository access for delivery, website management and governed automation.",
    authLabel: "Continue with GitHub",
    authType: "oauth",
    connectPath: "/api/integrations/github/start",
    manageUrl: "https://github.com/settings/installations",
    unlock: "Approved repositories become available to Orbit delivery and automation tools.",
  },
  vercel: {
    name: "Vercel",
    mark: "V",
    description: "Deployment and project access for production delivery and website operations.",
    authLabel: "Continue with Vercel",
    authType: "oauth",
    connectPath: "/api/integrations/vercel/start",
    manageUrl: "https://vercel.com/dashboard/integrations",
    unlock: "Approved projects become available to Orbit deployment and production workflows.",
  },
  google_search_console: {
    name: "Search Console",
    mark: "SC",
    description: "Verified search properties for indexing health, visibility and SEO operations.",
    authLabel: "Continue with Google",
    authType: "oauth",
    connectPath: "/api/integrations/oauth/google_search_console/start",
    manageUrl: "https://search.google.com/search-console",
    unlock: "Verified Search Console properties become available to Orbit Growth and SEO workflows.",
  },
  google_analytics: {
    name: "Google Analytics",
    mark: "GA",
    description: "Traffic, acquisition and conversion analytics for Growth and Evidence.",
    authLabel: "Continue with Google",
    authType: "oauth",
    connectPath: "/api/integrations/oauth/google_analytics/start",
    manageUrl: "https://analytics.google.com",
    unlock: "Approved Analytics properties become available to Orbit Growth and Evidence.",
  },
  meta: {
    name: "Meta",
    mark: "M",
    description: "Facebook Pages and Instagram business assets for Growth and Publishing.",
    authLabel: "Continue with Meta",
    authType: "oauth",
    connectPath: "/api/integrations/oauth/meta/start",
    manageUrl: "https://business.facebook.com/settings",
    unlock: "Approved Meta assets become available to publishing and growth workflows.",
  },
  linkedin: {
    name: "LinkedIn",
    mark: "in",
    description: "Verified LinkedIn identity for professional-network connections. Organisation and publishing scopes stay locked until separately approved.",
    authLabel: "Continue with LinkedIn",
    authType: "oauth",
    connectPath: "/api/integrations/oauth/linkedin/start",
    manageUrl: "https://www.linkedin.com/mypreferences/d/third-party-applications",
    unlock: "Verified identity becomes available to Orbit; organisation and publishing capabilities remain disabled until their provider scopes are explicitly reviewed.",
  },
  geoapify: {
    name: "Geoapify",
    mark: "G",
    description: "Location intelligence for local business discovery, geocoding and lead enrichment.",
    authLabel: "Connect & validate",
    authType: "api_key",
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
    google_search_console_connected: "Search Console connected successfully.",
    google_analytics_connected: "Google Analytics connected successfully.",
    meta_connected: "Meta connected successfully.",
    linkedin_connected: "LinkedIn connected successfully.",
  };
  return map[value] ?? value;
}

function errorText(value: string | null) {
  if (!value) return null;
  const map: Record<string, string> = {
    github_platform_setup: "GitHub authentication needs the Orbit GitHub App credentials configured by the product owner.",
    vercel_platform_setup: "Vercel authentication needs the Orbit Vercel Integration credentials configured by the product owner.",
    google_search_console_auth_config: "Google authentication needs an Orbit OAuth client before this workspace can authorize Search Console.",
    google_analytics_auth_config: "Google authentication needs an Orbit OAuth client before this workspace can authorize Analytics.",
    meta_auth_config: "Meta authentication needs an Orbit Meta app before this workspace can authorize assets.",
    linkedin_auth_config: "LinkedIn authentication needs an Orbit LinkedIn app before this workspace can authorize access.",
    github_rate_limited: "Too many GitHub connection attempts. Try again shortly.",
    vercel_rate_limited: "Too many Vercel connection attempts. Try again shortly.",
    oauth_rate_limited: "Too many connection attempts. Try again shortly.",
    github_oauth_incomplete: "GitHub did not return a complete authorization response.",
    github_state_mismatch: "GitHub connection validation failed. Start again.",
    github_installation_unverified: "Orbit could not verify the GitHub installation.",
    github_installation_token_failed: "Orbit could not obtain GitHub installation access.",
    github_repository_capability_unverified: "GitHub authenticated, but repository access could not be verified.",
    github_save_failed: "GitHub was authorized, but Orbit could not save the connection.",
    github_callback_failed: "GitHub connection failed before completion.",
    vercel_oauth_incomplete: "Vercel did not return a complete authorization response.",
    vercel_state_mismatch: "Vercel connection validation failed. Start again.",
    vercel_oauth_exchange: "Vercel authorization could not be completed.",
    vercel_capability_verification_failed: "Vercel authenticated, but project access could not be verified.",
    vercel_save_failed: "Vercel was authorized, but Orbit could not save the connection.",
    vercel_callback_failed: "Vercel connection failed before completion.",
    oauth_incomplete: "The provider did not return a complete authorization response.",
    oauth_state_mismatch: "Authentication validation failed. Start the connection again.",
    oauth_exchange_failed: "The provider accepted the sign-in but Orbit could not complete the token exchange.",
    oauth_capability_verification_failed: "Authentication succeeded, but the requested provider capability could not be verified.",
    oauth_save_failed: "Authentication succeeded but Orbit could not save the encrypted connection.",
    oauth_callback_failed: "Authentication could not be completed. Try again.",
  };
  return map[value] ?? value;
}

export function ConnectionFlowHubOverlay() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const providerId = searchParams.get("connect");
  const config = isProvider(providerId) ? providers[providerId] : null;
  const [runtimeState, setRuntimeState] = useState<RuntimeState | null>(null);
  const runtime = isProvider(providerId) && runtimeState?.provider === providerId ? runtimeState.data : null;
  const loading = Boolean(config && isProvider(providerId) && runtimeState?.provider !== providerId);

  useEffect(() => {
    if (!config || !isProvider(providerId) || pathname !== "/dashboard/plugins") return;
    const activeProvider = providerId;
    const controller = new AbortController();
    fetch(`/api/integrations/connection-status?provider=${encodeURIComponent(activeProvider)}`, {
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("status_failed");
        return response.json() as Promise<RuntimeStatus>;
      })
      .then((data) => setRuntimeState({ provider: activeProvider, data }))
      .catch(() => {
        if (!controller.signal.aborted) setRuntimeState({ provider: activeProvider, data: null });
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
    const geo = providerId === "geoapify";
    const firstTitle = geo ? "API key authentication" : `Sign in with ${config.name === "Search Console" || config.name === "Google Analytics" ? "Google" : config.name}`;
    const firstDescription = geo ? "Enter and validate the workspace Geoapify API key." : `Authenticate directly with ${config.name} and approve Orbit access.`;
    const authState = connected ? "done" : "current";
    const steps: ConnectionFlowStep[] = [
      { title: firstTitle, description: firstDescription, state: authState },
      { title: "Validate access", description: "Orbit verifies provider access before enabling anything.", state: connected ? "done" : "pending" },
      { title: "Review permissions", description: "Keep access inside the explicit permission boundary.", state: connected ? "done" : "pending" },
      { title: "Choose assets", description: geo ? "Geoapify capabilities are pre-scoped by the plugin manifest." : "Use only the assets you approve.", state: connected ? "done" : "pending" },
      { title: "Complete setup", description: "Unlock the provider inside the relevant Orbit modules.", state: connected ? "done" : "pending" },
    ];
    const statuses: ConnectionStatusItem[] = [
      { label: "Authentication", detail: connected ? `${runtime?.accountName ?? config.name} is authenticated.` : config.authType === "api_key" ? "API key required." : "Provider sign-in required.", badge: connected ? "Connected" : "Required", state: connected ? "done" : "current" },
      { label: "Validation", detail: connected ? "Provider access has been verified." : "Runs immediately after authentication.", badge: connected ? "Verified" : "Waiting", state: connected ? "done" : "pending" },
      { label: "Permissions", detail: connected ? "Approved provider boundary is active." : "Explicit approval is required before use.", badge: connected ? "Approved" : "Pending", state: connected ? "done" : "pending" },
      { label: "Assets", detail: connected ? `${runtime?.assetCount ?? 0} approved asset${runtime?.assetCount === 1 ? "" : "s"}.` : geo ? "Capabilities are scoped by the reviewed plugin." : "Selected during provider authorization.", badge: connected ? "Ready" : "Locked", state: connected ? "done" : "pending" },
      { label: "Security", detail: "Tokens and provider secrets stay on Orbit’s server boundary.", badge: "Protected", state: "done" },
    ];
    const successPath: ConnectionSuccessItem[] = [
      { label: "Authenticated", detail: "Provider linked", state: connected ? "done" : "pending" },
      { label: "Validated", detail: "Access verified", state: connected ? "done" : "pending" },
      { label: "Permissions approved", detail: "Boundary confirmed", state: connected ? "done" : "pending" },
      { label: "Assets selected", detail: "Resources scoped", state: connected ? "done" : "pending" },
      { label: "Ready in Orbit", detail: "Integration active", state: connected ? "done" : "pending" },
    ];
    return { connected, steps, statuses, successPath };
  }, [config, providerId, runtime]);

  if (!config || !flow || pathname !== "/dashboard/plugins") return null;

  const notice = noticeText(searchParams.get("notice"));
  const error = errorText(searchParams.get("error"));

  return (
    <ConnectionFlowModal
      open
      title={`Connect ${config.name}`}
      subtitle={config.authType === "api_key" ? "Authenticate with the provider API key, validate it, and unlock the connection." : `Authenticate with ${config.name}, approve access, and finish the connection.`}
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
      ) : providerId === "geoapify" ? (
        <>
          <h4>API key authentication</h4>
          <p>Paste your Geoapify API key. Orbit validates it on the server and encrypts it before storage.</p>
          {runtime?.installed === false ? <div className={styles.completeCard}><strong>Plugin installation required</strong><span>Install Geoapify Lead Discovery from the overview first, then return here to authenticate the API key.</span></div> : null}
          <form action={connectGeoapify}>
            <label className={styles.field} htmlFor="geoapify-unified-key">
              <span>Geoapify API key</span>
              <div className={styles.inputWrap}><KeyRound className={styles.keyIcon} size={16} /><input id="geoapify-unified-key" name="apiKey" type="password" minLength={20} maxLength={240} autoComplete="off" required placeholder="Paste your Geoapify API key" /></div>
            </label>
            <div className={styles.inputHelp}><LockKeyhole size={13} /><span>Validated server-side and never embedded in frontend JavaScript.</span></div>
            <button className={styles.primary} type="submit" disabled={runtime?.installed === false}><ShieldCheck size={15} /> Connect & validate</button>
          </form>
          <a className={styles.secondary} href="https://myprojects.geoapify.com" target="_blank" rel="noreferrer">Open Geoapify dashboard <ExternalLink size={13} /></a>
        </>
      ) : config.connectPath ? (
        <>
          <h4>Authenticate with {config.name === "Search Console" || config.name === "Google Analytics" ? "Google" : config.name}</h4>
          <p>You will sign in on the provider’s own authentication screen and approve the access Orbit requests. Orbit never handles your provider password.</p>
          <a className={styles.primary} href={config.connectPath}><PlugZap size={15} /> {config.authLabel}</a>
          <div className={styles.inputHelp}><ShieldCheck size={13} /><span>After authentication, Orbit validates the callback and stores only the credential required for the approved scope.</span></div>
        </>
      ) : null}
    </ConnectionFlowModal>
  );
}
