create table public.organisation_modules (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  module_key text not null check (module_key ~ '^[a-z][a-z0-9_]{1,63}$'),
  status text not null default 'disabled' check (status in ('enabled', 'pilot', 'disabled')),
  config jsonb not null default '{}'::jsonb check (jsonb_typeof(config) = 'object'),
  enabled_at timestamptz,
  enabled_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, module_key)
);

create table public.capabilities (
  capability_key text primary key check (capability_key ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){1,4}$'),
  module_key text not null check (module_key ~ '^[a-z][a-z0-9_]{1,63}$'),
  description text not null check (char_length(description) between 3 and 240),
  risk_level text not null default 'green' check (risk_level in ('green', 'amber', 'red')),
  created_at timestamptz not null default now()
);

create table public.permission_bundles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  bundle_key text not null check (bundle_key ~ '^[a-z][a-z0-9_]{1,63}$'),
  name text not null check (char_length(name) between 2 and 80),
  description text not null default '' check (char_length(description) <= 500),
  system_managed boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, bundle_key),
  unique (workspace_id, id)
);

create table public.permission_bundle_capabilities (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  bundle_id uuid not null,
  capability_key text not null references public.capabilities(capability_key) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (bundle_id, capability_key),
  foreign key (workspace_id, bundle_id)
    references public.permission_bundles(workspace_id, id)
    on delete cascade
);

create table public.member_permission_bundles (
  workspace_id uuid not null,
  user_id uuid not null,
  bundle_id uuid not null,
  assigned_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id, bundle_id),
  foreign key (workspace_id, user_id)
    references public.workspace_members(workspace_id, user_id)
    on delete cascade,
  foreign key (workspace_id, bundle_id)
    references public.permission_bundles(workspace_id, id)
    on delete cascade
);

create table public.access_grants (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  user_id uuid not null,
  capability_key text not null references public.capabilities(capability_key) on delete restrict,
  effect text not null default 'allow' check (effect in ('allow', 'deny')),
  scope_type text not null default 'workspace' check (scope_type ~ '^[a-z][a-z0-9_]{1,63}$'),
  scope_id uuid,
  granted_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (workspace_id, user_id)
    references public.workspace_members(workspace_id, user_id)
    on delete cascade,
  unique nulls not distinct (workspace_id, user_id, capability_key, effect, scope_type, scope_id)
);

create index organisation_modules_status_idx
  on public.organisation_modules(workspace_id, status);
create index capabilities_module_idx
  on public.capabilities(module_key);
create index permission_bundles_workspace_idx
  on public.permission_bundles(workspace_id);
create index permission_bundle_capabilities_workspace_idx
  on public.permission_bundle_capabilities(workspace_id, capability_key);
create index member_permission_bundles_user_idx
  on public.member_permission_bundles(user_id, workspace_id);
create index access_grants_user_idx
  on public.access_grants(user_id, workspace_id, capability_key);
create index access_grants_expiry_idx
  on public.access_grants(expires_at)
  where expires_at is not null;

create trigger organisation_modules_set_updated_at
before update on public.organisation_modules
for each row execute function private.set_updated_at();

create trigger permission_bundles_set_updated_at
before update on public.permission_bundles
for each row execute function private.set_updated_at();

create trigger access_grants_set_updated_at
before update on public.access_grants
for each row execute function private.set_updated_at();

