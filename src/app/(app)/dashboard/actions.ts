"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { recordCompanyEventBestEffort } from "@/lib/memory/store";
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
  "other",
] as const;
const leadStages = ["new", "qualified", "proposal", "won", "lost"] as const;
const projectStatuses = [
  "planned",
  "in_progress",
  "review",
  "blocked",
  "completed",
] as const;
const invoiceStatuses = ["draft", "sent", "paid", "overdue", "void"] as const;
const proofStatuses = ["draft", "approved", "published"] as const;
const contentStatuses = [
  "draft",
  "review",
  "approved",
  "published",
  "archived",
] as const;
const channels = ["website", "linkedin", "facebook", "instagram", "whatsapp"] as const;

const idSchema = z.string().uuid();
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .or(z.literal(""));

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function optional(valueToCheck: string) {
  return valueToCheck || null;
}

function fail(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

function succeed(path: string, message: string): never {
  revalidatePath(path);
  redirect(`${path}?notice=${encodeURIComponent(message)}`);
}

export async function createLead(formData: FormData) {
  const parsed = z
    .object({
      name: z.string().min(2).max(120),
      company: z.string().max(160),
      email: z.string().email().max(254).or(z.literal("")),
      phone: z.string().max(40),
      source: z.enum(leadSources),
      stage: z.enum(leadStages),
      estimatedValue: z.coerce.number().min(0).max(999999999999),
      currency: z.enum(currencies),
      nextAction: z.string().max(240),
      nextActionAt: z.string().max(40),
      notes: z.string().max(4000),
    })
    .safeParse({
      name: value(formData, "name"),
      company: value(formData, "company"),
      email: value(formData, "email"),
      phone: value(formData, "phone"),
      source: value(formData, "source"),
      stage: value(formData, "stage"),
      estimatedValue: value(formData, "estimatedValue") || "0",
      currency: value(formData, "currency"),
      nextAction: value(formData, "nextAction"),
      nextActionAt: value(formData, "nextActionAt"),
      notes: value(formData, "notes"),
    });

  if (!parsed.success) {
    fail("/dashboard/leads", "Check the lead details and try again.");
  }

  const { supabase, user, workspace } = await requireWorkspace();
  const nextActionDate = parsed.data.nextActionAt
    ? new Date(parsed.data.nextActionAt)
    : null;

  if (nextActionDate && Number.isNaN(nextActionDate.getTime())) {
    fail("/dashboard/leads", "The next-action date is invalid.");
  }

  const { data: lead, error } = await supabase
    .from("leads")
    .insert({
      workspace_id: workspace.id,
      name: parsed.data.name,
      company: optional(parsed.data.company),
      email: optional(parsed.data.email),
      phone: optional(parsed.data.phone),
      source: parsed.data.source,
      stage: parsed.data.stage,
      estimated_value: parsed.data.estimatedValue,
      currency: parsed.data.currency,
      next_action: optional(parsed.data.nextAction),
      next_action_at: nextActionDate?.toISOString() ?? null,
      notes: optional(parsed.data.notes),
      owner_id: user.id,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !lead) fail("/dashboard/leads", "Orbit could not save this lead.");
  await recordCompanyEventBestEffort({
    workspaceId: workspace.id,
    actorId: user.id,
    domain: "growth",
    eventType: "lead.created",
    entityType: "lead",
    entityId: lead.id,
    payload: {
      source: parsed.data.source,
      stage: parsed.data.stage,
      estimated_value: parsed.data.estimatedValue,
      currency: parsed.data.currency,
    },
  });
  succeed("/dashboard/leads", "Lead added to the pipeline.");
}

export async function updateLeadStage(formData: FormData) {
  const parsed = z
    .object({ id: idSchema, stage: z.enum(leadStages) })
    .safeParse({
      id: value(formData, "id"),
      stage: value(formData, "stage"),
    });

  if (!parsed.success) fail("/dashboard/leads", "Invalid lead update.");
  const { supabase, user, workspace } = await requireWorkspace();
  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("stage")
    .eq("id", parsed.data.id)
    .eq("workspace_id", workspace.id)
    .single();

  if (leadError || !lead) fail("/dashboard/leads", "Lead was not found.");

  const { error } = await supabase
    .from("leads")
    .update({ stage: parsed.data.stage })
    .eq("id", parsed.data.id)
    .eq("workspace_id", workspace.id);

  if (error) fail("/dashboard/leads", "Lead stage was not updated.");
  await recordCompanyEventBestEffort({
    workspaceId: workspace.id,
    actorId: user.id,
    domain: "growth",
    eventType: parsed.data.stage === "won" ? "lead.won" : "lead.stage_changed",
    entityType: "lead",
    entityId: parsed.data.id,
    payload: { from_stage: lead.stage, to_stage: parsed.data.stage },
  });
  succeed("/dashboard/leads", "Lead stage updated.");
}

export async function createClient(formData: FormData) {
  const parsed = z
    .object({
      name: z.string().min(2).max(160),
      contactName: z.string().max(120),
      email: z.string().email().max(254).or(z.literal("")),
      phone: z.string().max(40),
      website: z.string().url().max(500).or(z.literal("")),
      notes: z.string().max(4000),
    })
    .safeParse({
      name: value(formData, "name"),
      contactName: value(formData, "contactName"),
      email: value(formData, "email"),
      phone: value(formData, "phone"),
      website: value(formData, "website"),
      notes: value(formData, "notes"),
    });

  if (!parsed.success) {
    fail("/dashboard/projects", "Check the client details and try again.");
  }

  const { supabase, user, workspace } = await requireWorkspace();
  const { data: client, error } = await supabase
    .from("clients")
    .insert({
      workspace_id: workspace.id,
      name: parsed.data.name,
      contact_name: optional(parsed.data.contactName),
      email: optional(parsed.data.email),
      phone: optional(parsed.data.phone),
      website: optional(parsed.data.website),
      notes: optional(parsed.data.notes),
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !client) {
    fail(
      "/dashboard/projects",
      error.code === "23505"
        ? "That client already exists."
        : "Orbit could not save this client.",
    );
  }

  await recordCompanyEventBestEffort({
    workspaceId: workspace.id,
    actorId: user.id,
    domain: "sales",
    eventType: "client.created",
    entityType: "client",
    entityId: client.id,
    payload: {},
  });
  succeed("/dashboard/projects", "Client added. You can now create their project.");
}

export async function createProject(formData: FormData) {
  const parsed = z
    .object({
      clientId: idSchema,
      leadId: idSchema.or(z.literal("")),
      name: z.string().min(2).max(180),
      summary: z.string().max(4000),
      status: z.enum(projectStatuses),
      value: z.coerce.number().min(0).max(999999999999),
      currency: z.enum(currencies),
      startDate: dateSchema,
      dueDate: dateSchema,
    })
    .safeParse({
      clientId: value(formData, "clientId"),
      leadId: value(formData, "leadId"),
      name: value(formData, "name"),
      summary: value(formData, "summary"),
      status: value(formData, "status"),
      value: value(formData, "value") || "0",
      currency: value(formData, "currency"),
      startDate: value(formData, "startDate"),
      dueDate: value(formData, "dueDate"),
    });

  if (!parsed.success) {
    fail("/dashboard/projects", "Check the project details and try again.");
  }

  if (
    parsed.data.startDate &&
    parsed.data.dueDate &&
    parsed.data.dueDate < parsed.data.startDate
  ) {
    fail("/dashboard/projects", "The due date cannot be before the start date.");
  }

  const { supabase, user, workspace } = await requireWorkspace();
  const { data: project, error } = await supabase
    .from("projects")
    .insert({
      workspace_id: workspace.id,
      client_id: parsed.data.clientId,
      lead_id: optional(parsed.data.leadId),
      name: parsed.data.name,
      summary: optional(parsed.data.summary),
      status: parsed.data.status,
      value: parsed.data.value,
      currency: parsed.data.currency,
      start_date: optional(parsed.data.startDate),
      due_date: optional(parsed.data.dueDate),
      owner_id: user.id,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !project) fail("/dashboard/projects", "Orbit could not save this project.");
  await recordCompanyEventBestEffort({
    workspaceId: workspace.id,
    actorId: user.id,
    domain: "delivery",
    eventType: "project.created",
    entityType: "project",
    entityId: project.id,
    payload: {
      client_id: parsed.data.clientId,
      lead_id: optional(parsed.data.leadId),
      status: parsed.data.status,
      value: parsed.data.value,
      currency: parsed.data.currency,
    },
  });
  succeed("/dashboard/projects", "Project created.");
}

export async function updateProjectStatus(formData: FormData) {
  const parsed = z
    .object({ id: idSchema, status: z.enum(projectStatuses) })
    .safeParse({
      id: value(formData, "id"),
      status: value(formData, "status"),
    });

  if (!parsed.success) fail("/dashboard/projects", "Invalid project update.");
  const { supabase, user, workspace } = await requireWorkspace();
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("status")
    .eq("id", parsed.data.id)
    .eq("workspace_id", workspace.id)
    .single();

  if (projectError || !project) fail("/dashboard/projects", "Project was not found.");

  const { error } = await supabase
    .from("projects")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.id)
    .eq("workspace_id", workspace.id);

  if (error) fail("/dashboard/projects", "Project status was not updated.");
  await recordCompanyEventBestEffort({
    workspaceId: workspace.id,
    actorId: user.id,
    domain: "delivery",
    eventType: parsed.data.status === "completed" ? "project.completed" : "project.status_changed",
    entityType: "project",
    entityId: parsed.data.id,
    payload: { from_status: project.status, to_status: parsed.data.status },
  });
  succeed("/dashboard/projects", "Project status updated.");
}

export async function createInvoice(formData: FormData) {
  const parsed = z
    .object({
      projectId: idSchema.or(z.literal("")),
      reference: z.string().min(2).max(80),
      amount: z.coerce.number().min(0).max(999999999999),
      currency: z.enum(currencies),
      status: z.enum(invoiceStatuses),
      issuedAt: dateSchema,
      dueAt: dateSchema,
      notes: z.string().max(2000),
    })
    .safeParse({
      projectId: value(formData, "projectId"),
      reference: value(formData, "reference"),
      amount: value(formData, "amount") || "0",
      currency: value(formData, "currency"),
      status: value(formData, "status"),
      issuedAt: value(formData, "issuedAt"),
      dueAt: value(formData, "dueAt"),
      notes: value(formData, "notes"),
    });

  if (!parsed.success) fail("/dashboard/cash", "Check the invoice details.");

  const { supabase, user, workspace } = await requireWorkspace();
  const { data: invoice, error } = await supabase
    .from("invoices")
    .insert({
      workspace_id: workspace.id,
      project_id: optional(parsed.data.projectId),
      reference: parsed.data.reference,
      amount: parsed.data.amount,
      currency: parsed.data.currency,
      status: parsed.data.status,
      issued_at: optional(parsed.data.issuedAt),
      due_at: optional(parsed.data.dueAt),
      paid_at: parsed.data.status === "paid" ? new Date().toISOString() : null,
      notes: optional(parsed.data.notes),
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !invoice) {
    fail(
      "/dashboard/cash",
      error.code === "23505"
        ? "That invoice reference already exists."
        : "Orbit could not save this invoice.",
    );
  }

  await recordCompanyEventBestEffort({
    workspaceId: workspace.id,
    actorId: user.id,
    domain: "finance",
    eventType: parsed.data.status === "paid" ? "invoice.paid" : "invoice.created",
    entityType: "invoice",
    entityId: invoice.id,
    payload: {
      project_id: optional(parsed.data.projectId),
      amount: parsed.data.amount,
      currency: parsed.data.currency,
      status: parsed.data.status,
    },
  });
  succeed("/dashboard/cash", "Invoice recorded.");
}

export async function updateInvoiceStatus(formData: FormData) {
  const parsed = z
    .object({ id: idSchema, status: z.enum(invoiceStatuses) })
    .safeParse({
      id: value(formData, "id"),
      status: value(formData, "status"),
    });

  if (!parsed.success) fail("/dashboard/cash", "Invalid invoice update.");
  const { supabase, user, workspace } = await requireWorkspace();
  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .select("status,amount,currency,project_id")
    .eq("id", parsed.data.id)
    .eq("workspace_id", workspace.id)
    .single();

  if (invoiceError || !invoice) fail("/dashboard/cash", "Invoice was not found.");

  const { error } = await supabase
    .from("invoices")
    .update({
      status: parsed.data.status,
      paid_at: parsed.data.status === "paid" ? new Date().toISOString() : null,
    })
    .eq("id", parsed.data.id)
    .eq("workspace_id", workspace.id);

  if (error) fail("/dashboard/cash", "Invoice status was not updated.");
  await recordCompanyEventBestEffort({
    workspaceId: workspace.id,
    actorId: user.id,
    domain: "finance",
    eventType: parsed.data.status === "paid" ? "invoice.paid" : "invoice.status_changed",
    entityType: "invoice",
    entityId: parsed.data.id,
    payload: {
      from_status: invoice.status,
      to_status: parsed.data.status,
      amount: invoice.amount,
      currency: invoice.currency,
      project_id: invoice.project_id,
    },
  });
  succeed("/dashboard/cash", "Invoice status updated.");
}

export async function createProof(formData: FormData) {
  const parsed = z
    .object({
      projectId: idSchema,
      title: z.string().min(2).max(180),
      result: z.string().min(10).max(4000),
      evidenceUrl: z.string().url().max(500).or(z.literal("")),
      permissionScope: z.enum(["private", "anonymous", "public"]),
      status: z.enum(proofStatuses),
    })
    .safeParse({
      projectId: value(formData, "projectId"),
      title: value(formData, "title"),
      result: value(formData, "result"),
      evidenceUrl: value(formData, "evidenceUrl"),
      permissionScope: value(formData, "permissionScope"),
      status: value(formData, "status"),
    });

  if (!parsed.success) fail("/dashboard/proof", "Check the proof details.");
  const { supabase, user, workspace } = await requireWorkspace();
  const { data: proof, error } = await supabase
    .from("proofs")
    .insert({
      workspace_id: workspace.id,
      project_id: parsed.data.projectId,
      title: parsed.data.title,
      result: parsed.data.result,
      evidence_url: optional(parsed.data.evidenceUrl),
      permission_scope: parsed.data.permissionScope,
      status: parsed.data.status,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !proof) fail("/dashboard/proof", "Orbit could not save this proof.");
  await recordCompanyEventBestEffort({
    workspaceId: workspace.id,
    actorId: user.id,
    domain: "proof",
    eventType: parsed.data.status === "approved" ? "proof.approved" : "proof.created",
    entityType: "proof",
    entityId: proof.id,
    payload: {
      project_id: parsed.data.projectId,
      permission_scope: parsed.data.permissionScope,
      status: parsed.data.status,
    },
  });
  succeed("/dashboard/proof", "Proof asset recorded.");
}

export async function updateProofStatus(formData: FormData) {
  const parsed = z
    .object({ id: idSchema, status: z.enum(proofStatuses) })
    .safeParse({
      id: value(formData, "id"),
      status: value(formData, "status"),
    });

  if (!parsed.success) fail("/dashboard/proof", "Invalid proof update.");
  const { supabase, user, workspace } = await requireWorkspace();
  const { data: proof, error: proofError } = await supabase
    .from("proofs")
    .select("status,project_id,permission_scope")
    .eq("id", parsed.data.id)
    .eq("workspace_id", workspace.id)
    .single();

  if (proofError || !proof) fail("/dashboard/proof", "Proof was not found.");

  const { error } = await supabase
    .from("proofs")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.id)
    .eq("workspace_id", workspace.id);

  if (error) fail("/dashboard/proof", "Proof status was not updated.");
  await recordCompanyEventBestEffort({
    workspaceId: workspace.id,
    actorId: user.id,
    domain: "proof",
    eventType: parsed.data.status === "approved" ? "proof.approved" : "proof.status_changed",
    entityType: "proof",
    entityId: parsed.data.id,
    payload: {
      from_status: proof.status,
      to_status: parsed.data.status,
      project_id: proof.project_id,
      permission_scope: proof.permission_scope,
    },
  });
  succeed("/dashboard/proof", "Proof status updated.");
}

export async function createContentDraft(formData: FormData) {
  const parsed = z
    .object({
      proofId: idSchema,
      channel: z.enum(channels),
      title: z.string().min(2).max(180),
      body: z.string().min(10).max(8000),
    })
    .safeParse({
      proofId: value(formData, "proofId"),
      channel: value(formData, "channel"),
      title: value(formData, "title"),
      body: value(formData, "body"),
    });

  if (!parsed.success) fail("/dashboard/content", "Check the content draft.");
  const { supabase, user, workspace } = await requireWorkspace();
  const { data: proof, error: proofError } = await supabase
    .from("proofs")
    .select("id")
    .eq("id", parsed.data.proofId)
    .eq("workspace_id", workspace.id)
    .eq("status", "approved")
    .single();

  if (proofError || !proof) {
    fail("/dashboard/content", "Only approved proof can become content.");
  }

  const { data: contentDraft, error } = await supabase
    .from("content_drafts")
    .insert({
      workspace_id: workspace.id,
      proof_id: proof.id,
      channel: parsed.data.channel,
      title: parsed.data.title,
      body: parsed.data.body,
      status: "draft",
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !contentDraft) fail("/dashboard/content", "Orbit could not save this draft.");
  await recordCompanyEventBestEffort({
    workspaceId: workspace.id,
    actorId: user.id,
    domain: "content",
    eventType: "content.created_from_proof",
    entityType: "content_draft",
    entityId: contentDraft.id,
    payload: {
      proof_id: proof.id,
      channel: parsed.data.channel,
    },
  });
  succeed("/dashboard/content", "Content draft created for human review.");
}

export async function updateContentStatus(formData: FormData) {
  const parsed = z
    .object({ id: idSchema, status: z.enum(contentStatuses) })
    .safeParse({
      id: value(formData, "id"),
      status: value(formData, "status"),
    });

  if (!parsed.success) fail("/dashboard/content", "Invalid content update.");
  const { supabase, user, workspace } = await requireWorkspace();
  const { data: contentDraft, error: contentError } = await supabase
    .from("content_drafts")
    .select("status,proof_id,channel")
    .eq("id", parsed.data.id)
    .eq("workspace_id", workspace.id)
    .single();

  if (contentError || !contentDraft) fail("/dashboard/content", "Content draft was not found.");

  const { error } = await supabase
    .from("content_drafts")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.id)
    .eq("workspace_id", workspace.id);

  if (error) fail("/dashboard/content", "Content status was not updated.");
  await recordCompanyEventBestEffort({
    workspaceId: workspace.id,
    actorId: user.id,
    domain: "content",
    eventType: parsed.data.status === "published" ? "content.published" : "content.status_changed",
    entityType: "content_draft",
    entityId: parsed.data.id,
    payload: {
      from_status: contentDraft.status,
      to_status: parsed.data.status,
      proof_id: contentDraft.proof_id,
      channel: contentDraft.channel,
    },
  });
  succeed("/dashboard/content", "Content status updated.");
}
