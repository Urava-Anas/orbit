import type { ReactNode } from "react";
import { ConnectionFlowHubOverlay } from "@/components/plugins/ConnectionFlowHubOverlay";
import { PluginIndexOnly } from "./PluginIndexOnly";
import { PluginWorkspaceEntry } from "./PluginWorkspaceEntry";

export default function PluginsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <PluginIndexOnly>
        <div style={{ padding: "24px clamp(18px,3vw,38px) 0" }}>
          <PluginWorkspaceEntry />
        </div>
      </PluginIndexOnly>
      {children}
      <ConnectionFlowHubOverlay />
    </>
  );
}