insert into public.capabilities (capability_key, module_key, description, risk_level)
values
  ('command.read', 'command', 'View founder command signals and organisation summaries.', 'green'),
  ('growth.read', 'growth', 'View leads and growth records.', 'green'),
  ('growth.manage', 'growth', 'Create and update leads and growth workflows.', 'amber'),
  ('delivery.read', 'delivery', 'View clients, projects, tasks, and delivery state.', 'green'),
  ('delivery.manage', 'delivery', 'Create and update clients, projects, and delivery records.', 'amber'),
  ('finance.read', 'finance', 'View invoices and cash state.', 'amber'),
  ('finance.manage', 'finance', 'Create and update invoices and payment state.', 'red'),
  ('evidence.read', 'evidence', 'View proof and evidence records.', 'green'),
  ('evidence.manage', 'evidence', 'Create, approve, and publish proof records.', 'amber'),
  ('publishing.read', 'publishing', 'View content drafts and publishing state.', 'green'),
  ('publishing.manage', 'publishing', 'Create, approve, and publish content drafts.', 'amber'),
  ('organisation.read', 'organisation', 'View organisation membership, modules, and access configuration.', 'green'),
  ('organisation.manage_members', 'organisation', 'Invite, update, and remove organisation members.', 'red'),
  ('organisation.manage_access', 'organisation', 'Manage permission bundles and capability grants.', 'red'),
  ('foundry.learn', 'foundry', 'Access assigned learning and submit Foundry work.', 'green'),
  ('foundry.review', 'foundry', 'Review submissions and provide learner feedback.', 'amber'),
  ('foundry.manage', 'foundry', 'Manage Foundry applications, enrolments, courses, cohorts, and assessments.', 'red'),
  ('studio.read_assigned', 'studio', 'View only explicitly assigned Studio work.', 'green'),
  ('studio.manage_delivery', 'studio', 'Manage Studio projects and delivery workflows.', 'amber'),
  ('studio.approve_release', 'studio', 'Approve client-facing or production Studio releases.', 'red');

insert into public.organisation_modules (
  workspace_id,
  module_key,
  status,
  config,
  enabled_at,
  enabled_by
)
select
  w.id,
  module.module_key,
  module.status,
  module.config,
  case when module.status in ('enabled', 'pilot') then now() else null end,
  w.owner_id
from public.workspaces w
cross join (
  values
    ('command', 'enabled', '{}'::jsonb),
    ('growth', 'enabled', '{}'::jsonb),
    ('delivery', 'enabled', '{}'::jsonb),
    ('finance', 'enabled', '{}'::jsonb),
    ('evidence', 'enabled', '{}'::jsonb),
    ('publishing', 'enabled', '{}'::jsonb),
    ('organisation', 'enabled', '{}'::jsonb),
    ('foundry', 'pilot', '{"external_access":false,"production_access":"deny_by_default"}'::jsonb),
    ('studio', 'disabled', '{"assignment_required":true}'::jsonb)
) as module(module_key, status, config)
on conflict (workspace_id, module_key) do nothing;

insert into public.permission_bundles (
  workspace_id,
  bundle_key,
  name,
  description,
  system_managed,
  created_by
)
select w.id, seed.bundle_key, seed.name, seed.description, true, w.owner_id
from public.workspaces w
cross join (
  values
    ('founder_administrator', 'Founder Administrator', 'Full founder authority across the organisation.'),
    ('operator', 'Operator', 'Operational access to growth, delivery, evidence, and publishing.'),
    ('foundry_learner', 'Foundry Learner', 'Learning access only; no Studio or organisation administration.'),
    ('foundry_mentor', 'Foundry Mentor', 'Foundry teaching and review access without organisation administration.')
) as seed(bundle_key, name, description)
on conflict (workspace_id, bundle_key) do nothing;

insert into public.permission_bundle_capabilities (workspace_id, bundle_id, capability_key)
select pb.workspace_id, pb.id, c.capability_key
from public.permission_bundles pb
join public.capabilities c on true
where pb.bundle_key = 'founder_administrator'
on conflict do nothing;

insert into public.permission_bundle_capabilities (workspace_id, bundle_id, capability_key)
select pb.workspace_id, pb.id, capability.capability_key
from public.permission_bundles pb
cross join (
  values
    ('command.read'),
    ('growth.read'),
    ('growth.manage'),
    ('delivery.read'),
    ('delivery.manage'),
    ('finance.read'),
    ('evidence.read'),
    ('evidence.manage'),
    ('publishing.read'),
    ('publishing.manage'),
    ('organisation.read')
) as capability(capability_key)
where pb.bundle_key = 'operator'
on conflict do nothing;

insert into public.permission_bundle_capabilities (workspace_id, bundle_id, capability_key)
select pb.workspace_id, pb.id, capability.capability_key
from public.permission_bundles pb
cross join (values ('foundry.learn')) as capability(capability_key)
where pb.bundle_key = 'foundry_learner'
on conflict do nothing;

insert into public.permission_bundle_capabilities (workspace_id, bundle_id, capability_key)
select pb.workspace_id, pb.id, capability.capability_key
from public.permission_bundles pb
cross join (
  values ('foundry.learn'), ('foundry.review')
) as capability(capability_key)
where pb.bundle_key = 'foundry_mentor'
on conflict do nothing;

