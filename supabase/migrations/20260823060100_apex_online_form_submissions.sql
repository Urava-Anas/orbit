create table if not exists public.apex_online_form_submissions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  form_type text not null default 'trial_request',
  source text not null default 'website',
  full_name text not null,
  phone text not null,
  email text not null,
  company text,
  equipment text not null,
  fleet_size text not null,
  preferred_lanes text,
  message text,
  status text not null default 'new' check (status in ('new','contacted','qualified','won','lost','archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists apex_online_form_submissions_workspace_created_idx
  on public.apex_online_form_submissions (workspace_id, created_at desc);
create index if not exists apex_online_form_submissions_workspace_status_idx
  on public.apex_online_form_submissions (workspace_id, status, created_at desc);

alter table public.apex_online_form_submissions enable row level security;

drop policy if exists apex_form_select_member on public.apex_online_form_submissions;
create policy apex_form_select_member on public.apex_online_form_submissions
for select to authenticated
using ((select private.is_workspace_member(workspace_id)));

drop policy if exists apex_form_update_admin on public.apex_online_form_submissions;
create policy apex_form_update_admin on public.apex_online_form_submissions
for update to authenticated
using ((select private.is_workspace_admin(workspace_id)))
with check ((select private.is_workspace_admin(workspace_id)));

grant select, update on public.apex_online_form_submissions to authenticated;
