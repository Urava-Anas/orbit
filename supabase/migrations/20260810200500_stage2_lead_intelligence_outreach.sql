-- Orbit Stage 2: durable Lead Intelligence + Outreach artifacts.
-- External message sending is deliberately excluded from this stage.

insert into public.capabilities (capability_key, module_key, description, risk_level)
values
  ('agents.delegate', 'command', 'Delegate an internal task from a manager agent to an approved specialist agent.', 'green'),
  ('growth.lead_intelligence', 'growth', 'Analyze and qualify an existing Orbit lead using workspace-owned evidence.', 'green'),
  ('growth.outreach_draft', 'growth', 'Create a personalized outreach draft without sending it externally.', 'green'),
  ('growth.outreach_send', 'growth', 'Send an approved outbound sales message to a lead.', 'red')
on conflict (capability_key) do update
set module_key = excluded.module_key,
    description = excluded.description,
    risk_level = excluded.risk_level;

create table if not exists public.orbit_lead_intelligence (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id uuid not null,
  finder_result_id uuid,
  run_id uuid not null,
  task_id uuid not null,
  agent_id uuid not null,
  fit_score smallint not null,
  problem_score smallint not null,
  contactability_score smallint not null,
  commercial_score smallint not null,
  total_score smallint not null,
  qualification text not null,
  pain_point text,
  detected_weakness text,
  recommended_offer text,
  recommended_channel text,
  suggested_next_action text,
  evidence jsonb not null default '[]'::jsonb,
  scoring_basis jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint orbit_lead_intelligence_workspace_id_id_key unique (workspace_id, id),
  constraint orbit_lead_intelligence_task_key unique (workspace_id, task_id),
  constraint orbit_lead_intelligence_fit_check check (fit_score between 0 and 30),
  constraint orbit_lead_intelligence_problem_check check (problem_score between 0 and 30),
  constraint orbit_lead_intelligence_contactability_check check (contactability_score between 0 and 20),
  constraint orbit_lead_intelligence_commercial_check check (commercial_score between 0 and 20),
  constraint orbit_lead_intelligence_total_check check (total_score between 0 and 100),
  constraint orbit_lead_intelligence_qualification_check check (qualification in ('qualified', 'review', 'unqualified')),
  constraint orbit_lead_intelligence_channel_check check ((recommended_channel is null) or (recommended_channel in ('email', 'whatsapp', 'phone', 'manual'))),
  constraint orbit_lead_intelligence_pain_check check ((pain_point is null) or char_length(pain_point) <= 2000),
  constraint orbit_lead_intelligence_weakness_check check ((detected_weakness is null) or char_length(detected_weakness) <= 2000),
  constraint orbit_lead_intelligence_offer_check check ((recommended_offer is null) or char_length(recommended_offer) <= 1000),
  constraint orbit_lead_intelligence_action_check check ((suggested_next_action is null) or char_length(suggested_next_action) <= 500),
  constraint orbit_lead_intelligence_lead_fk foreign key (workspace_id, lead_id)
    references public.leads(workspace_id, id) on delete cascade,
  constraint orbit_lead_intelligence_finder_fk foreign key (workspace_id, finder_result_id)
    references public.lead_finder_results(workspace_id, id) on delete set null,
  constraint orbit_lead_intelligence_run_fk foreign key (workspace_id, run_id)
    references public.orbit_agent_runs(workspace_id, id) on delete cascade,
  constraint orbit_lead_intelligence_task_fk foreign key (workspace_id, task_id)
    references public.orbit_agent_tasks(workspace_id, id) on delete cascade,
  constraint orbit_lead_intelligence_agent_fk foreign key (workspace_id, agent_id)
    references public.orbit_agents(workspace_id, id) on delete restrict
);

