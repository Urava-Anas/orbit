-- Orbit Stage 3: full internal sales workflow.
-- This stage creates internal artifacts and state transitions only.
-- External messaging, payment collection, delivery activation, proof publishing,
-- and referral requests remain explicitly red-gated and disabled.

insert into public.capabilities (capability_key, module_key, description, risk_level)
values
  ('growth.research', 'growth', 'Create a workspace-grounded research packet for an existing lead.', 'green'),
  ('growth.qualify', 'growth', 'Create the final internal qualification decision for a researched lead.', 'green'),
  ('growth.followup_plan', 'growth', 'Prepare an internal follow-up sequence without sending messages.', 'green'),
  ('growth.followup_send', 'growth', 'Send a follow-up message to a lead.', 'red'),
  ('growth.sales_reason', 'growth', 'Interpret an inbound buying signal or objection and recommend the next sales state.', 'green'),
  ('growth.proposal_draft', 'growth', 'Prepare an internal proposal draft inside approved inputs without sending it.', 'green'),
  ('growth.proposal_send', 'growth', 'Send or externally commit a sales proposal.', 'red'),
  ('cash.payment_prepare', 'cash', 'Prepare an internal payment and onboarding case without collecting money.', 'green'),
  ('cash.payment_collect', 'cash', 'Request, charge, collect, refund, or otherwise move customer money.', 'red'),
  ('delivery.handoff_prepare', 'delivery', 'Prepare an internal delivery handoff without starting client delivery.', 'green'),
  ('delivery.project_activate', 'delivery', 'Create or activate a client delivery commitment from a sale.', 'red'),
  ('proof.prepare', 'proof', 'Prepare a private proof/referral plan after delivery evidence exists.', 'green'),
  ('proof.publish', 'proof', 'Publish client proof or change its permission scope externally.', 'red'),
  ('growth.referral_prepare', 'growth', 'Prepare an internal referral request plan without contacting the client.', 'green'),
  ('growth.referral_send', 'growth', 'Send a referral request to a client.', 'red')
on conflict (capability_key) do update
set module_key = excluded.module_key,
    description = excluded.description,
    risk_level = excluded.risk_level;

create table if not exists public.orbit_sales_opportunities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id uuid not null,
  current_state text not null default 'intelligence_pending',
  status text not null default 'active',
  next_agent_key text,
  last_agent_id uuid,
  version integer not null default 1,
  context jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orbit_sales_opportunities_workspace_id_id_key unique (workspace_id, id),
  constraint orbit_sales_opportunities_lead_key unique (workspace_id, lead_id),
  constraint orbit_sales_opportunities_version_check check (version >= 1),
  constraint orbit_sales_opportunities_status_check check (status in ('active','won','lost','blocked','completed')),
  constraint orbit_sales_opportunities_state_check check (current_state in (
    'intelligence_pending','intelligence_ready','research_ready','qualified','review','unqualified',
    'outreach_drafted','waiting_reply','engaged','proposal_requested','proposal_drafted',
    'payment_pending','payment_confirmed','handoff_ready','delivery_active','delivery_completed',
    'proof_ready','referral_ready','closed_won','closed_lost','blocked'
  )),
  constraint orbit_sales_opportunities_lead_fk foreign key (workspace_id, lead_id)
    references public.leads(workspace_id, id) on delete cascade,
  constraint orbit_sales_opportunities_agent_fk foreign key (workspace_id, last_agent_id)
    references public.orbit_agents(workspace_id, id) on delete set null
);

