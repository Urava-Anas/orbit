create extension if not exists pgcrypto;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  owner_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  company text check (company is null or char_length(company) <= 160),
  email text check (email is null or char_length(email) <= 254),
  phone text check (phone is null or char_length(phone) <= 40),
  source text not null default 'direct' check (source in ('direct', 'referral', 'website', 'whatsapp', 'facebook', 'instagram', 'linkedin', 'google', 'other')),
  stage text not null default 'new' check (stage in ('new', 'qualified', 'proposal', 'won', 'lost')),
  estimated_value numeric(14,2) not null default 0 check (estimated_value >= 0),
  currency text not null default 'PKR' check (currency in ('PKR', 'USD', 'GBP', 'EUR', 'AED', 'SAR')),
  next_action text check (next_action is null or char_length(next_action) <= 240),
  next_action_at timestamptz,
  notes text check (notes is null or char_length(notes) <= 4000),
  owner_id uuid references auth.users(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id)
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 160),
  contact_name text check (contact_name is null or char_length(contact_name) <= 120),
  email text check (email is null or char_length(email) <= 254),
  phone text check (phone is null or char_length(phone) <= 40),
  website text check (website is null or char_length(website) <= 500),
  notes text check (notes is null or char_length(notes) <= 4000),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  unique (workspace_id, name)
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_id uuid not null,
  lead_id uuid,
  name text not null check (char_length(name) between 2 and 180),
  summary text check (summary is null or char_length(summary) <= 4000),
  status text not null default 'planned' check (status in ('planned', 'in_progress', 'review', 'blocked', 'completed')),
  value numeric(14,2) not null default 0 check (value >= 0),
  currency text not null default 'PKR' check (currency in ('PKR', 'USD', 'GBP', 'EUR', 'AED', 'SAR')),
  start_date date,
  due_date date,
  owner_id uuid references auth.users(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_dates_valid check (due_date is null or start_date is null or due_date >= start_date),
  constraint projects_client_same_workspace
    foreign key (workspace_id, client_id) references public.clients(workspace_id, id) on delete restrict,
  constraint projects_lead_same_workspace
    foreign key (workspace_id, lead_id) references public.leads(workspace_id, id) on delete set null (lead_id),
  unique (workspace_id, id)
);

create table public.project_tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null,
  title text not null check (char_length(title) between 2 and 240),
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'blocked', 'done')),
  due_date date,
  owner_id uuid references auth.users(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_tasks_project_same_workspace
    foreign key (workspace_id, project_id) references public.projects(workspace_id, id) on delete cascade
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid,
  reference text not null check (char_length(reference) between 2 and 80),
  amount numeric(14,2) not null check (amount >= 0),
  currency text not null default 'PKR' check (currency in ('PKR', 'USD', 'GBP', 'EUR', 'AED', 'SAR')),
  status text not null default 'draft' check (status in ('draft', 'sent', 'paid', 'overdue', 'void')),
  issued_at date,
  due_at date,
  paid_at timestamptz,
  notes text check (notes is null or char_length(notes) <= 2000),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invoices_project_same_workspace
    foreign key (workspace_id, project_id) references public.projects(workspace_id, id) on delete set null (project_id),
  unique (workspace_id, reference)
);

create table public.proofs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null,
  title text not null check (char_length(title) between 2 and 180),
  result text not null check (char_length(result) between 10 and 4000),
  evidence_url text check (evidence_url is null or char_length(evidence_url) <= 500),
  permission_scope text not null default 'private' check (permission_scope in ('private', 'anonymous', 'public')),
  status text not null default 'draft' check (status in ('draft', 'approved', 'published')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint proofs_project_same_workspace
    foreign key (workspace_id, project_id) references public.projects(workspace_id, id) on delete cascade,
  unique (workspace_id, id)
);

create table public.content_drafts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  proof_id uuid not null,
  channel text not null check (channel in ('website', 'linkedin', 'facebook', 'instagram', 'whatsapp')),
  title text not null check (char_length(title) between 2 and 180),
  body text not null check (char_length(body) between 10 and 8000),
  status text not null default 'draft' check (status in ('draft', 'review', 'approved', 'published', 'archived')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint content_proof_same_workspace
    foreign key (workspace_id, proof_id) references public.proofs(workspace_id, id) on delete cascade
);

create table public.audit_events (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index workspace_members_user_idx on public.workspace_members(user_id, workspace_id);
create index leads_workspace_stage_idx on public.leads(workspace_id, stage);
create index leads_workspace_next_action_idx on public.leads(workspace_id, next_action_at) where next_action_at is not null;
create index clients_workspace_created_idx on public.clients(workspace_id, created_at desc);
create index projects_workspace_status_idx on public.projects(workspace_id, status);
create index project_tasks_project_status_idx on public.project_tasks(project_id, status);
create index invoices_workspace_status_idx on public.invoices(workspace_id, status);
create index proofs_workspace_status_idx on public.proofs(workspace_id, status);
create index content_workspace_status_idx on public.content_drafts(workspace_id, status);
create index audit_events_workspace_created_idx on public.audit_events(workspace_id, created_at desc);

create function private.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = (select auth.uid())
  );
