import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  syncStudentToAirtable,
  writeNotionUrlToAirtable,
} from "@/lib/foundry-integrations/airtable";
import { syncStudentToNotion } from "@/lib/foundry-integrations/notion";
import {
  sendFoundryEmail,
  sendFoundryWhatsApp,
} from "@/lib/foundry-integrations/notifications";
import type {
  DeliveryResult,
  ExternalRecord,
  FoundryDeliveryPreference,
  FoundryExternalDelivery,
  FoundryOutboxEvent,
  FoundryOutboundNotification,
  FoundrySyncStudent,
} from "@/lib/foundry-integrations/types";
import { createAdminClient } from "@/lib/supabase/admin";

const studentFields =
  "id, workspace_id, auth_user_id, foundry_id, external_source, external_record_id, full_name, email, phone, department, level, lifecycle_status, progress_percent, device_access, main_goal, founder_notes, next_action, batch_label, studio_eligible, updated_at";

const studentAggregateTables = new Set([
  "foundry_notifications",
  "foundry_task_assignments",
  "foundry_submissions",
  "foundry_attendance",
  "foundry_skill_scores",
  "foundry_delivery_preferences",
  "foundry_studio_readiness_reviews",
  "foundry_certificates",
  "foundry_daily_checks",
]);

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 1800) : "Unknown error";
}

async function studentIdForEvent(
  admin: SupabaseClient,
  event: FoundryOutboxEvent,
) {
  if (event.aggregate_type === "foundry_students") {
    return event.aggregate_id;
  }
  if (!studentAggregateTables.has(event.aggregate_type)) return null;

  const { data, error } = await admin
    .from(event.aggregate_type)
    .select("student_id")
    .eq("workspace_id", event.workspace_id)
    .eq("id", event.aggregate_id)
    .maybeSingle();
  if (error) throw new Error(`Resolve student: ${error.message}`);
  return (data as { student_id?: string } | null)?.student_id ?? null;
}

async function fanOutEvent(
  admin: SupabaseClient,
  event: FoundryOutboxEvent,
) {
  const studentId = await studentIdForEvent(admin, event);
  if (!studentId) return 0;

  const channels: FoundryExternalDelivery["channel"][] = [
    "airtable",
    "notion",
  ];

  if (event.aggregate_type === "foundry_notifications") {
    const { data, error } = await admin
      .from("foundry_delivery_preferences")
      .select(
        "email_enabled, whatsapp_enabled, email_consented_at, whatsapp_consented_at",
      )
      .eq("workspace_id", event.workspace_id)
      .eq("student_id", studentId)
      .maybeSingle();
    if (error) throw new Error(`Delivery preferences: ${error.message}`);
    if (data?.email_enabled && data.email_consented_at) {
      channels.push("email");
    }
    if (data?.whatsapp_enabled && data.whatsapp_consented_at) {
      channels.push("whatsapp");
    }
  }

  const { error } = await admin.from("foundry_external_deliveries").upsert(
    channels.map((channel) => ({
      event_id: event.id,
      workspace_id: event.workspace_id,
      student_id: studentId,
      channel,
    })),
    {
      onConflict: "event_id,channel,student_id",
      ignoreDuplicates: true,
    },
  );
  if (error) throw new Error(`Create deliveries: ${error.message}`);
  return channels.length;
}

async function completeOutbox(
  admin: SupabaseClient,
  eventId: number,
  success: boolean,
  error?: string,
) {
  const result = await admin.rpc("complete_foundry_outbox_event", {
    target_event_id: eventId,
    was_successful: success,
    error_message: error ?? null,
  });
  if (result.error) {
    throw new Error(`Complete outbox: ${result.error.message}`);
  }
}

