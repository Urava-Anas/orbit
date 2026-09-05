-- Orbit Access v1: explicit, signed invitation boundary for Foundry -> Orbit.
-- Raw invitation tokens are never persisted. Existing linked students remain valid;
-- implicit email-based student claiming is removed.

create table if not exists public.orbit_invitations (
  id uuid primary key default extensions.gen_random_uuid(),
  token_hash text not null unique,
  kind text not null default 'foundry_student'
    check (kind in ('foundry_student')),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  foundry_student_id uuid not null references public.foundry_students(id) on delete cascade,
  email_normalized text not null
    check (email_normalized = lower(btrim(email_normalized)) and char_length(email_normalized) between 3 and 254),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid,
  revoked_at timestamptz,
  revoked_by uuid,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  constraint orbit_invitations_acceptance_pair_check check (
    (accepted_at is null and accepted_by is null)
    or (accepted_at is not null and accepted_by is not null)
  ),
  constraint orbit_invitations_revocation_pair_check check (
    (revoked_at is null and revoked_by is null)
    or (revoked_at is not null and revoked_by is not null)
  ),
  constraint orbit_invitations_terminal_state_check check (
    not (accepted_at is not null and revoked_at is not null)
  ),
  constraint orbit_invitations_expiry_check check (expires_at > created_at)
);

create index if not exists orbit_invitations_student_idx
  on public.orbit_invitations(foundry_student_id, created_at desc);
create index if not exists orbit_invitations_workspace_idx
  on public.orbit_invitations(workspace_id, created_at desc);

alter table public.orbit_invitations enable row level security;
revoke all on table public.orbit_invitations from public, anon, authenticated;