create table if not exists public.orbit_lead_research (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  opportunity_id uuid not null,
  lead_id uuid not null,
  intelligence_id uuid not null,
  run_id uuid not null,
  task_id uuid not null,
  agent_id uuid not null,
  company_summary text not null,
  verified_facts jsonb not null default '[]'::jsonb,
  risk_flags jsonb not null default '[]'::jsonb,
  opportunities jsonb not null default '[]'::jsonb,
  contact_routes jsonb not null default '[]'::jsonb,
  confidence smallint not null,
  status text not null default 'complete',
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint orbit_lead_research_workspace_id_id_key unique (workspace_id, id),
  constraint orbit_lead_research_task_key unique (workspace_id, task_id),
  constraint orbit_lead_research_confidence_check check (confidence between 0 and 100),
  constraint orbit_lead_research_status_check check (status in ('complete','needs_review')),
  constraint orbit_lead_research_summary_check check (char_length(company_summary) between 2 and 4000),
  constraint orbit_lead_research_opportunity_fk foreign key (workspace_id, opportunity_id)
    references public.orbit_sales_opportunities(workspace_id, id) on delete cascade,
  constraint orbit_lead_research_lead_fk foreign key (workspace_id, lead_id)
    references public.leads(workspace_id, id) on delete cascade,
  constraint orbit_lead_research_intelligence_fk foreign key (workspace_id, intelligence_id)
    references public.orbit_lead_intelligence(workspace_id, id) on delete cascade,
  constraint orbit_lead_research_run_fk foreign key (workspace_id, run_id)
    references public.orbit_agent_runs(workspace_id, id) on delete cascade,
  constraint orbit_lead_research_task_fk foreign key (workspace_id, task_id)
    references public.orbit_agent_tasks(workspace_id, id) on delete cascade,
  constraint orbit_lead_research_agent_fk foreign key (workspace_id, agent_id)
    references public.orbit_agents(workspace_id, id) on delete restrict
);

create table if not exists public.orbit_qualifications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  opportunity_id uuid not null,
  lead_id uuid not null,
  intelligence_id uuid not null,
  research_id uuid not null,
  run_id uuid not null,
  task_id uuid not null,
  agent_id uuid not null,
  total_score smallint not null,
  decision text not null,
  reason text not null,
  recommended_offer text,
  recommended_channel text,
  next_state text not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint orbit_qualifications_workspace_id_id_key unique (workspace_id, id),
  constraint orbit_qualifications_task_key unique (workspace_id, task_id),
  constraint orbit_qualifications_score_check check (total_score between 0 and 100),
  constraint orbit_qualifications_decision_check check (decision in ('qualified','review','unqualified')),
  constraint orbit_qualifications_reason_check check (char_length(reason) between 2 and 4000),
  constraint orbit_qualifications_channel_check check ((recommended_channel is null) or recommended_channel in ('email','whatsapp','phone','manual')),
  constraint orbit_qualifications_state_check check (next_state in ('qualified','review','unqualified')),
  constraint orbit_qualifications_opportunity_fk foreign key (workspace_id, opportunity_id)
    references public.orbit_sales_opportunities(workspace_id, id) on delete cascade,
  constraint orbit_qualifications_lead_fk foreign key (workspace_id, lead_id)
    references public.leads(workspace_id, id) on delete cascade,
  constraint orbit_qualifications_intelligence_fk foreign key (workspace_id, intelligence_id)
    references public.orbit_lead_intelligence(workspace_id, id) on delete cascade,
  constraint orbit_qualifications_research_fk foreign key (workspace_id, research_id)
    references public.orbit_lead_research(workspace_id, id) on delete cascade,
  constraint orbit_qualifications_run_fk foreign key (workspace_id, run_id)
    references public.orbit_agent_runs(workspace_id, id) on delete cascade,
  constraint orbit_qualifications_task_fk foreign key (workspace_id, task_id)
    references public.orbit_agent_tasks(workspace_id, id) on delete cascade,
  constraint orbit_qualifications_agent_fk foreign key (workspace_id, agent_id)
    references public.orbit_agents(workspace_id, id) on delete restrict
);