async function getDeliveryContext(
  admin: SupabaseClient,
  delivery: FoundryExternalDelivery,
) {
  const [studentResult, preferenceResult, recordsResult] = await Promise.all([
    admin
      .from("foundry_students")
      .select(studentFields)
      .eq("workspace_id", delivery.workspace_id)
      .eq("id", delivery.student_id)
      .maybeSingle(),
    admin
      .from("foundry_delivery_preferences")
      .select(
        "email_enabled, whatsapp_enabled, whatsapp_number, email_consented_at, whatsapp_consented_at",
      )
      .eq("workspace_id", delivery.workspace_id)
      .eq("student_id", delivery.student_id)
      .maybeSingle(),
    admin
      .from("foundry_external_records")
      .select("provider, remote_record_id, remote_url")
      .eq("workspace_id", delivery.workspace_id)
      .eq("student_id", delivery.student_id),
  ]);

  if (studentResult.error || !studentResult.data) {
    throw new Error(
      `Student context: ${studentResult.error?.message ?? "not found"}`,
    );
  }
  if (preferenceResult.error) {
    throw new Error(`Preference context: ${preferenceResult.error.message}`);
  }
  if (recordsResult.error) {
    throw new Error(`External records: ${recordsResult.error.message}`);
  }

  return {
    student: studentResult.data as unknown as FoundrySyncStudent,
    preference:
      (preferenceResult.data as FoundryDeliveryPreference | null) ?? null,
    records: (recordsResult.data ?? []) as ExternalRecord[],
  };
}

async function saveExternalRecord(
  admin: SupabaseClient,
  delivery: FoundryExternalDelivery,
  provider: "airtable" | "notion",
  remoteRecordId: string,
  remoteUrl: string | null,
  payloadHash: string,
) {
  const { error } = await admin.from("foundry_external_records").upsert(
    {
      workspace_id: delivery.workspace_id,
      student_id: delivery.student_id,
      provider,
      remote_record_id: remoteRecordId,
      remote_url: remoteUrl,
      last_payload_hash: payloadHash,
      last_synced_at: new Date().toISOString(),
      last_error: null,
    },
    { onConflict: "workspace_id,student_id,provider" },
  );
  if (error) throw new Error(`Save ${provider} mapping: ${error.message}`);
}

async function notificationForDelivery(
  admin: SupabaseClient,
  delivery: FoundryExternalDelivery,
) {
  const eventResult = await admin
    .from("foundry_outbox_events")
    .select("aggregate_type, aggregate_id")
    .eq("id", delivery.event_id)
    .maybeSingle();
  if (eventResult.error || !eventResult.data) {
    throw new Error(
      `Notification event: ${eventResult.error?.message ?? "not found"}`,
    );
  }
  if (eventResult.data.aggregate_type !== "foundry_notifications") {
    throw new Error("External message is not backed by a notification");
  }
  const notificationResult = await admin
    .from("foundry_notifications")
    .select("id, title, body, kind")
    .eq("workspace_id", delivery.workspace_id)
    .eq("id", eventResult.data.aggregate_id)
    .eq("student_id", delivery.student_id)
    .maybeSingle();
  if (notificationResult.error || !notificationResult.data) {
    throw new Error(
      `Notification: ${notificationResult.error?.message ?? "not found"}`,
    );
  }
  return notificationResult.data as FoundryOutboundNotification;
}

async function processDelivery(
  admin: SupabaseClient,
  delivery: FoundryExternalDelivery,
): Promise<DeliveryResult> {
  const { student, preference, records } = await getDeliveryContext(
    admin,
    delivery,
  );
  const airtableRecord =
    records.find((record) => record.provider === "airtable") ?? null;
  const notionRecord =
    records.find((record) => record.provider === "notion") ?? null;

  if (delivery.channel === "airtable") {
    const result = await syncStudentToAirtable(
      student,
      preference,
      airtableRecord?.remote_record_id ?? null,
    );
    await saveExternalRecord(
      admin,
      delivery,
      "airtable",
      result.recordId,
      result.recordUrl,
      result.payloadHash,
    );
    return {
      providerMessageId: result.recordId,
      remoteRecordId: result.recordId,
      remoteUrl: result.recordUrl,
      payloadHash: result.payloadHash,
    };
  }

  if (delivery.channel === "notion") {
    if (!airtableRecord) {
      throw new Error("Notion is waiting for the Airtable record mapping");
    }
    const result = await syncStudentToNotion(
      student,
      preference,
      airtableRecord.remote_record_id,
      notionRecord?.remote_record_id ?? null,
    );
    await saveExternalRecord(
      admin,
      delivery,
      "notion",
      result.pageId,
      result.pageUrl,
      result.payloadHash,
    );
    await writeNotionUrlToAirtable(
      airtableRecord.remote_record_id,
      result.pageUrl,
    );
    return {
      providerMessageId: result.pageId,
      remoteRecordId: result.pageId,
      remoteUrl: result.pageUrl,
      payloadHash: result.payloadHash,
    };
  }

  const notification = await notificationForDelivery(admin, delivery);

  if (delivery.channel === "email") {
    if (!preference?.email_enabled || !preference.email_consented_at) {
      return { providerMessageId: "preference-disabled" };
    }
    const messageId = await sendFoundryEmail(
      student,
      notification,
      `foundry-${delivery.id}`,
    );
    return { providerMessageId: messageId };
  }

  if (
    !preference?.whatsapp_enabled ||
    !preference.whatsapp_consented_at
  ) {
    return { providerMessageId: "preference-disabled" };
  }
  if (!preference.whatsapp_number) {
    throw new Error("Consented WhatsApp number is missing");
  }
  const messageId = await sendFoundryWhatsApp(
    preference.whatsapp_number,
    notification,
  );
  return { providerMessageId: messageId };
}

