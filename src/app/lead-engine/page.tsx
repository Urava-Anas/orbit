import type { Metadata } from "next";
import { LeadEnginePreview } from "./LeadEnginePreview";

export const metadata: Metadata = {
  title: "Lead Engine Preview",
  description:
    "A public product preview of Orbit's lead-source and business-pipeline workspace.",
  robots: { index: false, follow: false },
};

export default function LeadEnginePreviewPage() {
  return <LeadEnginePreview />;
}