$$;

create function private.is_workspace_admin(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = (select auth.uid())
      and wm.role in ('owner', 'admin')
  );
$$;

revoke execute on function private.is_workspace_member(uuid) from public, anon;
revoke execute on function private.is_workspace_admin(uuid) from public, anon;
grant execute on function private.is_workspace_member(uuid) to authenticated;
grant execute on function private.is_workspace_admin(uuid) to authenticated;

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create function private.capture_audit_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  record_workspace_id uuid;
  record_id uuid;
begin
  if tg_op = 'DELETE' then
    record_workspace_id := old.workspace_id;
    record_id := old.id;
  else
    record_workspace_id := new.workspace_id;
    record_id := new.id;
  end if;

  insert into public.audit_events (
    workspace_id,
    actor_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    record_workspace_id,
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    record_id,
    jsonb_build_object('occurred_at', now())
  );

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_workspace_id uuid := gen_random_uuid();
  workspace_name text;
begin
  workspace_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'workspace_name'), ''),
    split_part(new.email, '@', 1) || '''s workspace'
  );

  insert into public.profiles (id, full_name)
  values (new.id, nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''));

  insert into public.workspaces (id, name, slug, owner_id)
  values (
    new_workspace_id,
    left(workspace_name, 80),
    'orbit-' || substring(replace(new.id::text, '-', '') from 1 for 12),
    new.id
  );

  insert into public.workspace_members (workspace_id, user_id, role)
  values (new_workspace_id, new.id, 'owner');

  return new;
end;
$$;

revoke execute on function private.set_updated_at() from public, anon, authenticated;
revoke execute on function private.capture_audit_event() from public, anon, authenticated;
revoke execute on function private.handle_new_user() from public, anon, authenticated;
grant usage on schema private to supabase_auth_admin;
grant execute on function private.handle_new_user() to supabase_auth_admin;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();
create trigger workspaces_set_updated_at before update on public.workspaces
  for each row execute function private.set_updated_at();
create trigger leads_set_updated_at before update on public.leads
  for each row execute function private.set_updated_at();
create trigger clients_set_updated_at before update on public.clients
  for each row execute function private.set_updated_at();
create trigger projects_set_updated_at before update on public.projects
  for each row execute function private.set_updated_at();
create trigger project_tasks_set_updated_at before update on public.project_tasks
  for each row execute function private.set_updated_at();
create trigger invoices_set_updated_at before update on public.invoices
  for each row execute function private.set_updated_at();
create trigger proofs_set_updated_at before update on public.proofs
  for each row execute function private.set_updated_at();
create trigger content_drafts_set_updated_at before update on public.content_drafts
  for each row execute function private.set_updated_at();

create trigger leads_capture_audit after insert or update or delete on public.leads
  for each row execute function private.capture_audit_event();
create trigger clients_capture_audit after insert or update or delete on public.clients
  for each row execute function private.capture_audit_event();
create trigger projects_capture_audit after insert or update or delete on public.projects
  for each row execute function private.capture_audit_event();
create trigger project_tasks_capture_audit after insert or update or delete on public.project_tasks
  for each row execute function private.capture_audit_event();
create trigger invoices_capture_audit after insert or update or delete on public.invoices
  for each row execute function private.capture_audit_event();
create trigger proofs_capture_audit after insert or update or delete on public.proofs
  for each row execute function private.capture_audit_event();
create trigger content_capture_audit after insert or update or delete on public.content_drafts
  for each row execute function private.capture_audit_event();

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.leads enable row level security;
alter table public.clients enable row level security;
alter table public.projects enable row level security;
alter table public.project_tasks enable row level security;
alter table public.invoices enable row level security;
alter table public.proofs enable row level security;
alter table public.content_drafts enable row level security;
alter table public.audit_events enable row level security;

create policy profiles_select_own on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id);
create policy profiles_update_own on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy workspaces_select_member on public.workspaces
  for select to authenticated
  using ((select private.is_workspace_member(id)));
create policy workspaces_insert_owner on public.workspaces
  for insert to authenticated
  with check ((select auth.uid()) = owner_id);
create policy workspaces_update_admin on public.workspaces
  for update to authenticated
  using ((select private.is_workspace_admin(id)))
  with check ((select private.is_workspace_admin(id)));

create policy workspace_members_select_member on public.workspace_members
  for select to authenticated
  using ((select private.is_workspace_member(workspace_id)));
create policy workspace_members_insert_admin on public.workspace_members
  for insert to authenticated
  with check ((select private.is_workspace_admin(workspace_id)));
create policy workspace_members_update_admin on public.workspace_members
  for update to authenticated
  using ((select private.is_workspace_admin(workspace_id)))
  with check ((select private.is_workspace_admin(workspace_id)));
create policy workspace_members_delete_admin on public.workspace_members
  for delete to authenticated
  using ((select private.is_workspace_admin(workspace_id)) and role <> 'owner');

create policy leads_select_member on public.leads
  for select to authenticated using ((select private.is_workspace_member(workspace_id)));
create policy leads_insert_member on public.leads
  for insert to authenticated with check ((select private.is_workspace_member(workspace_id)));
create policy leads_update_member on public.leads
  for update to authenticated
  using ((select private.is_workspace_member(workspace_id)))
  with check ((select private.is_workspace_member(workspace_id)));
create policy leads_delete_admin on public.leads
  for delete to authenticated using ((select private.is_workspace_admin(workspace_id)));

create policy clients_select_member on public.clients
  for select to authenticated using ((select private.is_workspace_member(workspace_id)));
create policy clients_insert_member on public.clients
  for insert to authenticated with check ((select private.is_workspace_member(workspace_id)));
create policy clients_update_member on public.clients
  for update to authenticated
  using ((select private.is_workspace_member(workspace_id)))
  with check ((select private.is_workspace_member(workspace_id)));
create policy clients_delete_admin on public.clients
  for delete to authenticated using ((select private.is_workspace_admin(workspace_id)));

create policy projects_select_member on public.projects
  for select to authenticated using ((select private.is_workspace_member(workspace_id)));
create policy projects_insert_member on public.projects
  for insert to authenticated with check ((select private.is_workspace_member(workspace_id)));
create policy projects_update_member on public.projects
  for update to authenticated
  using ((select private.is_workspace_member(workspace_id)))
  with check ((select private.is_workspace_member(workspace_id)));
create policy projects_delete_admin on public.projects
  for delete to authenticated using ((select private.is_workspace_admin(workspace_id)));

create policy project_tasks_select_member on public.project_tasks
  for select to authenticated using ((select private.is_workspace_member(workspace_id)));
create policy project_tasks_insert_member on public.project_tasks
  for insert to authenticated with check ((select private.is_workspace_member(workspace_id)));
create policy project_tasks_update_member on public.project_tasks
  for update to authenticated
  using ((select private.is_workspace_member(workspace_id)))
  with check ((select private.is_workspace_member(workspace_id)));
create policy project_tasks_delete_admin on public.project_tasks
  for delete to authenticated using ((select private.is_workspace_admin(workspace_id)));

create policy invoices_select_member on public.invoices
  for select to authenticated using ((select private.is_workspace_member(workspace_id)));
create policy invoices_insert_member on public.invoices
  for insert to authenticated with check ((select private.is_workspace_member(workspace_id)));
create policy invoices_update_member on public.invoices
  for update to authenticated
  using ((select private.is_workspace_member(workspace_id)))
  with check ((select private.is_workspace_member(workspace_id)));
create policy invoices_delete_admin on public.invoices
  for delete to authenticated using ((select private.is_workspace_admin(workspace_id)));

create policy proofs_select_member on public.proofs
  for select to authenticated using ((select private.is_workspace_member(workspace_id)));
create policy proofs_insert_member on public.proofs
  for insert to authenticated with check ((select private.is_workspace_member(workspace_id)));
create policy proofs_update_member on public.proofs
  for update to authenticated
  using ((select private.is_workspace_member(workspace_id)))
  with check ((select private.is_workspace_member(workspace_id)));
create policy proofs_delete_admin on public.proofs
  for delete to authenticated using ((select private.is_workspace_admin(workspace_id)));

create policy content_select_member on public.content_drafts
  for select to authenticated using ((select private.is_workspace_member(workspace_id)));
create policy content_insert_member on public.content_drafts
  for insert to authenticated with check ((select private.is_workspace_member(workspace_id)));
create policy content_update_member on public.content_drafts
  for update to authenticated
  using ((select private.is_workspace_member(workspace_id)))
  with check ((select private.is_workspace_member(workspace_id)));
create policy content_delete_admin on public.content_drafts
  for delete to authenticated using ((select private.is_workspace_admin(workspace_id)));

create policy audit_events_select_member on public.audit_events
  for select to authenticated using ((select private.is_workspace_member(workspace_id)));

revoke all on all tables in schema public from anon, authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update on public.workspaces to authenticated;
grant select, insert, update, delete on public.workspace_members to authenticated;
grant select, insert, update, delete on public.leads to authenticated;
grant select, insert, update, delete on public.clients to authenticated;
grant select, insert, update, delete on public.projects to authenticated;
grant select, insert, update, delete on public.project_tasks to authenticated;
grant select, insert, update, delete on public.invoices to authenticated;
grant select, insert, update, delete on public.proofs to authenticated;
grant select, insert, update, delete on public.content_drafts to authenticated;
grant select on public.audit_events to authenticated;
grant usage, select on sequence public.audit_events_id_seq to authenticated;
