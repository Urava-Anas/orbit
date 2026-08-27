"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { recordCompanyEventBestEffort } from "@/lib/memory/store";
import { requireWorkspace } from "@/lib/workspace";

const activityKinds = ["whatsapp", "call", "email", "meeting", "audit", "proposal", "note"] as const;
const directions = ["outbound", "inbound", "internal"] as const;
const outcomes = ["logged", "sent", "no_answer", "replied", "booked", "proposal_sent", "won", "lost"] as const;
const leadStages = ["new", "raw", "scored", "qualified", "contacted", "interested", "demo_booked", "proposal", "won", "lost"] as const;

const activitySchema = z.object({
  leadId: z.string().uuid(),
  kind: z.enum(activityKinds),
  direction: z.enum(directions),
  outcome: z.enum(outcomes),
  summary: z.string().trim().min(2).max(4000),
  currentStage: z.string().max(40),
  nextStage: z.enum(leadStages),
  nextAction: z.string().trim().max(240),
  nextActionAt: z.string().max(40),
});

const clientSchema = z.object({
  name: z.string().trim().min(2).max(160),
  contactName: z.string().trim().max(120),
  email: z.string().trim().email().max(254).or(z.literal("")),
  phone: z.string().trim().max(40),
  website: z.string().trim().url().max(500).or(z.literal("")),
  notes: z.string().trim().max(4000),
});

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function salesRedirect(kind: "error" | "notice", message: string, leadId?: string): never {
  const params = new URLSearchParams({ [kind]: message });
  if (leadId) params.set("lead", leadId);
  redirect(`/dashboard/sales?${params.toString()}`);
}

function parsePakistanDate(valueToParse: string) {
  if (!valueToParse) return null;
  const hasTimeZone = /(?:z|[+-]\d{2}:?\d{2})$/i.test(valueToParse);
  const pakistanTime = hasTimeZone ? valueToParse : `${valueToParse}:00+05:00`;
  const parsed = new Date(pakistanTime);
  if (Number.isNaN(parsed.getTime())) salesRedirect("error", "The next-action date is invalid.");
  return parsed.toISOString();
}

function inferredStage(currentStage: string, selectedStage: (typeof leadStages)[number], outcome: (typeof outcomes)[number]) {
  if (selectedStage !== currentStage) return selectedStage;
  if (outcome === "won") return "won";
  if (outcome === "lost") return "lost";
  if (outcome === "proposal_sent") return "proposal";
  if (outcome === "booked") return "demo_booked";
  if (outcome === "replied" && ["new", "raw", "scored", "qualified", "contacted"].includes(currentStage)) return "interested";
  if (["sent", "no_answer"].includes(outcome) && ["new", "raw", "scored", "qualified"].includes(currentStage)) return "contacted";
  return selectedStage;
}

export async function createSalesClient(formData: FormData) {
  const parsed = clientSchema.safeParse({
    name: value(formData, "name"),
    contactName: value(formData, "contactName"),
    email: value(formData, "email"),
    phone: value(formData, "phone"),
    website: value(formData, "website"),
    notes: value(formData, "notes"),
  });
  if (!parsed.success) salesRedirect("error", "Check the client details and try again.");

  const { supabase, user, workspace } = await requireWorkspace();
  const { data: client, error } = await supabase
    .from("clients")
    .insert({
      workspace_id: workspace.id,
      name: parsed.data.name,
      contact_name: parsed.data.contactName || null,
      email: parsed.data.email || null,
      phone: parsed.data.phone || null,
      website: parsed.data.website || null,
      notes: parsed.data.notes || null,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !client) {
    salesRedirect("error", error?.code === "23505" ? "That client already exists." : "Orbit could not save this client.");
  }

  await recordCompanyEventBestEffort({
    workspaceId: workspace.id,
    actorId: user.id,
    domain: "sales",
    eventType: "client.created",
    entityType: "client",
    entityId: client.id,
    payload: { source: "sales_desk" },
  });

  revalidatePath("/dashboard/sales");
  revalidatePath("/dashboard/projects");
  salesRedirect("notice", "Client added to Sales Desk.");
}

export async function logSalesActivity(formData: FormData) {
  const parsed = activitySchema.safeParse({
    leadId: value(formData, "leadId"),
    kind: value(formData, "kind"),
    direction: value(formData, "direction"),
    outcome: value(formData, "outcome"),
    summary: value(formData, "summary"),
    currentStage: value(formData, "currentStage"),
    nextStage: value(formData, "nextStage"),
    nextAction: value(formData, "nextAction"),
    nextActionAt: value(formData, "nextActionAt"),
  });
  if (!parsed.success) salesRedirect("error", "Check the activity record and try again.");

  const { supabase, user, workspace } = await requireWorkspace();
  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("id,stage")
    .eq("id", parsed.data.leadId)
    .eq("workspace_id", workspace.id)
    .single();
  if (leadError || !lead) salesRedirect("error", "The selected opportunity was not found.");

  const nextActionAt = parsePakistanDate(parsed.data.nextActionAt);
  const nextStage = inferredStage(lead.stage, parsed.data.nextStage, parsed.data.outcome);
  const { data: activity, error: activityError } = await supabase
    .from("lead_activities")
    .insert({
      workspace_id: workspace.id,
      lead_id: lead.id,
      kind: parsed.data.kind,
      direction: parsed.data.direction,
      outcome: parsed.data.outcome,
      summary: parsed.data.summary,
      next_action: parsed.data.nextAction || null,
      next_action_at: nextActionAt,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (activityError || !activity) salesRedirect("error", "Orbit could not save this sales activity.", lead.id);

  const { error: updateError } = await supabase
    .from("leads")
    .update({ stage: nextStage, next_action: parsed.data.nextAction || null, next_action_at: nextActionAt })
    .eq("id", lead.id)
    .eq("workspace_id", workspace.id);
  if (updateError) salesRedirect("error", "The activity was logged, but Orbit could not update the next action.", lead.id);

  await recordCompanyEventBestEffort({
    workspaceId: workspace.id,
    actorId: user.id,
    domain: "growth",
    eventType:
      nextStage === "won"
        ? "lead.won"
        : nextStage === "lost"
          ? "lead.lost"
          : parsed.data.outcome === "proposal_sent"
            ? "lead.proposal_sent"
            : parsed.data.outcome === "replied"
              ? "lead.replied"
              : parsed.data.kind === "email" || parsed.data.kind === "whatsapp" || parsed.data.kind === "call"
                ? "lead.outreach_logged"
                : "lead.activity_logged",
    entityType: "lead",
    entityId: lead.id,
    payload: {
      activity_id: activity.id,
      kind: parsed.data.kind,
      direction: parsed.data.direction,
      outcome: parsed.data.outcome,
      from_stage: lead.stage,
      to_stage: nextStage,
      next_action_at: nextActionAt,
      has_next_action: Boolean(parsed.data.nextAction),
    },
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/leads");
  revalidatePath("/dashboard/sales");
  salesRedirect("notice", "Sales activity logged and the opportunity is controlled.", lead.id);
}
