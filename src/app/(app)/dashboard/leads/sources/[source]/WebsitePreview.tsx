"use client";

import { useState } from "react";
import { ExternalLink, Monitor, RefreshCw, Smartphone, Tablet } from "lucide-react";
import styles from "./WebsitePreview.module.css";

type WebsitePreviewProps = {
  name: string;
  url: string | null;
};

type DeviceMode = "desktop" | "tablet" | "mobile";

export function WebsitePreview({ name, url }: WebsitePreviewProps) {
  const [previewKey, setPreviewKey] = useState(0);
  const [device, setDevice] = useState<DeviceMode>("desktop");

  if (!url) {
    return (
      <div className={`${styles.websitePreview} ${styles.websitePreviewEmpty}`}>
        <GlobePlaceholder />
        <strong>No website URL yet</strong>
        <span>Add a live URL to show the website preview here.</span>
      </div>
    );
  }

  let hostname = url;
  try {
    hostname = new URL(url).hostname;
  } catch {
    // Saved URLs are validated server-side. Keep the original value as a safe label fallback.
  }

  return (
    <div className={styles.websitePreview}>
      <div className={styles.websiteBrowserBar}>
        <span className={styles.browserDots} aria-hidden="true"><i /><i /><i /></span>
        <span className={styles.browserAddress}>{hostname}</span>
        <div className={styles.deviceSwitcher} aria-label="Preview size">
          <button className={device === "desktop" ? styles.deviceActive : ""} type="button" onClick={() => setDevice("desktop")} title="Desktop preview" aria-label="Desktop preview"><Monitor size={13} /></button>
          <button className={device === "tablet" ? styles.deviceActive : ""} type="button" onClick={() => setDevice("tablet")} title="Tablet preview" aria-label="Tablet preview"><Tablet size={13} /></button>
          <button className={device === "mobile" ? styles.deviceActive : ""} type="button" onClick={() => setDevice("mobile")} title="Mobile preview" aria-label="Mobile preview"><Smartphone size={13} /></button>
        </div>
        <div className={styles.browserActions}>
          <button type="button" onClick={() => setPreviewKey((value) => value + 1)} title="Refresh preview" aria-label={`Refresh ${name} preview`}><RefreshCw size={13} /></button>
          <a href={url} target="_blank" rel="noreferrer" title="Open website" aria-label={`Open ${name}`}><ExternalLink size={13} /></a>
        </div>
      </div>
      <div className={`${styles.websiteFrameWrap} ${styles[`preview_${device}`]}`}>
        <div className={styles.previewViewport}>
          <iframe key={`${previewKey}-${device}`} src={url} title={`${name} website preview`} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
        </div>
        <div className={styles.websiteFrameFallback}>Interactive preview · switch device size above or open the live site in a new tab.</div>
      </div>
    </div>
  );
}

function GlobePlaceholder() {
  return (
    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.4 2.5 3.6 5.5 3.6 9S14.4 18.5 12 21c-2.4-2.5-3.6-5.5-3.6-9S9.6 5.5 12 3Z" />
    </svg>
  );
}