create table if not exists public.orbit_followup_plans (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  opportunity_id uuid not null,
  lead_id uuid not null,
  outreach_draft_id uuid not null,
  run_id uuid not null,
  task_id uuid not null,
  agent_id uuid not null,
  channel text not null,
  sequence jsonb not null default '[]'::jsonb,
  status text not null default 'draft',
  external_send_enabled boolean not null default false,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orbit_followup_plans_workspace_id_id_key unique (workspace_id, id),
  constraint orbit_followup_plans_task_key unique (workspace_id, task_id),
  constraint orbit_followup_plans_channel_check check (channel in ('email','whatsapp','phone','manual')),
  constraint orbit_followup_plans_status_check check (status in ('draft','ready','paused','completed')),
  constraint orbit_followup_plans_no_send_check check (external_send_enabled = false),
  constraint orbit_followup_plans_opportunity_fk foreign key (workspace_id, opportunity_id)
    references public.orbit_sales_opportunities(workspace_id, id) on delete cascade,
  constraint orbit_followup_plans_lead_fk foreign key (workspace_id, lead_id)
    references public.leads(workspace_id, id) on delete cascade,
  constraint orbit_followup_plans_outreach_fk foreign key (workspace_id, outreach_draft_id)
    references public.orbit_outreach_drafts(workspace_id, id) on delete cascade,
  constraint orbit_followup_plans_run_fk foreign key (workspace_id, run_id)
    references public.orbit_agent_runs(workspace_id, id) on delete cascade,
  constraint orbit_followup_plans_task_fk foreign key (workspace_id, task_id)
    references public.orbit_agent_tasks(workspace_id, id) on delete cascade,
  constraint orbit_followup_plans_agent_fk foreign key (workspace_id, agent_id)
    references public.orbit_agents(workspace_id, id) on delete restrict
);

create table if not exists public.orbit_sales_guidance (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  opportunity_id uuid not null,
  lead_id uuid not null,
  run_id uuid not null,
  task_id uuid not null,
  agent_id uuid not null,
  buying_signal text,
  objections jsonb not null default '[]'::jsonb,
  recommended_response text not null,
  recommended_next_state text not null,
  confidence smallint not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint orbit_sales_guidance_workspace_id_id_key unique (workspace_id, id),
  constraint orbit_sales_guidance_task_key unique (workspace_id, task_id),
  constraint orbit_sales_guidance_response_check check (char_length(recommended_response) between 2 and 4000),
  constraint orbit_sales_guidance_state_check check (recommended_next_state in ('engaged','proposal_requested','closed_lost','waiting_reply')),
  constraint orbit_sales_guidance_confidence_check check (confidence between 0 and 100),
  constraint orbit_sales_guidance_opportunity_fk foreign key (workspace_id, opportunity_id)
    references public.orbit_sales_opportunities(workspace_id, id) on delete cascade,
  constraint orbit_sales_guidance_lead_fk foreign key (workspace_id, lead_id)
    references public.leads(workspace_id, id) on delete cascade,
  constraint orbit_sales_guidance_run_fk foreign key (workspace_id, run_id)
    references public.orbit_agent_runs(workspace_id, id) on delete cascade,
  constraint orbit_sales_guidance_task_fk foreign key (workspace_id, task_id)
    references public.orbit_agent_tasks(workspace_id, id) on delete cascade,
  constraint orbit_sales_guidance_agent_fk foreign key (workspace_id, agent_id)
    references public.orbit_agents(workspace_id, id) on delete restrict
);

create table if not exists public.orbit_proposal_drafts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  opportunity_id uuid not null,
  lead_id uuid not null,
  run_id uuid not null,
  task_id uuid not null,
  agent_id uuid not null,
  title text not null,
  scope jsonb not null default '[]'::jsonb,
  price_min numeric not null,
  price_max numeric not null,
  currency text not null default 'PKR',
  assumptions jsonb not null default '[]'::jsonb,
  status text not null default 'draft',
  external_send_enabled boolean not null default false,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orbit_proposal_drafts_workspace_id_id_key unique (workspace_id, id),
  constraint orbit_proposal_drafts_task_key unique (workspace_id, task_id),
  constraint orbit_proposal_drafts_title_check check (char_length(title) between 2 and 240),
  constraint orbit_proposal_drafts_price_check check (price_min >= 0 and price_max >= price_min),
  constraint orbit_proposal_drafts_currency_check check (currency in ('PKR','USD','GBP','EUR','AED','SAR')),
  constraint orbit_proposal_drafts_status_check check (status in ('draft','reviewed','approved','rejected')),
  constraint orbit_proposal_drafts_no_send_check check (external_send_enabled = false),
  constraint orbit_proposal_drafts_opportunity_fk foreign key (workspace_id, opportunity_id)
    references public.orbit_sales_opportunities(workspace_id, id) on delete cascade,
  constraint orbit_proposal_drafts_lead_fk foreign key (workspace_id, lead_id)
    references public.leads(workspace_id, id) on delete cascade,
  constraint orbit_proposal_drafts_run_fk foreign key (workspace_id, run_id)
    references public.orbit_agent_runs(workspace_id, id) on delete cascade,
  constraint orbit_proposal_drafts_task_fk foreign key (workspace_id, task_id)
    references public.orbit_agent_tasks(workspace_id, id) on delete cascade,
  constraint orbit_proposal_drafts_agent_fk foreign key (workspace_id, agent_id)
    references public.orbit_agents(workspace_id, id) on delete restrict
);

