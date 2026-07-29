export type FoundryOutboxEvent = {
  id: number;
  workspace_id: string;
  topic: string;
  aggregate_type: string;
  aggregate_id: string;
  operation: "insert" | "update";
  attempt_count: number;
};

export type FoundryExternalDelivery = {
  id: number;
  event_id: number;
  workspace_id: string;
  student_id: string;
  channel: "airtable" | "notion" | "email" | "whatsapp";
  attempt_count: number;
};

export type FoundrySyncStudent = {
  id: string;
  workspace_id: string;
  auth_user_id: string | null;
  foundry_id: string;
  external_source: string;
  external_record_id: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  department: string;
  level: string;
  lifecycle_status: string;
  progress_percent: number;
  device_access: string;
  main_goal: string | null;
  founder_notes: string | null;
  next_action: string | null;
  batch_label: string | null;
  studio_eligible: boolean;
  updated_at: string;
};

export type FoundryDeliveryPreference = {
  email_enabled: boolean;
  whatsapp_enabled: boolean;
  whatsapp_number: string | null;
  email_consented_at: string | null;
  whatsapp_consented_at: string | null;
};

export type FoundryOutboundNotification = {
  id: string;
  title: string;
  body: string;
  kind: string;
};

export type ExternalRecord = {
  provider: "airtable" | "notion";
  remote_record_id: string;
  remote_url: string | null;
};

export type DeliveryResult = {
  providerMessageId?: string;
  remoteRecordId?: string;
  remoteUrl?: string;
  payloadHash?: string;
};
