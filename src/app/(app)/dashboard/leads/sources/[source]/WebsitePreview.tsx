"use client";

import { useState } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
import assetStyles from "./source-assets.module.css";

type WebsitePreviewProps = {
  name: string;
  url: string | null;
};

export function WebsitePreview({ name, url }: WebsitePreviewProps) {
  const [previewKey, setPreviewKey] = useState(0);

  if (!url) {
    return (
      <div className={`${assetStyles.websitePreview} ${assetStyles.websitePreviewEmpty}`}>
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
    // The server validates saved URLs. Keep the original text as a safe fallback label.
  }

  return (
    <div className={assetStyles.websitePreview}>
      <div className={assetStyles.websiteBrowserBar}>
        <span className={assetStyles.browserDots} aria-hidden="true"><i /><i /><i /></span>
        <span className={assetStyles.browserAddress}>{hostname}</span>
        <div className={assetStyles.browserActions}>
          <button type="button" onClick={() => setPreviewKey((value) => value + 1)} title="Refresh preview" aria-label={`Refresh ${name} preview`}><RefreshCw size={13} /></button>
          <a href={url} target="_blank" rel="noreferrer" title="Open website" aria-label={`Open ${name}`}><ExternalLink size={13} /></a>
        </div>
      </div>
      <div className={assetStyles.websiteFrameWrap}>
        <iframe key={previewKey} src={url} title={`${name} website preview`} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
        <div className={assetStyles.websiteFrameFallback}>If this website blocks embedded previews, use “Visit website” to open it.</div>
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