insert into public.member_permission_bundles (workspace_id, user_id, bundle_id, assigned_by)
select wm.workspace_id, wm.user_id, pb.id, w.owner_id
from public.workspace_members wm
join public.workspaces w on w.id = wm.workspace_id
join public.permission_bundles pb
  on pb.workspace_id = wm.workspace_id
 and pb.bundle_key = case when wm.role in ('owner', 'admin') then 'founder_administrator' else 'operator' end
on conflict do nothing;

create or replace function private.has_capability(
  target_workspace_id uuid,
  target_capability_key text,
  target_scope_type text default 'workspace',
  target_scope_id uuid default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then
    return false;
  end if;

  if not exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = current_user_id
  ) then
    return false;
  end if;

  if exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = current_user_id
      and wm.role in ('owner', 'admin')
  ) then
    return true;
  end if;

  if exists (
    select 1
    from public.access_grants ag
    where ag.workspace_id = target_workspace_id
      and ag.user_id = current_user_id
      and ag.capability_key = target_capability_key
      and ag.effect = 'deny'
      and (ag.expires_at is null or ag.expires_at > now())
      and (
        ag.scope_type = 'workspace'
        or (
          ag.scope_type = target_scope_type
          and ag.scope_id is not distinct from target_scope_id
        )
      )
  ) then
    return false;
  end if;

  return exists (
    select 1
    from public.access_grants ag
    where ag.workspace_id = target_workspace_id
      and ag.user_id = current_user_id
      and ag.capability_key = target_capability_key
      and ag.effect = 'allow'
      and (ag.expires_at is null or ag.expires_at > now())
      and (
        ag.scope_type = 'workspace'
        or (
          ag.scope_type = target_scope_type
          and ag.scope_id is not distinct from target_scope_id
        )
      )
  ) or exists (
    select 1
    from public.member_permission_bundles mpb
    join public.permission_bundle_capabilities pbc
      on pbc.workspace_id = mpb.workspace_id
     and pbc.bundle_id = mpb.bundle_id
    where mpb.workspace_id = target_workspace_id
      and mpb.user_id = current_user_id
      and pbc.capability_key = target_capability_key
  );
end;
$$;

revoke all on function private.has_capability(uuid, text, text, uuid) from public, anon;
grant execute on function private.has_capability(uuid, text, text, uuid) to authenticated;

create or replace function private.bootstrap_organisation_access()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.organisation_modules (
    workspace_id,
    module_key,
    status,
    config,
    enabled_at,
    enabled_by
  )
  values
    (new.id, 'command', 'enabled', '{}'::jsonb, now(), new.owner_id),
    (new.id, 'growth', 'enabled', '{}'::jsonb, now(), new.owner_id),
    (new.id, 'delivery', 'enabled', '{}'::jsonb, now(), new.owner_id),
    (new.id, 'finance', 'enabled', '{}'::jsonb, now(), new.owner_id),
    (new.id, 'evidence', 'enabled', '{}'::jsonb, now(), new.owner_id),
    (new.id, 'publishing', 'enabled', '{}'::jsonb, now(), new.owner_id),
    (new.id, 'organisation', 'enabled', '{}'::jsonb, now(), new.owner_id),
    (new.id, 'foundry', 'disabled', '{"external_access":false}'::jsonb, null, null),
    (new.id, 'studio', 'disabled', '{"assignment_required":true}'::jsonb, null, null)
  on conflict do nothing;

  insert into public.permission_bundles (
    workspace_id,
    bundle_key,
    name,
    description,
    system_managed,
    created_by
  )
  values
    (new.id, 'founder_administrator', 'Founder Administrator', 'Full founder authority across the organisation.', true, new.owner_id),
    (new.id, 'operator', 'Operator', 'Operational access to growth, delivery, evidence, and publishing.', true, new.owner_id),
    (new.id, 'foundry_learner', 'Foundry Learner', 'Learning access only; no Studio or organisation administration.', true, new.owner_id),
    (new.id, 'foundry_mentor', 'Foundry Mentor', 'Foundry teaching and review access without organisation administration.', true, new.owner_id)
  on conflict do nothing;

  insert into public.permission_bundle_capabilities (workspace_id, bundle_id, capability_key)
  select pb.workspace_id, pb.id, c.capability_key
  from public.permission_bundles pb
  join public.capabilities c on true
  where pb.workspace_id = new.id
    and pb.bundle_key = 'founder_administrator'
  on conflict do nothing;

  insert into public.permission_bundle_capabilities (workspace_id, bundle_id, capability_key)
  select pb.workspace_id, pb.id, capability.capability_key
  from public.permission_bundles pb
  cross join (
    values
      ('command.read'),
      ('growth.read'),
      ('growth.manage'),
      ('delivery.read'),
      ('delivery.manage'),
      ('finance.read'),
      ('evidence.read'),
      ('evidence.manage'),
      ('publishing.read'),
      ('publishing.manage'),
      ('organisation.read')
  ) as capability(capability_key)
  where pb.workspace_id = new.id
    and pb.bundle_key = 'operator'
  on conflict do nothing;

  insert into public.permission_bundle_capabilities (workspace_id, bundle_id, capability_key)
  select pb.workspace_id, pb.id, capability.capability_key
  from public.permission_bundles pb
  cross join (values ('foundry.learn')) as capability(capability_key)
  where pb.workspace_id = new.id
    and pb.bundle_key = 'foundry_learner'
  on conflict do nothing;

  insert into public.permission_bundle_capabilities (workspace_id, bundle_id, capability_key)
  select pb.workspace_id, pb.id, capability.capability_key
  from public.permission_bundles pb
  cross join (values ('foundry.learn'), ('foundry.review')) as capability(capability_key)
  where pb.workspace_id = new.id
    and pb.bundle_key = 'foundry_mentor'
  on conflict do nothing;

  return new;