create table if not exists public.orbit_onboarding_cases (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  opportunity_id uuid not null,
  lead_id uuid not null,
  proposal_id uuid not null,
  run_id uuid not null,
  task_id uuid not null,
  agent_id uuid not null,
  payment_status text not null default 'pending',
  onboarding_status text not null default 'draft',
  requirements jsonb not null default '[]'::jsonb,
  payment_reference text,
  client_id uuid,
  external_payment_action_enabled boolean not null default false,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orbit_onboarding_cases_workspace_id_id_key unique (workspace_id, id),
  constraint orbit_onboarding_cases_task_key unique (workspace_id, task_id),
  constraint orbit_onboarding_cases_payment_check check (payment_status in ('pending','confirmed_external','failed','waived')),
  constraint orbit_onboarding_cases_onboarding_check check (onboarding_status in ('draft','ready','complete')),
  constraint orbit_onboarding_cases_no_payment_action check (external_payment_action_enabled = false),
  constraint orbit_onboarding_cases_opportunity_fk foreign key (workspace_id, opportunity_id)
    references public.orbit_sales_opportunities(workspace_id, id) on delete cascade,
  constraint orbit_onboarding_cases_lead_fk foreign key (workspace_id, lead_id)
    references public.leads(workspace_id, id) on delete cascade,
  constraint orbit_onboarding_cases_proposal_fk foreign key (workspace_id, proposal_id)
    references public.orbit_proposal_drafts(workspace_id, id) on delete cascade,
  constraint orbit_onboarding_cases_run_fk foreign key (workspace_id, run_id)
    references public.orbit_agent_runs(workspace_id, id) on delete cascade,
  constraint orbit_onboarding_cases_task_fk foreign key (workspace_id, task_id)
    references public.orbit_agent_tasks(workspace_id, id) on delete cascade,
  constraint orbit_onboarding_cases_agent_fk foreign key (workspace_id, agent_id)
    references public.orbit_agents(workspace_id, id) on delete restrict,
  constraint orbit_onboarding_cases_client_fk foreign key (workspace_id, client_id)
    references public.clients(workspace_id, id) on delete set null
);

create table if not exists public.orbit_delivery_handoffs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  opportunity_id uuid not null,
  lead_id uuid not null,
  onboarding_id uuid not null,
  run_id uuid not null,
  task_id uuid not null,
  agent_id uuid not null,
  project_id uuid,
  brief jsonb not null default '{}'::jsonb,
  capacity_status text not null default 'unknown',
  status text not null default 'draft',
  external_commitment_enabled boolean not null default false,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orbit_delivery_handoffs_workspace_id_id_key unique (workspace_id, id),
  constraint orbit_delivery_handoffs_task_key unique (workspace_id, task_id),
  constraint orbit_delivery_handoffs_capacity_check check (capacity_status in ('unknown','available','constrained','blocked')),
  constraint orbit_delivery_handoffs_status_check check (status in ('draft','ready','accepted','rejected')),
  constraint orbit_delivery_handoffs_no_commitment check (external_commitment_enabled = false),
  constraint orbit_delivery_handoffs_opportunity_fk foreign key (workspace_id, opportunity_id)
    references public.orbit_sales_opportunities(workspace_id, id) on delete cascade,
  constraint orbit_delivery_handoffs_lead_fk foreign key (workspace_id, lead_id)
    references public.leads(workspace_id, id) on delete cascade,
  constraint orbit_delivery_handoffs_onboarding_fk foreign key (workspace_id, onboarding_id)
    references public.orbit_onboarding_cases(workspace_id, id) on delete cascade,
  constraint orbit_delivery_handoffs_run_fk foreign key (workspace_id, run_id)
    references public.orbit_agent_runs(workspace_id, id) on delete cascade,
  constraint orbit_delivery_handoffs_task_fk foreign key (workspace_id, task_id)
    references public.orbit_agent_tasks(workspace_id, id) on delete cascade,
  constraint orbit_delivery_handoffs_agent_fk foreign key (workspace_id, agent_id)
    references public.orbit_agents(workspace_id, id) on delete restrict,
  constraint orbit_delivery_handoffs_project_fk foreign key (workspace_id, project_id)
    references public.projects(workspace_id, id) on delete set null
);

