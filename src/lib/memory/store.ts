import "server-only";

import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

type CompanyEventInput = {
  workspaceId: string;
  actorId?: string | null;
  domain: string;
  eventType: string;
  entityType?: string | null;
  entityId?: string | null;
  correlationId?: string | null;
  idempotencyKey?: string | null;
  payload?: Record<string, unknown>;
  occurredAt?: string;
};

type CompanyMemoryInput = {
  workspaceId: string;
  sourceEventId?: number | null;
  domain: string;
  memoryType: string;
  subjectType?: string | null;
  subjectId?: string | null;
  title: string;
  summary: string;
  structuredData?: Record<string, unknown>;
  sensitivity?: "public" | "internal" | "confidential" | "restricted";
  occurredAt?: string | null;
  createdBy?: string | null;
};

function adminOrThrow() {
  const admin = createAdminClient();
  if (!admin) {
    throw new Error(
      "Server-side Supabase credentials are required for governed memory writes.",
    );
  }
  return admin;
}

export function companyMemoryHash(input: {
  workspaceId: string;
  domain: string;
  memoryType: string;
  subjectType?: string | null;
  subjectId?: string | null;
  title: string;
  summary: string;
  structuredData?: Record<string, unknown>;
}) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        workspaceId: input.workspaceId,
        domain: input.domain,
        memoryType: input.memoryType,
        subjectType: input.subjectType ?? null,
        subjectId: input.subjectId ?? null,
        title: input.title,
        summary: input.summary,
        structuredData: input.structuredData ?? {},
      }),
    )
    .digest("hex");
}

export async function recordCompanyEvent(input: CompanyEventInput) {
  const admin = adminOrThrow();
  const { data, error } = await admin
    .from("company_events")
    .insert({
      workspace_id: input.workspaceId,
      actor_id: input.actorId ?? null,
      domain: input.domain,
      event_type: input.eventType,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      correlation_id: input.correlationId ?? null,
      idempotency_key: input.idempotencyKey ?? null,
      payload: input.payload ?? {},
      occurred_at: input.occurredAt ?? new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505" && input.idempotencyKey) {
      const { data: existing, error: existingError } = await admin
        .from("company_events")
        .select("id")
        .eq("workspace_id", input.workspaceId)
        .eq("idempotency_key", input.idempotencyKey)
        .single();
      if (!existingError && existing) return Number(existing.id);
    }
    throw new Error(`Company event write failed: ${error.message}`);
  }

  return Number(data.id);
}

export async function rememberCompanyFact(input: CompanyMemoryInput) {
  const admin = adminOrThrow();
  const contentHash = companyMemoryHash({
    workspaceId: input.workspaceId,
    domain: input.domain,
    memoryType: input.memoryType,
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    title: input.title,
    summary: input.summary,
    structuredData: input.structuredData,
  });

  const { data, error } = await admin
    .from("company_memory_entries")
    .upsert(
      {
        workspace_id: input.workspaceId,
        source_event_id: input.sourceEventId ?? null,
        domain: input.domain,
        memory_type: input.memoryType,
        subject_type: input.subjectType ?? null,
        subject_id: input.subjectId ?? null,
        title: input.title,
        summary: input.summary,
        structured_data: input.structuredData ?? {},
        sensitivity: input.sensitivity ?? "internal",
        status: "active",
        content_hash: contentHash,
        occurred_at: input.occurredAt ?? null,
        created_by: input.createdBy ?? null,
      },
      { onConflict: "workspace_id,content_hash" },
    )
    .select("id")
    .single();

  if (error) {
    throw new Error(`Company memory write failed: ${error.message}`);
  }

  return String(data.id);
}


export async function recordCompanyEventBestEffort(input: CompanyEventInput) {
  try {
    return await recordCompanyEvent(input);
  } catch (error) {
    console.error("Company event recording failed", {
      domain: input.domain,
      eventType: input.eventType,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      error: error instanceof Error ? error.message : "Unknown company-event error",
    });
    return null;
  }
}
