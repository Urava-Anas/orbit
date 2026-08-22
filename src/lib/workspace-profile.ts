import type { Workspace } from "@/lib/types";

export type WorkspaceExperience = "orbit" | "apex";

export type WorkspaceProfile = {
  experience: WorkspaceExperience;
  productLabel: string;
  sidebarStatus: string;
  topbarContext: string;
  dashboard: {
    kicker: string;
    title: string;
    description: string;
    actionLabel: string;
    opportunityLabel: string;
    opportunityNote: string;
    deliveryLabel: string;
    deliveryNote: string;
    cashLabel: string;
    cashCurrency: "PKR" | "USD";
    cashNote: string;
    proofLabel: string;
    proofNote: string;
    attentionTitle: string;
    attentionEmptyTitle: string;
    attentionEmptyDescription: string;
    activityTitle: string;
    activitySubtitle: string;
    mutationDescription: string;
  };
};

const orbitProfile: WorkspaceProfile = {
  experience: "orbit",
  productLabel: "Organisation workspace",
  sidebarStatus: "Organisation isolated",
  topbarContext: "Decisions → Execution → Evidence",
  dashboard: {
    kicker: "Organisation operating state",
    title: "Founder Command",
    description:
      "The decisions, risks, money, delivery, and evidence that require founder attention. Every signal resolves to a real organisation record.",
    actionLabel: "Capture opportunity",
    opportunityLabel: "Active opportunities",
    opportunityNote: "total lead records",
    deliveryLabel: "Active delivery",
    deliveryNote: "total projects",
    cashLabel: "Cash collected",
    cashCurrency: "PKR",
    cashNote: "Paid PKR invoices only",
    proofLabel: "Approved evidence",
    proofNote: "total proof assets",
    attentionTitle: "Founder attention",
    attentionEmptyTitle: "No urgent founder decisions",
    attentionEmptyDescription:
      "Orbit will surface overdue money, blocked delivery, late work, and near-term follow-ups here.",
    activityTitle: "System activity",
    activitySubtitle: "Latest audited changes",
    mutationDescription: "Organisation mutation recorded",
  },
};

const apexProfile: WorkspaceProfile = {
  experience: "apex",
  productLabel: "Apex operations workspace",
  sidebarStatus: "Apex workspace isolated",
  topbarContext: "Carriers → Dispatch → Revenue",
  dashboard: {
    kicker: "Apex operating state",
    title: "Founder Dashboard",
    description:
      "Carrier acquisition, active dispatch accounts, revenue, service risk, and follow-ups in one founder view.",
    actionLabel: "Add carrier prospect",
    opportunityLabel: "Carrier prospects",
    opportunityNote: "total carrier lead records",
    deliveryLabel: "Dispatch accounts",
    deliveryNote: "total carrier accounts",
    cashLabel: "Revenue collected",
    cashCurrency: "USD",
    cashNote: "Paid USD invoices only",
    proofLabel: "Approved proof",
    proofNote: "reviews and proof assets",
    attentionTitle: "Needs attention",
    attentionEmptyTitle: "Dispatch operation is clear",
    attentionEmptyDescription:
      "Orbit will surface overdue collections, blocked carrier accounts, late follow-ups, and service risks here.",
    activityTitle: "Operations activity",
    activitySubtitle: "Latest audited changes",
    mutationDescription: "Apex workspace change recorded",
  },
};

function normalizeWorkspaceSlug(slug: string) {
  return slug.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function getWorkspaceProfile(workspace: Workspace): WorkspaceProfile {
  const slug = normalizeWorkspaceSlug(workspace.slug);
  const name = workspace.name.toLowerCase();
  const isApex =
    slug.includes("apex") &&
    (slug.includes("logistics") || slug.includes("dispatch"));

  if (isApex || (name.includes("apex") && name.includes("dispatch"))) {
    return apexProfile;
  }

  return orbitProfile;
}