create table if not exists public.orbit_proof_referral_plans (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  opportunity_id uuid not null,
  lead_id uuid not null,
  handoff_id uuid not null,
  run_id uuid not null,
  task_id uuid not null,
  agent_id uuid not null,
  project_id uuid,
  proof_id uuid,
  result_summary text not null,
  proof_permission_scope text not null default 'private',
  referral_plan jsonb not null default '{}'::jsonb,
  status text not null default 'draft',
  proof_publish_enabled boolean not null default false,
  referral_request_enabled boolean not null default false,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orbit_proof_referral_plans_workspace_id_id_key unique (workspace_id, id),
  constraint orbit_proof_referral_plans_task_key unique (workspace_id, task_id),
  constraint orbit_proof_referral_plans_result_check check (char_length(result_summary) between 10 and 4000),
  constraint orbit_proof_referral_plans_permission_check check (proof_permission_scope in ('private','anonymous','public')),
  constraint orbit_proof_referral_plans_status_check check (status in ('draft','ready','complete')),
  constraint orbit_proof_referral_plans_no_publish check (proof_publish_enabled = false),
  constraint orbit_proof_referral_plans_no_referral_send check (referral_request_enabled = false),
  constraint orbit_proof_referral_plans_opportunity_fk foreign key (workspace_id, opportunity_id)
    references public.orbit_sales_opportunities(workspace_id, id) on delete cascade,
  constraint orbit_proof_referral_plans_lead_fk foreign key (workspace_id, lead_id)
    references public.leads(workspace_id, id) on delete cascade,
  constraint orbit_proof_referral_plans_handoff_fk foreign key (workspace_id, handoff_id)
    references public.orbit_delivery_handoffs(workspace_id, id) on delete cascade,
  constraint orbit_proof_referral_plans_run_fk foreign key (workspace_id, run_id)
    references public.orbit_agent_runs(workspace_id, id) on delete cascade,
  constraint orbit_proof_referral_plans_task_fk foreign key (workspace_id, task_id)
    references public.orbit_agent_tasks(workspace_id, id) on delete cascade,
  constraint orbit_proof_referral_plans_agent_fk foreign key (workspace_id, agent_id)
    references public.orbit_agents(workspace_id, id) on delete restrict,
  constraint orbit_proof_referral_plans_project_fk foreign key (workspace_id, project_id)
    references public.projects(workspace_id, id) on delete set null,
  constraint orbit_proof_referral_plans_proof_fk foreign key (workspace_id, proof_id)
    references public.proofs(workspace_id, id) on delete set null
);

