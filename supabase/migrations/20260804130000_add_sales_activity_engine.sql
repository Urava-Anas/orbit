create table if not exists public.lead_activities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id uuid not null,
  kind text not null check (
    kind in ('whatsapp', 'call', 'email', 'meeting', 'audit', 'proposal', 'note')
  ),
  direction text not null default 'outbound' check (
    direction in ('outbound', 'inbound', 'internal')
  ),
  outcome text not null default 'logged' check (
    outcome in (
      'logged',
      'sent',
      'no_answer',
      'replied',
      'booked',
      'proposal_sent',
      'won',
      'lost'
    )
  ),
  summary text not null check (
    char_length(summary) between 2 and 4000
  ),
  occurred_at timestamptz not null default now(),
  next_action text check (
    next_action is null or char_length(next_action) <= 240
  ),
  next_action_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint lead_activities_workspace_lead_fkey
    foreign key (workspace_id, lead_id)
    references public.leads(workspace_id, id)
    on delete cascade
);

create index if not exists lead_activities_workspace_lead_occurred_idx
  on public.lead_activities (workspace_id, lead_id, occurred_at desc);

create index if not exists lead_activities_workspace_outcome_idx
  on public.lead_activities (workspace_id, outcome, occurred_at desc);

create index if not exists lead_activities_created_by_idx
  on public.lead_activities (created_by);

alter table public.lead_activities enable row level security;

grant select, insert, update, delete on public.lead_activities to authenticated;

drop policy if exists lead_activities_select_member on public.lead_activities;
create policy lead_activities_select_member
  on public.lead_activities
  for select
  to authenticated
  using ((select private.is_workspace_member(workspace_id)));

drop policy if exists lead_activities_insert_member on public.lead_activities;
create policy lead_activities_insert_member
  on public.lead_activities
  for insert
  to authenticated
  with check (
    (select private.is_workspace_member(workspace_id))
    and created_by = (select auth.uid())
  );

drop policy if exists lead_activities_update_member on public.lead_activities;
create policy lead_activities_update_member
  on public.lead_activities
  for update
  to authenticated
  using ((select private.is_workspace_member(workspace_id)))
  with check ((select private.is_workspace_member(workspace_id)));

drop policy if exists lead_activities_delete_admin on public.lead_activities;
create policy lead_activities_delete_admin
  on public.lead_activities
  for delete
  to authenticated
  using ((select private.is_workspace_admin(workspace_id)));

comment on table public.lead_activities is
  'Workspace-scoped sales execution timeline for calls, messages, audits, proposals and outcomes.';

comment on column public.lead_activities.summary is
  'A factual record of what happened. Do not store secrets, passwords or sensitive client documents.';
