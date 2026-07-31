import "server-only";

import { createHash } from "node:crypto";
import { airtableConfig } from "@/lib/foundry-integrations/config";
import type {
  FoundryDeliveryPreference,
  FoundrySyncStudent,
} from "@/lib/foundry-integrations/types";

const fields = {
  name: "fld5mXk2agssl9wjs",
  email: "fldJFeJldW5nOZCbp",
  phone: "fldSRJ7Qn6Dch0Whn",
  whatsapp: "fldAWyXBAL9CGMcnG",
  department: "fldqzTySDFPT0AAuK",
  skillLevel: "fld7Uo4qlTJncEwht",
  device: "fldgxFzaCXqGa9kdY",
  status: "fldO4WKFF7NC87Xr2",
  founderNotes: "fldnGahW58H5NvioE",
  notionUrl: "fldlnzvbqQVgt2hCp",
  lastSynced: "fldvDheiGzmvT2qhA",
  authUserId: "fldhA0JPm9GibLnJ6",
  accountStage: "fldDl5RwuAyhj5vOL",
  foundryId: "fldBwQF5P3fbQo7lH",
  batch: "fld8nTSO1101QRU3Q",
  nextAction: "fldQnBgLa22LQTAUP",
} as const;

function departmentLabel(value: string) {
  return (
    {
      unassigned: "Unassigned",
      creative_ui: "Creative & UI Design",
      web_app: "Web & App Building",
      ai_automation: "AI & Automation",
      sales_calling: "Sales & Calling",
      operations: "Operations",
      content_media: "Content & Media",
    }[value] ?? "Unassigned"
  );
}

function skillLevel(value: string) {
  if (["operator", "specialist", "mentor_alumni"].includes(value)) {
    return "Advanced";
  }
  if (["explorer", "apprentice"].includes(value)) {
    return "Some experience";
  }
  return "Beginner";
}

function deviceLabel(value: string) {
  return (
    {
      own_laptop: "Own laptop",
      shared_laptop: "Shared laptop",
      mobile_only: "Mobile only",
      no_reliable_device: "No reliable device",
      unknown: "No reliable device",
    }[value] ?? "No reliable device"
  );
}

function statusLabel(value: string) {
  return (
    {
      new: "New",
      reviewing: "Reviewing",
      shortlisted: "Shortlisted",
      accepted: "Accepted",
      waitlisted: "Waitlisted",
      enrolled: "Accepted",
      inactive: "Waitlisted",
      graduated: "Accepted",
      rejected: "Rejected",
    }[value] ?? "Reviewing"
  );
}

function airtableRecordUrl(baseId: string, tableId: string, recordId: string) {
  return `https://airtable.com/${baseId}/${tableId}/${recordId}`;
}

async function airtableRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const config = airtableConfig();
  const response = await fetch(`https://api.airtable.com/v0/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  const body = (await response.json().catch(() => ({}))) as {
    error?: { message?: string; type?: string };
  };
  if (!response.ok) {
    throw new Error(
      `Airtable ${response.status}: ${
        body.error?.message ?? body.error?.type ?? "request failed"
      }`,
    );
  }
  return body as T;
}

function escapeFormula(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("'", "\\'");
}

async function findAirtableRecord(foundryId: string) {
  const config = airtableConfig();
  const formula = encodeURIComponent(
    `{UFS ID}='${escapeFormula(foundryId)}'`,
  );
  const result = await airtableRequest<{
    records: Array<{ id: string }>;
  }>(
    `${config.baseId}/${config.tableId}?maxRecords=2&filterByFormula=${formula}`,
  );
  if (result.records.length > 1) {
    throw new Error(`Airtable has duplicate UFS ID ${foundryId}`);
  }
  return result.records[0]?.id ?? null;
}

export async function syncStudentToAirtable(
  student: FoundrySyncStudent,
  preference: FoundryDeliveryPreference | null,
  mappedRecordId: string | null,
) {
  const config = airtableConfig();
  const syncedAt = new Date().toISOString();
  const payload = {
    [fields.name]: student.full_name,
    [fields.email]: student.email,
    [fields.phone]: student.phone,
    [fields.whatsapp]: preference?.whatsapp_number ?? null,
    [fields.department]: departmentLabel(student.department),
    [fields.skillLevel]: skillLevel(student.level),
    [fields.device]: deviceLabel(student.device_access),
    [fields.status]: statusLabel(student.lifecycle_status),
    [fields.founderNotes]: student.founder_notes,
    [fields.lastSynced]: syncedAt,
    [fields.authUserId]: student.auth_user_id,
    [fields.accountStage]: student.auth_user_id
      ? "Account Created"
      : "Application Submitted",
    [fields.foundryId]: student.foundry_id,
    [fields.batch]: student.batch_label ?? null,
    [fields.nextAction]: student.next_action,
  };
  const payloadHash = createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
  const recordId =
    mappedRecordId ??
    (student.external_source === "airtable"
      ? student.external_record_id
      : null) ??
    (await findAirtableRecord(student.foundry_id));

  if (recordId) {
    const record = await airtableRequest<{ id: string }>(
      `${config.baseId}/${config.tableId}/${recordId}?returnFieldsByFieldId=true`,
      {
        method: "PATCH",
        body: JSON.stringify({ fields: payload, typecast: true }),
      },
    );
    return {
      recordId: record.id,
      recordUrl: airtableRecordUrl(config.baseId, config.tableId, record.id),
      payloadHash,
    };
  }

  const result = await airtableRequest<{
    records: Array<{ id: string }>;
  }>(`${config.baseId}/${config.tableId}?returnFieldsByFieldId=true`, {
    method: "POST",
    body: JSON.stringify({
      records: [{ fields: payload }],
      typecast: true,
    }),
  });
  const createdId = result.records[0]?.id;
  if (!createdId) throw new Error("Airtable did not return a record ID");
  return {
    recordId: createdId,
    recordUrl: airtableRecordUrl(config.baseId, config.tableId, createdId),
    payloadHash,
  };
}

export async function writeNotionUrlToAirtable(
  airtableRecordId: string,
  notionUrl: string,
) {
  const config = airtableConfig();
  await airtableRequest<{ id: string }>(
    `${config.baseId}/${config.tableId}/${airtableRecordId}?returnFieldsByFieldId=true`,
    {
      method: "PATCH",
      body: JSON.stringify({
        fields: {
          [fields.notionUrl]: notionUrl,
          [fields.lastSynced]: new Date().toISOString(),
        },
      }),
    },
  );
}