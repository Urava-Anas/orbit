"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireWorkspace } from "@/lib/workspace";

const currencies = ["PKR", "USD", "GBP", "EUR", "AED", "SAR"] as const;
const leadSources = [
  "direct",
  "referral",
  "website",
  "whatsapp",
  "facebook",
  "instagram",
  "linkedin",
  "google",
  "local_search",
  "other",
] as const;
const leadStages = [
  "raw",
  "scored",
  "contacted",
  "interested",
  "demo_booked",
  "won",
  "lost",
] as const;

const idSchema = z.string().uuid();
const optionalScore = z.preprocess(
  (input) => (input === "" || input === null ? null : Number(input)),
  z.number().int().min(0).max(100).nullable(),
);
const leadSchema = z.object({
  businessName: z.string().min(2).max(160),
  ownerName: z.string().max(120),
  email: z.string().email().max(254).or(z.literal("")),
  phone: z.string().max(40),
  whatsapp: z.string().max(40),
  source: z.enum(leadSources),
  stage: z.enum(leadStages),
  niche: z.string().max(100),
  leadScore: optionalScore,
  estimatedValue: z.coerce.number().min(0).max(999999999999),
  currency: z.enum(currencies),
  painPoint: z.string().max(4000),
  nextAction: z.string().max(240),
  nextActionAt: z.string().max(40),
  googleMapsUrl: z.string().url().max(500).or(z.literal("")),
  notes: z.string().max(4000),
});

type LeadInput = z.infer<typeof leadSchema>;

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function optional(valueToCheck: string) {
  return valueToCheck || null;
}

function fail(message: string): never {
  redirect(`/dashboard/leads?error=${encodeURIComponent(message)}`);
}

function succeed(message: string): never {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/leads");
  redirect(`/dashboard/leads?notice=${encodeURIComponent(message)}`);
}

function parseLead(formData: FormData) {
  return leadSchema.safeParse({
    businessName: value(formData, "businessName"),
    ownerName: value(formData, "ownerName"),
    email: value(formData, "email"),
    phone: value(formData, "phone"),
    whatsapp: value(formData, "whatsapp"),
    source: value(formData, "source"),
    stage: value(formData, "stage"),
    niche: value(formData, "niche"),
    leadScore: value(formData, "leadScore"),
    estimatedValue: value(formData, "estimatedValue") || "0",
    currency: value(formData, "currency"),
    painPoint: value(formData, "painPoint"),
    nextAction: value(formData, "nextAction"),
    nextActionAt: value(formData, "nextActionAt"),
    googleMapsUrl: value(formData, "googleMapsUrl"),
    notes: value(formData, "notes"),
  });
}

function parseNextActionDate(valueToParse: string) {
  if (!valueToParse) return null;
  const hasTimeZone = /(?:z|[+-]\d{2}:?\d{2})$/i.test(valueToParse);
  const pakistanTime = hasTimeZone ? valueToParse : `${valueToParse}:00+05:00`;
  const parsed = new Date(pakistanTime);
  if (Number.isNaN(parsed.getTime())) fail("The follow-up date is invalid.");
  return parsed.toISOString();
}

function leadPayload(data: LeadInput) {
  return {
    name: data.ownerName || data.businessName,
    company: data.businessName,
    email: optional(data.email),
    phone: optional(data.phone),
    whatsapp: optional(data.whatsapp),
    source: data.source,
    stage: data.stage,
    niche: optional(data.niche),
    lead_score: data.leadScore,
    estimated_value: data.estimatedValue,
    currency: data.currency,
    pain_point: optional(data.painPoint),
    next_action: optional(data.nextAction),
    next_action_at: parseNextActionDate(data.nextActionAt),
    google_maps_url: optional(data.googleMapsUrl),
    notes: optional(data.notes),
  };
}

export async function createLead(formData: FormData) {
  const parsed = parseLead(formData);
  if (!parsed.success) fail("Check the lead details and try again.");

  const { supabase, user, workspace } = await requireWorkspace();
  const { error } = await supabase.from("leads").insert({
    workspace_id: workspace.id,
    ...leadPayload(parsed.data),
    owner_id: user.id,
    created_by: user.id,
  });

  if (error) fail("Orbit could not save this lead.");
  succeed("Lead added to the pipeline.");
}

export async function updateLead(formData: FormData) {
  const id = idSchema.safeParse(value(formData, "id"));
  const parsed = parseLead(formData);
  if (!id.success || !parsed.success) fail("Check the lead details and try again.");

  const { supabase, workspace } = await requireWorkspace();
  const { error } = await supabase
    .from("leads")
    .update(leadPayload(parsed.data))
    .eq("id", id.data)
    .eq("workspace_id", workspace.id);

  if (error) fail("Orbit could not update this lead.");
  succeed("Lead details updated.");
}

export async function updateLeadStage(formData: FormData) {
  const parsed = z
    .object({ id: idSchema, stage: z.enum(leadStages) })
    .safeParse({
      id: value(formData, "id"),
      stage: value(formData, "stage"),
    });

  if (!parsed.success) fail("Invalid lead update.");
  const { supabase, workspace } = await requireWorkspace();
  const { error } = await supabase
    .from("leads")
    .update({ stage: parsed.data.stage })
    .eq("id", parsed.data.id)
    .eq("workspace_id", workspace.id);

  if (error) fail("Lead stage was not updated.");
  succeed("Lead stage updated.");
}
