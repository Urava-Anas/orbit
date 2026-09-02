import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/workspace";
import { getWorkspaceProfile } from "@/lib/workspace-profile";
import { CarrierLookup } from "./CarrierLookup";

export const metadata: Metadata = {
  title: "Carrier Intelligence",
  robots: { index: false, follow: false },
};

export default async function CarrierIntelligencePage() {
  const { role, workspace } = await requireWorkspace();
  if (getWorkspaceProfile(workspace).experience !== "apex") redirect("/dashboard");

  return <CarrierLookup canResearch={role === "owner" || role === "admin"} />;
}