create index if not exists orbit_sales_opportunities_state_idx on public.orbit_sales_opportunities(workspace_id, status, current_state, updated_at desc);
create index if not exists orbit_sales_opportunities_agent_idx on public.orbit_sales_opportunities(workspace_id, last_agent_id) where last_agent_id is not null;
create index if not exists orbit_lead_research_opportunity_idx on public.orbit_lead_research(workspace_id, opportunity_id, created_at desc);
create index if not exists orbit_lead_research_intelligence_idx on public.orbit_lead_research(workspace_id, intelligence_id);
create index if not exists orbit_lead_research_run_idx on public.orbit_lead_research(workspace_id, run_id);
create index if not exists orbit_lead_research_agent_idx on public.orbit_lead_research(workspace_id, agent_id);
create index if not exists orbit_lead_research_created_by_idx on public.orbit_lead_research(created_by);
create index if not exists orbit_qualifications_opportunity_idx on public.orbit_qualifications(workspace_id, opportunity_id, created_at desc);
create index if not exists orbit_qualifications_intelligence_idx on public.orbit_qualifications(workspace_id, intelligence_id);
create index if not exists orbit_qualifications_research_idx on public.orbit_qualifications(workspace_id, research_id);
create index if not exists orbit_qualifications_run_idx on public.orbit_qualifications(workspace_id, run_id);
create index if not exists orbit_qualifications_agent_idx on public.orbit_qualifications(workspace_id, agent_id);
create index if not exists orbit_qualifications_created_by_idx on public.orbit_qualifications(created_by);
create index if not exists orbit_followup_plans_opportunity_idx on public.orbit_followup_plans(workspace_id, opportunity_id, created_at desc);
create index if not exists orbit_followup_plans_outreach_idx on public.orbit_followup_plans(workspace_id, outreach_draft_id);
create index if not exists orbit_followup_plans_run_idx on public.orbit_followup_plans(workspace_id, run_id);
create index if not exists orbit_followup_plans_agent_idx on public.orbit_followup_plans(workspace_id, agent_id);
create index if not exists orbit_followup_plans_created_by_idx on public.orbit_followup_plans(created_by);
create index if not exists orbit_sales_guidance_opportunity_idx on public.orbit_sales_guidance(workspace_id, opportunity_id, created_at desc);
create index if not exists orbit_sales_guidance_run_idx on public.orbit_sales_guidance(workspace_id, run_id);
create index if not exists orbit_sales_guidance_agent_idx on public.orbit_sales_guidance(workspace_id, agent_id);
create index if not exists orbit_sales_guidance_created_by_idx on public.orbit_sales_guidance(created_by);
create index if not exists orbit_proposal_drafts_opportunity_idx on public.orbit_proposal_drafts(workspace_id, opportunity_id, created_at desc);
create index if not exists orbit_proposal_drafts_run_idx on public.orbit_proposal_drafts(workspace_id, run_id);
create index if not exists orbit_proposal_drafts_agent_idx on public.orbit_proposal_drafts(workspace_id, agent_id);
create index if not exists orbit_proposal_drafts_created_by_idx on public.orbit_proposal_drafts(created_by);
create index if not exists orbit_onboarding_cases_opportunity_idx on public.orbit_onboarding_cases(workspace_id, opportunity_id, created_at desc);
create index if not exists orbit_onboarding_cases_proposal_idx on public.orbit_onboarding_cases(workspace_id, proposal_id);
create index if not exists orbit_onboarding_cases_run_idx on public.orbit_onboarding_cases(workspace_id, run_id);
create index if not exists orbit_onboarding_cases_agent_idx on public.orbit_onboarding_cases(workspace_id, agent_id);
create index if not exists orbit_onboarding_cases_client_idx on public.orbit_onboarding_cases(workspace_id, client_id) where client_id is not null;
create index if not exists orbit_onboarding_cases_created_by_idx on public.orbit_onboarding_cases(created_by);
create index if not exists orbit_delivery_handoffs_opportunity_idx on public.orbit_delivery_handoffs(workspace_id, opportunity_id, created_at desc);
create index if not exists orbit_delivery_handoffs_onboarding_idx on public.orbit_delivery_handoffs(workspace_id, onboarding_id);
create index if not exists orbit_delivery_handoffs_run_idx on public.orbit_delivery_handoffs(workspace_id, run_id);
create index if not exists orbit_delivery_handoffs_agent_idx on public.orbit_delivery_handoffs(workspace_id, agent_id);
create index if not exists orbit_delivery_handoffs_project_idx on public.orbit_delivery_handoffs(workspace_id, project_id) where project_id is not null;
create index if not exists orbit_delivery_handoffs_created_by_idx on public.orbit_delivery_handoffs(created_by);
create index if not exists orbit_proof_referral_plans_opportunity_idx on public.orbit_proof_referral_plans(workspace_id, opportunity_id, created_at desc);
create index if not exists orbit_proof_referral_plans_handoff_idx on public.orbit_proof_referral_plans(workspace_id, handoff_id);
create index if not exists orbit_proof_referral_plans_run_idx on public.orbit_proof_referral_plans(workspace_id, run_id);
create index if not exists orbit_proof_referral_plans_agent_idx on public.orbit_proof_referral_plans(workspace_id, agent_id);
create index if not exists orbit_proof_referral_plans_project_idx on public.orbit_proof_referral_plans(workspace_id, project_id) where project_id is not null;
create index if not exists orbit_proof_referral_plans_proof_idx on public.orbit_proof_referral_plans(workspace_id, proof_id) where proof_id is not null;
create index if not exists orbit_proof_referral_plans_created_by_idx on public.orbit_proof_referral_plans(created_by);