create or replace function private.orbit_invitation_hash(invitation_token text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(
    extensions.digest(convert_to(invitation_token, 'UTF8'), 'sha256'),
    'hex'
  );
$$;

revoke all on function private.orbit_invitation_hash(text) from public, anon, authenticated;

create or replace function private.orbit_mask_email(raw_email text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when raw_email is null or position('@' in raw_email) = 0 then '***'
    else left(raw_email, 1) || '***@' || split_part(raw_email, '@', 2)
  end;
$$;

revoke all on function private.orbit_mask_email(text) from public, anon, authenticated;

create or replace function public.create_foundry_invitation(
  target_student_id uuid,
  expires_in_hours integer default 168
)
returns table (
  invitation_id uuid,
  invitation_token text,
  invitation_expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  target_student public.foundry_students%rowtype;
  raw_token text;
  token_digest text;
  created_invitation public.orbit_invitations%rowtype;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if expires_in_hours is null or expires_in_hours < 1 or expires_in_hours > 720 then
    raise exception 'Invitation expiry must be between 1 and 720 hours' using errcode = '22023';
  end if;

  select fs.*
  into target_student
  from public.foundry_students fs
  where fs.id = target_student_id
  for update;

  if target_student.id is null then
    raise exception 'Foundry student not found' using errcode = 'P0002';
  end if;

  if not private.is_workspace_admin(target_student.workspace_id) then
    raise exception 'Workspace admin access required' using errcode = '42501';
  end if;

  if target_student.lifecycle_status not in ('accepted', 'enrolled') then
    raise exception 'Only accepted or enrolled Foundry students can be invited' using errcode = '23514';
  end if;

  if target_student.auth_user_id is not null then
    raise exception 'This student already has Orbit access' using errcode = '23505';
  end if;

  if target_student.email is null or btrim(target_student.email) = '' then
    raise exception 'Student email is required before invitation' using errcode = '23502';
  end if;

  -- Only one usable invitation is kept for a student. Historical accepted invites remain immutable.
  update public.orbit_invitations oi
  set revoked_at = now(), revoked_by = current_user_id
  where oi.foundry_student_id = target_student.id
    and oi.accepted_at is null
    and oi.revoked_at is null;

  raw_token := replace(
    translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'),
    '=',
    ''
  );
  token_digest := private.orbit_invitation_hash(raw_token);

  insert into public.orbit_invitations (
    token_hash,
    kind,
    workspace_id,
    foundry_student_id,
    email_normalized,
    expires_at,
    created_by
  )
  values (
    token_digest,
    'foundry_student',
    target_student.workspace_id,
    target_student.id,
    lower(btrim(target_student.email)),
    now() + make_interval(hours => expires_in_hours),
    current_user_id
  )
  returning * into created_invitation;

  insert into public.audit_events (
    workspace_id,
    actor_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    target_student.workspace_id,
    current_user_id,
    'orbit.invitation.created',
    'orbit_invitation',
    created_invitation.id,
    jsonb_build_object(
      'kind', created_invitation.kind,
      'foundry_student_id', target_student.id,
      'expires_at', created_invitation.expires_at
    )
  );

  return query
  select created_invitation.id, raw_token, created_invitation.expires_at;
end;
$$;

revoke all on function public.create_foundry_invitation(uuid, integer) from public, anon;
grant execute on function public.create_foundry_invitation(uuid, integer) to authenticated;

create or replace function public.inspect_orbit_invitation(invitation_token text)
returns table (
  invitation_status text,
  invitation_kind text,
  workspace_name text,
  invited_email_hint text,
  invitation_expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation_row public.orbit_invitations%rowtype;
  resolved_workspace_name text;
begin
  if invitation_token is null
    or char_length(invitation_token) < 32
    or char_length(invitation_token) > 128
  then
    return query select 'invalid'::text, null::text, null::text, null::text, null::timestamptz;
    return;
  end if;

  select oi.*
  into invitation_row
  from public.orbit_invitations oi
  where oi.token_hash = private.orbit_invitation_hash(invitation_token)
  limit 1;

  if invitation_row.id is null then
    return query select 'invalid'::text, null::text, null::text, null::text, null::timestamptz;
    return;
  end if;

  select w.name
  into resolved_workspace_name
  from public.workspaces w
  where w.id = invitation_row.workspace_id;

  return query
  select
    case
      when invitation_row.accepted_at is not null then 'accepted'
      when invitation_row.revoked_at is not null then 'revoked'
      when invitation_row.expires_at <= now() then 'expired'
      else 'valid'
    end::text,
    invitation_row.kind,
    resolved_workspace_name,
    private.orbit_mask_email(invitation_row.email_normalized),
    invitation_row.expires_at;
end;
$$;

revoke all on function public.inspect_orbit_invitation(text) from public;
grant execute on function public.inspect_orbit_invitation(text) to anon, authenticated;

create or replace function public.accept_orbit_invitation(invitation_token text)
returns table (
  acceptance_status text,
  accepted_workspace_id uuid,
  accepted_student_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  current_email text;
  current_email_confirmed_at timestamptz;
  invitation_row public.orbit_invitations%rowtype;
  target_student public.foundry_students%rowtype;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select lower(btrim(au.email)), au.email_confirmed_at
  into current_email, current_email_confirmed_at
  from auth.users au
  where au.id = current_user_id;

  if current_email is null or current_email_confirmed_at is null then
    raise exception 'A verified email is required to accept this invitation' using errcode = '42501';
  end if;

  if invitation_token is null
    or char_length(invitation_token) < 32
    or char_length(invitation_token) > 128
  then
    raise exception 'Invitation is invalid or unavailable' using errcode = '22023';
  end if;

  select oi.*
  into invitation_row
  from public.orbit_invitations oi
  where oi.token_hash = private.orbit_invitation_hash(invitation_token)
  for update;

  if invitation_row.id is null then
    raise exception 'Invitation is invalid or unavailable' using errcode = 'P0002';
  end if;

  if invitation_row.accepted_at is not null then
    if invitation_row.accepted_by = current_user_id then
      return query
      select 'already_accepted'::text, invitation_row.workspace_id, invitation_row.foundry_student_id;
      return;
    end if;
    raise exception 'Invitation is invalid or unavailable' using errcode = '42501';
  end if;

  if invitation_row.revoked_at is not null or invitation_row.expires_at <= now() then
    raise exception 'Invitation is expired or unavailable' using errcode = '42501';
  end if;

  if current_email <> invitation_row.email_normalized then
    raise exception 'Sign in with the email address that received this invitation' using errcode = '42501';
  end if;

  select fs.*
  into target_student
  from public.foundry_students fs
  where fs.id = invitation_row.foundry_student_id
    and fs.workspace_id = invitation_row.workspace_id
  for update;

  if target_student.id is null
    or target_student.lifecycle_status in ('inactive', 'graduated', 'rejected')
  then
    raise exception 'Invitation is no longer available' using errcode = '42501';
  end if;

  if target_student.auth_user_id is not null and target_student.auth_user_id <> current_user_id then
    raise exception 'Invitation is no longer available' using errcode = '42501';
  end if;

  if target_student.auth_user_id is null then
    update public.foundry_students fs
    set auth_user_id = current_user_id,
        updated_at = now()
    where fs.id = target_student.id
      and fs.auth_user_id is null;
  end if;

  update public.orbit_invitations oi
  set accepted_at = now(), accepted_by = current_user_id
  where oi.id = invitation_row.id
    and oi.accepted_at is null
    and oi.revoked_at is null
  returning oi.* into invitation_row;

  insert into public.audit_events (
    workspace_id,
    actor_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    invitation_row.workspace_id,
    current_user_id,
    'orbit.invitation.accepted',
    'orbit_invitation',
    invitation_row.id,
    jsonb_build_object(
      'kind', invitation_row.kind,
      'foundry_student_id', invitation_row.foundry_student_id
    )
  );

  return query
  select 'accepted'::text, invitation_row.workspace_id, invitation_row.foundry_student_id;
end;
$$;

revoke all on function public.accept_orbit_invitation(text) from public, anon;
grant execute on function public.accept_orbit_invitation(text) to authenticated;

create or replace function public.revoke_orbit_invitation(target_invitation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  invitation_row public.orbit_invitations%rowtype;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select oi.*
  into invitation_row
  from public.orbit_invitations oi
  where oi.id = target_invitation_id
  for update;

  if invitation_row.id is null then
    return false;
  end if;

  if not private.is_workspace_admin(invitation_row.workspace_id) then
    raise exception 'Workspace admin access required' using errcode = '42501';
  end if;

  if invitation_row.accepted_at is not null then
    raise exception 'Accepted invitations cannot be revoked' using errcode = '23514';
  end if;

  if invitation_row.revoked_at is null then
    update public.orbit_invitations
    set revoked_at = now(), revoked_by = current_user_id
    where id = invitation_row.id;

    insert into public.audit_events (
      workspace_id,
      actor_id,
      action,
      entity_type,
      entity_id,
      metadata
    )
    values (
      invitation_row.workspace_id,
      current_user_id,
      'orbit.invitation.revoked',
      'orbit_invitation',
      invitation_row.id,
      jsonb_build_object('kind', invitation_row.kind)
    );
  end if;

  return true;
end;
$$;

revoke all on function public.revoke_orbit_invitation(uuid) from public, anon;
grant execute on function public.revoke_orbit_invitation(uuid) to authenticated;

-- Explicit access only: remove the historical email-match auto-claim path.
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
  linked_student public.foundry_students%rowtype;
  founder_membership public.workspace_members%rowtype;
  resolved_workspace public.workspaces%rowtype;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select fs.*
  into linked_student
  from public.foundry_students fs
  where fs.auth_user_id = current_user_id
    and fs.lifecycle_status not in ('inactive', 'graduated', 'rejected')
  order by fs.created_at
  limit 1;

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
