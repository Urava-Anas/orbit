-- Orbit has one authenticated entrance and resolves access from server-owned
-- records. A Foundry student is deliberately not a workspace member: membership
-- would expose organisation tables that are unrelated to learning.

create unique index if not exists foundry_students_auth_user_unique_idx
  on public.foundry_students(auth_user_id)
  where auth_user_id is not null;

create unique index if not exists foundry_students_normalized_email_unique_idx
  on public.foundry_students(lower(btrim(email)))
  where email is not null
    and lifecycle_status <> 'rejected';

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

  -- A linked learner receives only the Foundry learning capability. They do not
  -- become a workspace member and therefore cannot read founder operations.
  if target_capability_key = 'foundry.learn'
    and exists (
      select 1
      from public.foundry_students fs
      where fs.workspace_id = target_workspace_id
        and fs.auth_user_id = current_user_id
        and fs.lifecycle_status <> 'rejected'
    )
  then
    return true;
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

revoke all on function private.has_capability(uuid, text, text, uuid)
  from public, anon;
grant execute on function private.has_capability(uuid, text, text, uuid)
  to authenticated;

-- A new Google identity is not automatically an organisation owner. Founder
-- workspaces are provisioned intentionally; students claim an existing Foundry
-- record after their verified email matches exactly.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'name'), '')
    )
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke all on function private.handle_new_user()
  from public, anon, authenticated;
grant execute on function private.handle_new_user()
  to supabase_auth_admin;

create or replace function public.claim_orbit_access()
returns table (
  account_role text,
  membership_role text,
  workspace_id uuid,
  workspace_name text,
  workspace_slug text,
  student_id uuid,
  foundry_id text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  current_email text;
  current_email_confirmed_at timestamptz;
  linked_student public.foundry_students%rowtype;
  candidate_id uuid;
  candidate_count integer := 0;
  founder_membership public.workspace_members%rowtype;
  resolved_workspace public.workspaces%rowtype;
begin
  if current_user_id is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;

  select lower(btrim(au.email)), au.email_confirmed_at
  into current_email, current_email_confirmed_at
  from auth.users au
  where au.id = current_user_id;

  select fs.*
  into linked_student
  from public.foundry_students fs
  where fs.auth_user_id = current_user_id
    and fs.lifecycle_status <> 'rejected'
  order by fs.created_at
  limit 1;

  if linked_student.id is null
    and current_email is not null
    and current_email_confirmed_at is not null
  then
    select count(*)::integer
    into candidate_count
    from public.foundry_students fs
    where fs.auth_user_id is null
      and fs.lifecycle_status <> 'rejected'
      and lower(btrim(fs.email)) = current_email;

    if candidate_count = 1 then
      select fs.id
      into candidate_id
      from public.foundry_students fs
      where fs.auth_user_id is null
        and fs.lifecycle_status <> 'rejected'
        and lower(btrim(fs.email)) = current_email
      limit 1;

      update public.foundry_students fs
      set auth_user_id = current_user_id
      where fs.id = candidate_id
        and fs.auth_user_id is null
      returning fs.* into linked_student;

      if linked_student.id is null then
        select fs.*
        into linked_student
        from public.foundry_students fs
        where fs.auth_user_id = current_user_id
          and fs.lifecycle_status <> 'rejected'
        order by fs.created_at
        limit 1;
      end if;
    end if;
  end if;

  if linked_student.id is not null then
    select wm.*
    into founder_membership
    from public.workspace_members wm
    where wm.workspace_id = linked_student.workspace_id
      and wm.user_id = current_user_id
      and wm.role in ('owner', 'admin')
    order by wm.created_at
    limit 1;

    select w.*
    into resolved_workspace
    from public.workspaces w
    where w.id = linked_student.workspace_id;

    if founder_membership.workspace_id is not null then
      return query
      select
        'founder'::text,
        founder_membership.role::text,
        resolved_workspace.id,
        resolved_workspace.name,
        resolved_workspace.slug,
        linked_student.id,
        linked_student.foundry_id;
      return;
    end if;

    return query
    select
      'student'::text,
      null::text,
      resolved_workspace.id,
      resolved_workspace.name,
      resolved_workspace.slug,
      linked_student.id,
      linked_student.foundry_id;
    return;
  end if;

  select wm.*
  into founder_membership
  from public.workspace_members wm
  where wm.user_id = current_user_id
    and wm.role in ('owner', 'admin')
  order by wm.created_at
  limit 1;

  if founder_membership.workspace_id is not null then
    select w.*
    into resolved_workspace
    from public.workspaces w
    where w.id = founder_membership.workspace_id;

    return query
    select
      'founder'::text,
      founder_membership.role::text,
      resolved_workspace.id,
      resolved_workspace.name,
      resolved_workspace.slug,
      null::uuid,
      null::text;
    return;
  end if;

  return query
  select
    'pending'::text,
    null::text,
    null::uuid,
    null::text,
    null::text,
    null::uuid,
    null::text;
end;
$$;

revoke all on function public.claim_orbit_access()
  from public, anon, authenticated;
grant execute on function public.claim_orbit_access()
  to authenticated;

comment on function public.claim_orbit_access() is
  'Resolves Founder, Student, or Pending access from the authenticated identity and safely claims one exact verified-email Foundry record.';

-- Postgres Changes is intentionally scoped to the small Foundry cohort. RLS is
-- still applied to every subscriber, so students receive only their own rows.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'foundry_students',
    'foundry_classes',
    'foundry_attendance',
    'foundry_tasks',
    'foundry_task_assignments',
    'foundry_submissions',
    'foundry_progress_events',
    'foundry_skill_scores'
  ]
  loop
    if not exists (
      select 1
      from pg_catalog.pg_publication_tables ppt
      where ppt.pubname = 'supabase_realtime'
        and ppt.schemaname = 'public'
        and ppt.tablename = table_name
    ) then
      execute format(
        'alter publication supabase_realtime add table public.%I',
        table_name
      );
    end if;
  end loop;
end;
$$;
