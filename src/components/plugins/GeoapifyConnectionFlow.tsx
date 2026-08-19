"use client";

import { useRouter } from "next/navigation";
import { ExternalLink, KeyRound, LockKeyhole, ShieldCheck } from "lucide-react";
import { ConnectionFlowModal, type ConnectionFlowStep, type ConnectionStatusItem, type ConnectionSuccessItem } from "./ConnectionFlowModal";
import styles from "./ConnectionFlowModal.module.css";
import { connectGeoapify, disconnectGeoapify } from "@/app/(app)/dashboard/plugins/geoapify-actions";
import { installPlugin } from "@/app/(app)/dashboard/plugins/actions";

type Props = {
  open: boolean;
  installed: boolean;
  connected: boolean;
  canManage: boolean;
  accountName: string | null;
  notice?: string | null;
  error?: string | null;
};

export function GeoapifyConnectionFlow({ open, installed, connected, canManage, accountName, notice, error }: Props) {
  const router = useRouter();
  const close = () => router.replace("/dashboard/plugins/geoapify-lead-discovery", { scroll: false });

  const steps: ConnectionFlowStep[] = connected
    ? [
        { title: "Install plugin", description: "Add Geoapify capability to this workspace.", state: "done" },
        { title: "Connect API key", description: "Authorize the Geoapify account securely.", state: "done" },
        { title: "Validate access", description: "Verify the credential against Geoapify.", state: "done" },
        { title: "Approve permissions", description: "Use the reviewed Lead Engine boundary.", state: "done" },
        { title: "Complete setup", description: "Enable local lead discovery.", state: "done" },
      ]
    : installed
      ? [
          { title: "Install plugin", description: "Geoapify Lead Discovery is installed.", state: "done" },
          { title: "Connect API key", description: "Enter the API key from your Geoapify project.", state: error ? "error" : "current" },
          { title: "Validate access", description: "Orbit tests the credential server-side.", state: "pending" },
          { title: "Approve permissions", description: "Reviewed permissions are already bounded.", state: "pending" },
          { title: "Complete setup", description: "Lead Finder unlocks after validation.", state: "pending" },
        ]
      : [
          { title: "Install plugin", description: "Add Geoapify capability to this workspace.", state: "current" },
          { title: "Connect API key", description: "Enter your Geoapify API key.", state: "pending" },
          { title: "Validate access", description: "Orbit verifies access.", state: "pending" },
          { title: "Approve permissions", description: "Confirm the reviewed boundary.", state: "pending" },
          { title: "Complete setup", description: "Enable local lead discovery.", state: "pending" },
        ];

  const statuses: ConnectionStatusItem[] = [
    { label: "Installation", detail: installed ? "Plugin is installed and ready." : "Install the plugin to begin.", badge: installed ? "Ready" : "Required", state: installed ? "done" : "current" },
    { label: "Connection", detail: connected ? `${accountName ?? "Geoapify Places"} is connected.` : "Add and validate your Geoapify API key.", badge: connected ? "Connected" : "Waiting", state: connected ? "done" : installed ? (error ? "error" : "current") : "pending" },
    { label: "Permissions", detail: "Lead discovery access stays inside the reviewed plugin boundary.", badge: connected ? "Approved" : "Pending", state: connected ? "done" : "pending" },
    { label: "Security", detail: "Credential storage is server-side and encrypted.", badge: "Protected", state: "done" },
    { label: "Lead Finder", detail: connected ? "Local lead discovery is enabled." : "Unlocks after a valid connection.", badge: connected ? "Enabled" : "Locked", state: connected ? "done" : "pending" },
  ];

  const successPath: ConnectionSuccessItem[] = [
    { label: "Connected", detail: "Account linked", state: connected ? "done" : "pending" },
    { label: "Validated", detail: "Access verified", state: connected ? "done" : "pending" },
    { label: "Permissions approved", detail: "Boundary confirmed", state: connected ? "done" : "pending" },
    { label: "Ready in Orbit", detail: "Lead Finder active", state: connected ? "done" : "pending" },
  ];

  return (
    <ConnectionFlowModal
      open={open}
      title="Connect Geoapify"
      subtitle="A guided setup from installation to working local lead discovery."
      providerName="Geoapify"
      providerDescription="Location intelligence for business discovery, geocoding and contact enrichment inside Orbit Lead Engine."
      providerMark="G"
      steps={steps}
      statuses={statuses}
      successPath={successPath}
      notice={notice}
      error={error}
      onClose={close}
    >
      {!canManage ? (
        <div className={styles.completeCard}><strong>Owner or admin required</strong><span>An organisation owner or admin must complete connection setup.</span></div>
      ) : connected ? (
        <>
          <h4>Connection complete</h4>
          <p>Geoapify is validated and Lead Finder can now use the approved location APIs.</p>
          <div className={styles.completeCard}>
            <strong>{accountName ?? "Geoapify Places"} is ready</strong>
            <span>Geocoding, Places and Place Details are available to Orbit. The API key is not displayed back to the browser.</span>
          </div>
          <form action={disconnectGeoapify}><button className={styles.secondary} type="submit">Disconnect Geoapify</button></form>
        </>
      ) : !installed ? (
        <>
          <h4>Install Geoapify Lead Discovery</h4>
          <p>Installation grants the reviewed permissions before any credential is accepted.</p>
          <form action={installPlugin}>
            <input name="pluginSlug" type="hidden" value="geoapify-lead-discovery" />
            <button className={styles.primary} type="submit"><ShieldCheck size={15} /> Install plugin</button>
          </form>
        </>
      ) : (
        <>
          <h4>Connect your Geoapify API key</h4>
          <p>Paste the key from your Geoapify project. Orbit validates it before anything is stored.</p>
          <form action={connectGeoapify}>
            <label className={styles.field} htmlFor="geoapify-flow-key">
              <span>Geoapify API key</span>
              <div className={styles.inputWrap}>
                <KeyRound className={styles.keyIcon} size={16} />
                <input id="geoapify-flow-key" name="apiKey" type="password" minLength={20} maxLength={240} autoComplete="off" required placeholder="Paste your Geoapify API key" />
              </div>
            </label>
            <div className={styles.inputHelp}><LockKeyhole size={13} /><span>Validated on Orbit&apos;s server, then encrypted before persistence. It is never embedded in frontend JavaScript.</span></div>
            <button className={styles.primary} type="submit"><ShieldCheck size={15} /> Connect & validate</button>
          </form>
          <a className={styles.secondary} href="https://myprojects.geoapify.com" target="_blank" rel="noreferrer">How to find my key <ExternalLink size={13} /></a>
          <span className={styles.footerLink}>No key yet? Create one in your <a href="https://myprojects.geoapify.com" target="_blank" rel="noreferrer">Geoapify dashboard</a>.</span>
        </>
      )}
    </ConnectionFlowModal>
  );
}
