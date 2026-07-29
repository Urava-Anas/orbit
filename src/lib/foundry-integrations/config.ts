import "server-only";

const defaults = {
  airtableBaseId: "appgvElGxaKEYU7Hr",
  airtableTableId: "tblrJ8uzgxGIUOPAD",
  notionDataSourceId: "e84c62d2-57ed-4a46-b1ca-c453328a4e72",
  notionVersion: "2026-03-11",
  appUrl: "https://orbit-two-delta.vercel.app",
  whatsappVersion: "v23.0",
  whatsappTemplate: "foundry_update",
  whatsappLanguage: "en_US",
} as const;

export function getFoundryIntegrationHealth() {
  return {
    worker: Boolean(
      process.env.SUPABASE_SECRET_KEY ??
        process.env.SUPABASE_SERVICE_ROLE_KEY,
    ),
    airtable: Boolean(process.env.AIRTABLE_API_TOKEN),
    notion: Boolean(process.env.NOTION_API_KEY),
    email: Boolean(
      process.env.RESEND_API_KEY && process.env.FOUNDRY_EMAIL_FROM,
    ),
    whatsapp: Boolean(
      process.env.WHATSAPP_ACCESS_TOKEN &&
        process.env.WHATSAPP_PHONE_NUMBER_ID,
    ),
  };
}

export function airtableConfig() {
  const token = process.env.AIRTABLE_API_TOKEN;
  if (!token) throw new Error("AIRTABLE_API_TOKEN is not configured");
  return {
    token,
    baseId: process.env.AIRTABLE_BASE_ID ?? defaults.airtableBaseId,
    tableId:
      process.env.AIRTABLE_STUDENTS_TABLE_ID ?? defaults.airtableTableId,
  };
}

export function notionConfig() {
  const token = process.env.NOTION_API_KEY;
  if (!token) throw new Error("NOTION_API_KEY is not configured");
  return {
    token,
    dataSourceId:
      process.env.NOTION_DATA_SOURCE_ID ?? defaults.notionDataSourceId,
    version: process.env.NOTION_API_VERSION ?? defaults.notionVersion,
  };
}

export function emailConfig() {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.FOUNDRY_EMAIL_FROM;
  if (!apiKey || !from) {
    throw new Error("Resend email settings are not configured");
  }
  return {
    apiKey,
    from,
    appUrl: process.env.FOUNDRY_APP_URL ?? defaults.appUrl,
  };
}

export function whatsappConfig() {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!accessToken || !phoneNumberId) {
    throw new Error("WhatsApp Cloud API settings are not configured");
  }
  return {
    accessToken,
    phoneNumberId,
    version:
      process.env.WHATSAPP_GRAPH_API_VERSION ?? defaults.whatsappVersion,
    template:
      process.env.WHATSAPP_TEMPLATE_NAME ?? defaults.whatsappTemplate,
    language:
      process.env.WHATSAPP_TEMPLATE_LANGUAGE ?? defaults.whatsappLanguage,
    appUrl: process.env.FOUNDRY_APP_URL ?? defaults.appUrl,
  };
}
