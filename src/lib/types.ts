export type Workspace = {
  id: string;
  name: string;
  slug: string;
};

export type Lead = {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  source: string;
  stage: string;
  estimated_value: number;
  currency: string;
  next_action: string | null;
  next_action_at: string | null;
  created_at: string;
};

export type Client = {
  id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
};

export type Project = {
  id: string;
  client_id: string;
  name: string;
  summary: string | null;
  status: string;
  value: number;
  currency: string;
  due_date: string | null;
  created_at: string;
  clients: { name: string } | null;
};

export type Invoice = {
  id: string;
  reference: string;
  amount: number;
  currency: string;
  status: string;
  due_at: string | null;
  paid_at: string | null;
  projects: { name: string } | null;
};

export type Proof = {
  id: string;
  project_id: string;
  title: string;
  result: string;
  evidence_url: string | null;
  permission_scope: string;
  status: string;
  created_at: string;
  projects: { name: string } | null;
};

export type ContentDraft = {
  id: string;
  proof_id: string;
  channel: string;
  title: string;
  body: string;
  status: string;
  created_at: string;
  proofs: { title: string } | null;
};

export type AuditEvent = {
  id: number;
  action: string;
  entity_type: string;
  created_at: string;
};