create trigger orbit_sales_opportunities_set_updated_at before update on public.orbit_sales_opportunities for each row execute function private.set_updated_at();
create trigger orbit_followup_plans_set_updated_at before update on public.orbit_followup_plans for each row execute function private.set_updated_at();
create trigger orbit_proposal_drafts_set_updated_at before update on public.orbit_proposal_drafts for each row execute function private.set_updated_at();
create trigger orbit_onboarding_cases_set_updated_at before update on public.orbit_onboarding_cases for each row execute function private.set_updated_at();
create trigger orbit_delivery_handoffs_set_updated_at before update on public.orbit_delivery_handoffs for each row execute function private.set_updated_at();
create trigger orbit_proof_referral_plans_set_updated_at before update on public.orbit_proof_referral_plans for each row execute function private.set_updated_at();

alter table public.orbit_sales_opportunities enable row level security;
alter table public.orbit_lead_research enable row level security;
alter table public.orbit_qualifications enable row level security;
alter table public.orbit_followup_plans enable row level security;
alter table public.orbit_sales_guidance enable row level security;
alter table public.orbit_proposal_drafts enable row level security;
alter table public.orbit_onboarding_cases enable row level security;
alter table public.orbit_delivery_handoffs enable row level security;
alter table public.orbit_proof_referral_plans enable row level security;

create policy orbit_sales_opportunities_select_member on public.orbit_sales_opportunities for select using ((select private.is_workspace_member(workspace_id)));
create policy orbit_sales_opportunities_insert_admin on public.orbit_sales_opportunities for insert with check ((select private.is_workspace_admin(workspace_id)));
create policy orbit_sales_opportunities_update_admin on public.orbit_sales_opportunities for update using ((select private.is_workspace_admin(workspace_id))) with check ((select private.is_workspace_admin(workspace_id)));
create policy orbit_sales_opportunities_delete_admin on public.orbit_sales_opportunities for delete using ((select private.is_workspace_admin(workspace_id)));

create policy orbit_lead_research_select_member on public.orbit_lead_research for select using ((select private.is_workspace_member(workspace_id)));
create policy orbit_lead_research_insert_admin on public.orbit_lead_research for insert with check ((select private.is_workspace_admin(workspace_id)));
create policy orbit_lead_research_update_admin on public.orbit_lead_research for update using ((select private.is_workspace_admin(workspace_id))) with check ((select private.is_workspace_admin(workspace_id)));
create policy orbit_lead_research_delete_admin on public.orbit_lead_research for delete using ((select private.is_workspace_admin(workspace_id)));

create policy orbit_qualifications_select_member on public.orbit_qualifications for select using ((select private.is_workspace_member(workspace_id)));
create policy orbit_qualifications_insert_admin on public.orbit_qualifications for insert with check ((select private.is_workspace_admin(workspace_id)));
create policy orbit_qualifications_update_admin on public.orbit_qualifications for update using ((select private.is_workspace_admin(workspace_id))) with check ((select private.is_workspace_admin(workspace_id)));
create policy orbit_qualifications_delete_admin on public.orbit_qualifications for delete using ((select private.is_workspace_admin(workspace_id)));

create policy orbit_followup_plans_select_member on public.orbit_followup_plans for select using ((select private.is_workspace_member(workspace_id)));
create policy orbit_followup_plans_insert_admin on public.orbit_followup_plans for insert with check ((select private.is_workspace_admin(workspace_id)));
create policy orbit_followup_plans_update_admin on public.orbit_followup_plans for update using ((select private.is_workspace_admin(workspace_id))) with check ((select private.is_workspace_admin(workspace_id)));
create policy orbit_followup_plans_delete_admin on public.orbit_followup_plans for delete using ((select private.is_workspace_admin(workspace_id)));

