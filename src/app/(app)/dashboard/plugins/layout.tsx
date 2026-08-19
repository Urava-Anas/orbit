import type { ReactNode } from "react";
import { ConnectionFlowHubOverlay } from "@/components/plugins/ConnectionFlowHubOverlay";

export default function PluginsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <ConnectionFlowHubOverlay />
    </>
  );
}
