-- MANUAL ROLLBACK ONLY. This directory is not part of the forward migration chain.
-- Captured from Orbit Production immediately before the invitation cutover.
-- Goal: disable new invitation authority changes and restore the exact prior
-- claim_orbit_access behavior without deleting invitation/audit history.

begin;

revoke execute on function public.create_foundry_invitation(uuid, integer) from authenticated;
revoke execute on function public.inspect_orbit_invitation(text) from anon, authenticated;
revoke execute on function public.accept_orbit_invitation(text) from authenticated;
revoke execute on function public.revoke_orbit_invitation(uuid) from authenticated;

create or replace function private.claim_orbit_access()
returns table(
  account_role text,
  membership_role text,
  workspace_id uuid,
  workspace_name text,
  workspace_slug text,
  student_id uuid,
  foundry_id text
)
language plpgsql
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
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select lower(btrim(au.email)), au.email_confirmed_at
  into current_email, current_email_confirmed_at
  from auth.users au
  where au.id = current_user_id;

  select fs.*
  into linked_student
  from public.foundry_students fs
  where fs.auth_user_id = current_user_id
    and fs.lifecycle_status not in ('inactive', 'graduated', 'rejected')
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
      and fs.lifecycle_status not in ('inactive', 'graduated', 'rejected')
      and lower(btrim(fs.email)) = current_email;

    if candidate_count = 1 then
      select fs.id
      into candidate_id
      from public.foundry_students fs
      where fs.auth_user_id is null
        and fs.lifecycle_status not in ('inactive', 'graduated', 'rejected')
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
          and fs.lifecycle_status not in ('inactive', 'graduated', 'rejected')
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

commit;