create table if not exists public.orbit_outreach_drafts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id uuid not null,
  intelligence_id uuid not null,
  run_id uuid not null,
  task_id uuid not null,
  agent_id uuid not null,
  channel text not null,
  subject text,
  body text not null,
  status text not null default 'draft',
  personalization_basis jsonb not null default '[]'::jsonb,
  generation_mode text not null default 'deterministic_fallback',
  model_provider text,
  model_name text,
  external_send_enabled boolean not null default false,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orbit_outreach_drafts_workspace_id_id_key unique (workspace_id, id),
  constraint orbit_outreach_drafts_task_key unique (workspace_id, task_id),
  constraint orbit_outreach_drafts_channel_check check (channel in ('email', 'whatsapp', 'phone', 'manual')),
  constraint orbit_outreach_drafts_status_check check (status in ('draft', 'reviewed', 'approved', 'rejected')),
  constraint orbit_outreach_drafts_subject_check check ((subject is null) or char_length(subject) <= 240),
  constraint orbit_outreach_drafts_body_check check (char_length(body) between 2 and 4000),
  constraint orbit_outreach_drafts_generation_mode_check check (generation_mode in ('deterministic_fallback', 'local_model')),
  constraint orbit_outreach_drafts_no_send_check check (external_send_enabled = false),
  constraint orbit_outreach_drafts_lead_fk foreign key (workspace_id, lead_id)
    references public.leads(workspace_id, id) on delete cascade,
  constraint orbit_outreach_drafts_intelligence_fk foreign key (workspace_id, intelligence_id)
    references public.orbit_lead_intelligence(workspace_id, id) on delete cascade,
  constraint orbit_outreach_drafts_run_fk foreign key (workspace_id, run_id)
    references public.orbit_agent_runs(workspace_id, id) on delete cascade,
  constraint orbit_outreach_drafts_task_fk foreign key (workspace_id, task_id)
    references public.orbit_agent_tasks(workspace_id, id) on delete cascade,
  constraint orbit_outreach_drafts_agent_fk foreign key (workspace_id, agent_id)
    references public.orbit_agents(workspace_id, id) on delete restrict
);

create index if not exists orbit_lead_intelligence_lead_idx
  on public.orbit_lead_intelligence(workspace_id, lead_id, created_at desc);
create index if not exists orbit_lead_intelligence_finder_idx
  on public.orbit_lead_intelligence(workspace_id, finder_result_id)
  where finder_result_id is not null;
create index if not exists orbit_lead_intelligence_run_idx
  on public.orbit_lead_intelligence(workspace_id, run_id);
create index if not exists orbit_lead_intelligence_agent_idx
  on public.orbit_lead_intelligence(workspace_id, agent_id);
create index if not exists orbit_lead_intelligence_created_by_idx
  on public.orbit_lead_intelligence(created_by);

create index if not exists orbit_outreach_drafts_lead_idx
  on public.orbit_outreach_drafts(workspace_id, lead_id, created_at desc);
create index if not exists orbit_outreach_drafts_intelligence_idx
  on public.orbit_outreach_drafts(workspace_id, intelligence_id);
create index if not exists orbit_outreach_drafts_run_idx
  on public.orbit_outreach_drafts(workspace_id, run_id);
create index if not exists orbit_outreach_drafts_agent_idx
  on public.orbit_outreach_drafts(workspace_id, agent_id);
create index if not exists orbit_outreach_drafts_created_by_idx
  on public.orbit_outreach_drafts(created_by);

create trigger orbit_outreach_drafts_set_updated_at
before update on public.orbit_outreach_drafts
for each row execute function private.set_updated_at();

alter table public.orbit_lead_intelligence enable row level security;
alter table public.orbit_outreach_drafts enable row level security;

create policy orbit_lead_intelligence_select_member on public.orbit_lead_intelligence
for select using ((select private.is_workspace_member(workspace_id)));
create policy orbit_lead_intelligence_insert_admin on public.orbit_lead_intelligence
for insert with check ((select private.is_workspace_admin(workspace_id)));
create policy orbit_lead_intelligence_update_admin on public.orbit_lead_intelligence
for update using ((select private.is_workspace_admin(workspace_id)))
with check ((select private.is_workspace_admin(workspace_id)));
create policy orbit_lead_intelligence_delete_admin on public.orbit_lead_intelligence
for delete using ((select private.is_workspace_admin(workspace_id)));

create policy orbit_outreach_drafts_select_member on public.orbit_outreach_drafts
for select using ((select private.is_workspace_member(workspace_id)));
create policy orbit_outreach_drafts_insert_admin on public.orbit_outreach_drafts
for insert with check ((select private.is_workspace_admin(workspace_id)));
create policy orbit_outreach_drafts_update_admin on public.orbit_outreach_drafts
for update using ((select private.is_workspace_admin(workspace_id)))
with check ((select private.is_workspace_admin(workspace_id)));
create policy orbit_outreach_drafts_delete_admin on public.orbit_outreach_drafts
for delete using ((select private.is_workspace_admin(workspace_id)));

revoke all on table public.orbit_lead_intelligence from anon;
revoke all on table public.orbit_outreach_drafts from anon;
grant select, insert, update, delete on table public.orbit_lead_intelligence to authenticated;
grant select, insert, update, delete on table public.orbit_outreach_drafts to authenticated;
