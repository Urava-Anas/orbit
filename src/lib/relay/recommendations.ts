import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type RelayRecommendation = {
  id: string;
  priority: "high" | "medium" | "low";
  title: string;
  reason: string;
  actionLabel: string;
  href: string;
};

export async function getRelayRecommendations(input: {
  supabase: SupabaseClient;
  workspaceId: string;
  mailboxId?: string | null;
  mailboxConnected: boolean;
  lastSyncedAt?: string | null;
}) {
  const recommendations: RelayRecommendation[] = [];

  if (!input.mailboxId) {
    return [{
      id: "connect-mailbox",
      priority: "high" as const,
      title: "Connect the first business mailbox",
      reason: "Relay cannot reduce communication workload until a real mailbox is authenticated.",
      actionLabel: "Connect mailbox",
      href: "/dashboard/mail?view=connectors&connect=1",
    }];
  }

  if (!input.mailboxConnected) {
    recommendations.push({
      id: "finish-connection",
      priority: "high",
      title: "Finish mailbox authentication",
      reason: "The mailbox exists in Orbit but IMAP/SMTP authentication is not healthy yet.",
      actionLabel: "Fix connection",
      href: `/dashboard/mail?view=connectors&mailbox=${input.mailboxId}&connect=1`,
    });
  }

  const staleSync = !input.lastSyncedAt || Date.now() - new Date(input.lastSyncedAt).getTime() > 30 * 60 * 1000;
  if (input.mailboxConnected && staleSync) {
    recommendations.push({
      id: "sync-mailbox",
      priority: "high",
      title: "Refresh the mailbox",
      reason: "Relay's advice should use current conversations, not stale inbox data.",
      actionLabel: "Sync now",
      href: `/dashboard/mail?view=mail&mailbox=${input.mailboxId}`,
    });
  }

  const [{ count: unread }, { count: unlinked }, { count: newForms }, { data: dueLeads }] = await Promise.all([
    input.supabase.from("orbit_mail_threads").select("id", { count: "exact", head: true })
      .eq("workspace_id", input.workspaceId).eq("mailbox_id", input.mailboxId).eq("folder", "inbox").eq("is_unread", true),
    input.supabase.from("orbit_mail_threads").select("id", { count: "exact", head: true })
      .eq("workspace_id", input.workspaceId).eq("mailbox_id", input.mailboxId).is("business_context_type", null),
    input.supabase.from("apex_online_form_submissions").select("id", { count: "exact", head: true })
      .eq("workspace_id", input.workspaceId).eq("status", "new"),
    input.supabase.from("leads").select("id,name,next_action,next_action_at")
      .eq("workspace_id", input.workspaceId)
      .not("next_action_at", "is", null)
      .lte("next_action_at", new Date().toISOString())
      .order("next_action_at", { ascending: true })
      .limit(5),
  ]);

  if ((unread ?? 0) > 0) {
    recommendations.push({
      id: "review-unread",
      priority: (unread ?? 0) >= 10 ? "high" : "medium",
      title: `Review ${unread} unread conversation${unread === 1 ? "" : "s"}`,
      reason: "Unread business mail is the fastest place for missed leads, support risk and delayed decisions to hide.",
      actionLabel: "Open inbox",
      href: `/dashboard/mail?view=mail&folder=inbox&mailbox=${input.mailboxId}`,
    });
  }

  if ((unlinked ?? 0) > 0) {
    recommendations.push({
      id: "link-context",
      priority: "medium",
      title: `Link ${unlinked} conversation${unlinked === 1 ? "" : "s"} to business records`,
      reason: "Relay becomes more useful when conversations are attached to leads, forms, customers and operations.",
      actionLabel: "Review context",
      href: `/dashboard/mail?view=mail&mailbox=${input.mailboxId}`,
    });
  }

  if ((newForms ?? 0) > 0) {
    recommendations.push({
      id: "qualify-forms",
      priority: "high",
      title: `Qualify ${newForms} new online form${newForms === 1 ? "" : "s"}`,
      reason: "Fresh inbound requests should be contacted before response probability decays.",
      actionLabel: "Open forms",
      href: "/dashboard/leads/forms",
    });
  }

  if ((dueLeads ?? []).length > 0) {
    recommendations.push({
      id: "due-followups",
      priority: "high",
      title: `${dueLeads!.length} lead follow-up${dueLeads!.length === 1 ? " is" : "s are"} due`,
      reason: "Orbit found scheduled lead actions that are due now or overdue.",
      actionLabel: "Open pipeline",
      href: "/dashboard/leads",
    });
  }

  if (!recommendations.length) {
    recommendations.push({
      id: "healthy",
      priority: "low",
      title: "Communication queue looks controlled",
      reason: "Relay sees no immediate inbox, form or lead-follow-up pressure. Focus on active sales and operations.",
      actionLabel: "Open dashboard",
      href: "/dashboard",
    });
  }

  const priorityWeight = { high: 0, medium: 1, low: 2 } as const;
  return recommendations.sort((a, b) => priorityWeight[a.priority] - priorityWeight[b.priority]).slice(0, 5);
}