end;
$$;

revoke all on function private.bootstrap_organisation_access() from public, anon, authenticated;

create trigger workspaces_bootstrap_organisation_access
after insert on public.workspaces
for each row execute function private.bootstrap_organisation_access();

create or replace function private.sync_member_permission_bundle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_bundle_key text;
  target_bundle_id uuid;
begin
  target_bundle_key := case when new.role in ('owner', 'admin') then 'founder_administrator' else 'operator' end;

  select pb.id into target_bundle_id
  from public.permission_bundles pb
  where pb.workspace_id = new.workspace_id
    and pb.bundle_key = target_bundle_key;

  if target_bundle_id is not null then
    if tg_op = 'UPDATE' and old.role is distinct from new.role then
      delete from public.member_permission_bundles mpb
      using public.permission_bundles pb
      where mpb.workspace_id = new.workspace_id
        and mpb.user_id = new.user_id
        and mpb.bundle_id = pb.id
        and pb.workspace_id = new.workspace_id
        and pb.bundle_key in ('founder_administrator', 'operator');
    end if;

    insert into public.member_permission_bundles (
      workspace_id,
      user_id,
      bundle_id,
      assigned_by
    )
    values (new.workspace_id, new.user_id, target_bundle_id, (select auth.uid()))
    on conflict do nothing;
  end if;

  return new;
end;
$$;

revoke all on function private.sync_member_permission_bundle() from public, anon, authenticated;

create trigger workspace_members_sync_permission_bundle
after insert or update of role on public.workspace_members
for each row execute function private.sync_member_permission_bundle();

alter table public.organisation_modules enable row level security;
alter table public.capabilities enable row level security;
alter table public.permission_bundles enable row level security;
alter table public.permission_bundle_capabilities enable row level security;
alter table public.member_permission_bundles enable row level security;
alter table public.access_grants enable row level security;

grant select, insert, update, delete on public.organisation_modules to authenticated;
grant select on public.capabilities to authenticated;
grant select, insert, update, delete on public.permission_bundles to authenticated;
grant select, insert, update, delete on public.permission_bundle_capabilities to authenticated;
grant select, insert, update, delete on public.member_permission_bundles to authenticated;
grant select, insert, update, delete on public.access_grants to authenticated;

create policy organisation_modules_select_member
on public.organisation_modules for select
to authenticated
using ((select private.is_workspace_member(workspace_id)));

create policy organisation_modules_insert_admin
on public.organisation_modules for insert
to authenticated
with check ((select private.is_workspace_admin(workspace_id)));

