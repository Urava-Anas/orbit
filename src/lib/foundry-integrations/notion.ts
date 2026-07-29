import "server-only";

import { createHash } from "node:crypto";
import { notionConfig } from "@/lib/foundry-integrations/config";
import type {
  FoundryDeliveryPreference,
  FoundrySyncStudent,
} from "@/lib/foundry-integrations/types";

type NotionPropertySchema = {
  id: string;
  name: string;
  type:
    | "title"
    | "rich_text"
    | "email"
    | "phone_number"
    | "select"
    | "status"
    | "url"
    | string;
};

type NotionDataSource = {
  properties: Record<string, NotionPropertySchema>;
};

async function notionRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const config = notionConfig();
  const response = await fetch(`https://api.notion.com/v1/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Notion-Version": config.version,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const body = (await response.json().catch(() => ({}))) as {
    message?: string;
    code?: string;
  };
  if (!response.ok) {
    throw new Error(
      `Notion ${response.status}: ${body.message ?? body.code ?? "request failed"}`,
    );
  }
  return body as T;
}

let schemaPromise: Promise<NotionDataSource> | null = null;

function getSchema() {
  const config = notionConfig();
  schemaPromise ??= notionRequest<NotionDataSource>(
    `data_sources/${config.dataSourceId}`,
  ).catch((error) => {
    schemaPromise = null;
    throw error;
  });
  return schemaPromise;
}

function textContent(value: string) {
  return [{ type: "text", text: { content: value.slice(0, 2000) } }];
}

function propertyValue(schema: NotionPropertySchema, value: string | null) {
  switch (schema.type) {
    case "title":
      return { title: value ? textContent(value) : [] };
    case "rich_text":
      return { rich_text: value ? textContent(value) : [] };
    case "email":
      return { email: value };
    case "phone_number":
      return { phone_number: value };
    case "select":
      return { select: value ? { name: value } : null };
    case "status":
      return { status: value ? { name: value } : null };
    case "url":
      return { url: value };
    default:
      return null;
  }
}

function notionDepartment(value: string) {
  return (
    {
      unassigned: "Unassigned",
      creative_ui: "Foundry",
      web_app: "Foundry",
      ai_automation: "Labs",
      sales_calling: "Sales",
      operations: "Operations",
      content_media: "Foundry",
    }[value] ?? "Unassigned"
  );
}

function notionStudentStatus(value: string) {
  if (value === "graduated") return "Done";
  if (["new", "reviewing", "shortlisted", "waitlisted"].includes(value)) {
    return "Not started";
  }
  return "In progress";
}

async function buildProperties(
  student: FoundrySyncStudent,
  preference: FoundryDeliveryPreference | null,
  airtableRecordId: string,
) {
  const source = await getSchema();
  const values: Record<string, string | null> = {
    "Student Name": student.full_name,
    Email: student.email,
    Phone: student.phone,
    WhatsApp: preference?.whatsapp_number ?? null,
    "Assigned Department": notionDepartment(student.department),
    "Student Status": notionStudentStatus(student.lifecycle_status),
    "Sync Status": "Synced",
    "Airtable Record ID": airtableRecordId,
  };
  const properties: Record<string, unknown> = {};

  for (const [name, value] of Object.entries(values)) {
    const schema = source.properties[name];
    if (!schema) continue;
    const encoded = propertyValue(schema, value);
    if (encoded) properties[name] = encoded;
  }

  if (!source.properties["Airtable Record ID"]) {
    throw new Error("Notion data source is missing Airtable Record ID");
  }
  return properties;
}

async function findNotionPage(airtableRecordId: string) {
  const config = notionConfig();
  const source = await getSchema();
  const schema = source.properties["Airtable Record ID"];
  if (!schema) throw new Error("Notion data source is missing Airtable Record ID");
  const filterType = schema.type === "title" ? "title" : "rich_text";
  const result = await notionRequest<{
    results: Array<{ id: string; url: string }>;
  }>(`data_sources/${config.dataSourceId}/query`, {
    method: "POST",
    body: JSON.stringify({
      page_size: 2,
      filter: {
        property: "Airtable Record ID",
        [filterType]: { equals: airtableRecordId },
      },
    }),
  });
  if (result.results.length > 1) {
    throw new Error(`Notion has duplicate Airtable ID ${airtableRecordId}`);
  }
  return result.results[0] ?? null;
}

export async function syncStudentToNotion(
  student: FoundrySyncStudent,
  preference: FoundryDeliveryPreference | null,
  airtableRecordId: string,
  mappedPageId: string | null,
) {
  const config = notionConfig();
  const properties = await buildProperties(
    student,
    preference,
    airtableRecordId,
  );
  const payloadHash = createHash("sha256")
    .update(JSON.stringify(properties))
    .digest("hex");
  const existing =
    mappedPageId ? { id: mappedPageId, url: null } : await findNotionPage(airtableRecordId);

  if (existing) {
    const page = await notionRequest<{ id: string; url: string }>(
      `pages/${existing.id}`,
      {
        method: "PATCH",
        body: JSON.stringify({ properties }),
      },
    );
    return { pageId: page.id, pageUrl: page.url, payloadHash };
  }

  const page = await notionRequest<{ id: string; url: string }>("pages", {
    method: "POST",
    body: JSON.stringify({
      parent: { type: "data_source_id", data_source_id: config.dataSourceId },
      properties,
    }),
  });
  return { pageId: page.id, pageUrl: page.url, payloadHash };
}