async function completeDelivery(
  admin: SupabaseClient,
  deliveryId: number,
  success: boolean,
  providerMessageId?: string,
  error?: string,
) {
  const result = await admin.rpc("complete_foundry_external_delivery", {
    target_delivery_id: deliveryId,
    was_successful: success,
    target_provider_message_id: providerMessageId ?? null,
    error_message: error ?? null,
  });
  if (result.error) {
    throw new Error(`Complete delivery: ${result.error.message}`);
  }
}

export type FoundryWorkerResult = {
  configured: boolean;
  outboxClaimed: number;
  outboxCompleted: number;
  deliveriesCreated: number;
  deliveriesClaimed: number;
  deliveriesSucceeded: number;
  deliveriesFailed: number;
  errors: string[];
};

export async function runFoundryWorker({
  outboxBatch = 25,
  deliveryBatch = 50,
}: {
  outboxBatch?: number;
  deliveryBatch?: number;
} = {}): Promise<FoundryWorkerResult> {
  const summary: FoundryWorkerResult = {
    configured: false,
    outboxClaimed: 0,
    outboxCompleted: 0,
    deliveriesCreated: 0,
    deliveriesClaimed: 0,
    deliveriesSucceeded: 0,
    deliveriesFailed: 0,
    errors: [],
  };
  const admin = createAdminClient();
  if (!admin) return summary;
  summary.configured = true;

  const outboxResult = await admin.rpc("claim_foundry_outbox_events", {
    requested_batch_size: Math.min(Math.max(outboxBatch, 1), 100),
  });
  if (outboxResult.error) {
    throw new Error(`Claim outbox: ${outboxResult.error.message}`);
  }
  const events = (outboxResult.data ?? []) as FoundryOutboxEvent[];
  summary.outboxClaimed = events.length;

  for (const event of events) {
    try {
      summary.deliveriesCreated += await fanOutEvent(admin, event);
      await completeOutbox(admin, event.id, true);
      summary.outboxCompleted += 1;
    } catch (error) {
      const message = errorMessage(error);
      summary.errors.push(`Outbox ${event.id}: ${message}`);
      try {
        await completeOutbox(admin, event.id, false, message);
      } catch (completionError) {
        summary.errors.push(
          `Outbox ${event.id} completion: ${errorMessage(completionError)}`,
        );
      }
    }
  }

  const deliveryResult = await admin.rpc(
    "claim_foundry_external_deliveries",
    {
      requested_batch_size: Math.min(Math.max(deliveryBatch, 1), 100),
    },
  );
  if (deliveryResult.error) {
    throw new Error(`Claim deliveries: ${deliveryResult.error.message}`);
  }
  const deliveries = (
    (deliveryResult.data ?? []) as FoundryExternalDelivery[]
  ).sort((a, b) => {
    const order = { airtable: 1, notion: 2, email: 3, whatsapp: 4 };
    return order[a.channel] - order[b.channel] || a.id - b.id;
  });
  summary.deliveriesClaimed = deliveries.length;

  for (const delivery of deliveries) {
    try {
      const result = await processDelivery(admin, delivery);
      await completeDelivery(
        admin,
        delivery.id,
        true,
        result.providerMessageId,
      );
      summary.deliveriesSucceeded += 1;
    } catch (error) {
      const message = errorMessage(error);
      summary.errors.push(`Delivery ${delivery.id}: ${message}`);
      summary.deliveriesFailed += 1;
      try {
        await completeDelivery(
          admin,
          delivery.id,
          false,
          undefined,
          message,
        );
      } catch (completionError) {
        summary.errors.push(
          `Delivery ${delivery.id} completion: ${errorMessage(completionError)}`,
        );
      }
    }
  }

  return summary;
}