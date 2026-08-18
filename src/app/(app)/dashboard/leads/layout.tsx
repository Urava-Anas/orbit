import type { ReactNode } from "react";
import { LeadFinderAutocompleteEnhancer } from "./LeadFinderAutocompleteEnhancer";

export default function LeadsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <LeadFinderAutocompleteEnhancer />
    </>
  );
}
