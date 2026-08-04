import type { ReactNode } from "react";
import { LeadDiscoveryPanel } from "./LeadDiscoveryPanel";

type LeadsLayoutProps = {
  children: ReactNode;
};

export default function LeadsLayout({ children }: LeadsLayoutProps) {
  return (
    <>
      {children}
      <LeadDiscoveryPanel />
    </>
  );
}
