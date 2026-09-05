-- Harden the first Orbit invitation implementation before release.
-- Keep inspection minimal and prevent the current single-role access resolver from
-- converting an existing founder/admin/student identity into another role.

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
  founder_workspace_id uuid;
  existing_student_id uuid;
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

  -- Orbit Access v1 resolves one primary role. Do not let invitation acceptance
  -- silently replace an existing founder/admin route or bind one identity to a
  -- second Foundry student record.
  select wm.workspace_id
  into founder_workspace_id
  from public.workspace_members wm
  where wm.user_id = current_user_id
    and wm.role in ('owner', 'admin')
  order by wm.created_at
  limit 1;

  if founder_workspace_id is not null then
    raise exception 'Use a non-founder Orbit account to accept this Foundry invitation' using errcode = '42501';
  end if;

  select fs.id
  into existing_student_id
  from public.foundry_students fs
  where fs.auth_user_id = current_user_id
    and fs.id <> invitation_row.foundry_student_id
    and fs.lifecycle_status not in ('inactive', 'graduated', 'rejected')
  order by fs.created_at
  limit 1;

  if existing_student_id is not null then
    raise exception 'This Orbit account already belongs to a Foundry learner' using errcode = '42501';
  end if;

  select fs.*
  into target_student
  from public.foundry_students fs
  where fs.id = invitation_row.foundry_student_id
    and fs.workspace_id = invitation_row.workspace_id
  for update;

  if target_student.id is null
    or target_student.lifecycle_status not in ('accepted', 'enrolled')
    or target_student.email is null
    or lower(btrim(target_student.email)) <> invitation_row.email_normalized
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