create policy organisation_modules_update_admin
on public.organisation_modules for update
to authenticated
using ((select private.is_workspace_admin(workspace_id)))
with check ((select private.is_workspace_admin(workspace_id)));

create policy organisation_modules_delete_admin
on public.organisation_modules for delete
to authenticated
using ((select private.is_workspace_admin(workspace_id)));

create policy capabilities_select_authenticated
on public.capabilities for select
to authenticated
using (true);

create policy permission_bundles_select_member
on public.permission_bundles for select
to authenticated
using ((select private.is_workspace_member(workspace_id)));

create policy permission_bundles_insert_admin
on public.permission_bundles for insert
to authenticated
with check ((select private.is_workspace_admin(workspace_id)));

create policy permission_bundles_update_admin
on public.permission_bundles for update
to authenticated
using ((select private.is_workspace_admin(workspace_id)))
with check ((select private.is_workspace_admin(workspace_id)));

create policy permission_bundles_delete_admin
on public.permission_bundles for delete
to authenticated
using ((select private.is_workspace_admin(workspace_id)) and not system_managed);

create policy permission_bundle_capabilities_select_member
on public.permission_bundle_capabilities for select
to authenticated
using ((select private.is_workspace_member(workspace_id)));

create policy permission_bundle_capabilities_insert_admin
on public.permission_bundle_capabilities for insert
to authenticated
with check ((select private.is_workspace_admin(workspace_id)));

create policy permission_bundle_capabilities_delete_admin
on public.permission_bundle_capabilities for delete
to authenticated
using ((select private.is_workspace_admin(workspace_id)));

create policy member_permission_bundles_select_self_or_admin
on public.member_permission_bundles for select
to authenticated
using (
  user_id = (select auth.uid())
  or (select private.is_workspace_admin(workspace_id))
);

create policy member_permission_bundles_insert_admin
on public.member_permission_bundles for insert
to authenticated
with check ((select private.is_workspace_admin(workspace_id)));

create policy member_permission_bundles_delete_admin
on public.member_permission_bundles for delete
to authenticated
using ((select private.is_workspace_admin(workspace_id)));

create policy access_grants_select_self_or_admin
on public.access_grants for select
to authenticated
using (
  user_id = (select auth.uid())
  or (select private.is_workspace_admin(workspace_id))
);

create policy access_grants_insert_admin
on public.access_grants for insert
to authenticated
with check ((select private.is_workspace_admin(workspace_id)));

create policy access_grants_update_admin
on public.access_grants for update
to authenticated
using ((select private.is_workspace_admin(workspace_id)))
with check ((select private.is_workspace_admin(workspace_id)));

create policy access_grants_delete_admin
on public.access_grants for delete
to authenticated
using ((select private.is_workspace_admin(workspace_id)));

create or replace function private.capture_access_audit_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  payload jsonb;
  record_workspace_id uuid;
  record_id uuid;
begin
  payload := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  record_workspace_id := nullif(payload ->> 'workspace_id', '')::uuid;
  record_id := nullif(payload ->> 'id', '')::uuid;

  if record_workspace_id is null then
    return case when tg_op = 'DELETE' then old else new end;
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
    (select auth.uid()),
    lower(tg_op),
    tg_table_name,
    record_id,
    jsonb_strip_nulls(jsonb_build_object(
      'occurred_at', now(),
      'module_key', payload ->> 'module_key',
      'bundle_id', payload ->> 'bundle_id',
      'capability_key', payload ->> 'capability_key',
      'target_user_id', payload ->> 'user_id',
      'effect', payload ->> 'effect'
    ))
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function private.capture_access_audit_event() from public, anon, authenticated;

create trigger organisation_modules_audit
after insert or update or delete on public.organisation_modules
for each row execute function private.capture_access_audit_event();

create trigger permission_bundles_audit
after insert or update or delete on public.permission_bundles
for each row execute function private.capture_access_audit_event();

create trigger permission_bundle_capabilities_audit
after insert or delete on public.permission_bundle_capabilities
for each row execute function private.capture_access_audit_event();

create trigger member_permission_bundles_audit
after insert or delete on public.member_permission_bundles
for each row execute function private.capture_access_audit_event();

create trigger access_grants_audit
after insert or update or delete on public.access_grants
for each row execute function private.capture_access_audit_event();