create policy orbit_sales_guidance_select_member on public.orbit_sales_guidance for select using ((select private.is_workspace_member(workspace_id)));
create policy orbit_sales_guidance_insert_admin on public.orbit_sales_guidance for insert with check ((select private.is_workspace_admin(workspace_id)));
create policy orbit_sales_guidance_update_admin on public.orbit_sales_guidance for update using ((select private.is_workspace_admin(workspace_id))) with check ((select private.is_workspace_admin(workspace_id)));
create policy orbit_sales_guidance_delete_admin on public.orbit_sales_guidance for delete using ((select private.is_workspace_admin(workspace_id)));

create policy orbit_proposal_drafts_select_member on public.orbit_proposal_drafts for select using ((select private.is_workspace_member(workspace_id)));
create policy orbit_proposal_drafts_insert_admin on public.orbit_proposal_drafts for insert with check ((select private.is_workspace_admin(workspace_id)));
create policy orbit_proposal_drafts_update_admin on public.orbit_proposal_drafts for update using ((select private.is_workspace_admin(workspace_id))) with check ((select private.is_workspace_admin(workspace_id)));
create policy orbit_proposal_drafts_delete_admin on public.orbit_proposal_drafts for delete using ((select private.is_workspace_admin(workspace_id)));

create policy orbit_onboarding_cases_select_member on public.orbit_onboarding_cases for select using ((select private.is_workspace_member(workspace_id)));
create policy orbit_onboarding_cases_insert_admin on public.orbit_onboarding_cases for insert with check ((select private.is_workspace_admin(workspace_id)));
create policy orbit_onboarding_cases_update_admin on public.orbit_onboarding_cases for update using ((select private.is_workspace_admin(workspace_id))) with check ((select private.is_workspace_admin(workspace_id)));
create policy orbit_onboarding_cases_delete_admin on public.orbit_onboarding_cases for delete using ((select private.is_workspace_admin(workspace_id)));

create policy orbit_delivery_handoffs_select_member on public.orbit_delivery_handoffs for select using ((select private.is_workspace_member(workspace_id)));
create policy orbit_delivery_handoffs_insert_admin on public.orbit_delivery_handoffs for insert with check ((select private.is_workspace_admin(workspace_id)));
create policy orbit_delivery_handoffs_update_admin on public.orbit_delivery_handoffs for update using ((select private.is_workspace_admin(workspace_id))) with check ((select private.is_workspace_admin(workspace_id)));
create policy orbit_delivery_handoffs_delete_admin on public.orbit_delivery_handoffs for delete using ((select private.is_workspace_admin(workspace_id)));

create policy orbit_proof_referral_plans_select_member on public.orbit_proof_referral_plans for select using ((select private.is_workspace_member(workspace_id)));
create policy orbit_proof_referral_plans_insert_admin on public.orbit_proof_referral_plans for insert with check ((select private.is_workspace_admin(workspace_id)));
create policy orbit_proof_referral_plans_update_admin on public.orbit_proof_referral_plans for update using ((select private.is_workspace_admin(workspace_id))) with check ((select private.is_workspace_admin(workspace_id)));
create policy orbit_proof_referral_plans_delete_admin on public.orbit_proof_referral_plans for delete using ((select private.is_workspace_admin(workspace_id)));

revoke all on table public.orbit_sales_opportunities, public.orbit_lead_research, public.orbit_qualifications,
  public.orbit_followup_plans, public.orbit_sales_guidance, public.orbit_proposal_drafts,
  public.orbit_onboarding_cases, public.orbit_delivery_handoffs, public.orbit_proof_referral_plans from anon;

grant select, insert, update, delete on table public.orbit_sales_opportunities, public.orbit_lead_research, public.orbit_qualifications,
  public.orbit_followup_plans, public.orbit_sales_guidance, public.orbit_proposal_drafts,
  public.orbit_onboarding_cases, public.orbit_delivery_handoffs, public.orbit_proof_referral_plans to authenticated;
