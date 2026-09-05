begin;

insert into auth.users (
  id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('95000000-0000-4000-8000-000000000001','authenticated','authenticated','owner@example.test',now(),'{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now()),
  ('95000000-0000-4000-8000-000000000002','authenticated','authenticated','invitee@example.test',now(),'{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now()),
  ('95000000-0000-4000-8000-000000000003','authenticated','authenticated','wrong@example.test',now(),'{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now()),
  ('95000000-0000-4000-8000-000000000004','authenticated','authenticated','founder@example.test',now(),'{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now()),
  ('95000000-0000-4000-8000-000000000005','authenticated','authenticated','existing@example.test',now(),'{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now()),
  ('95000000-0000-4000-8000-000000000006','authenticated','authenticated','revoked@example.test',now(),'{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now()),
  ('95000000-0000-4000-8000-000000000007','authenticated','authenticated','expired@example.test',now(),'{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now());

insert into public.workspaces (id, name, slug, owner_id)
values
  ('96000000-0000-4000-8000-000000000001','Invitation Workspace','invitation-workspace','95000000-0000-4000-8000-000000000001'),
  ('96000000-0000-4000-8000-000000000002','Founder Workspace','founder-workspace','95000000-0000-4000-8000-000000000004');

insert into public.workspace_members(workspace_id,user_id,role)
values
  ('96000000-0000-4000-8000-000000000001','95000000-0000-4000-8000-000000000001','owner'),
  ('96000000-0000-4000-8000-000000000002','95000000-0000-4000-8000-000000000004','owner');

insert into public.foundry_students (
  id, workspace_id, auth_user_id, foundry_id, full_name, email, lifecycle_status, level
)
values
  ('97000000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000001',null,'UFS-INV-001','Invitee Student','invitee@example.test','accepted','accepted'),
  ('97000000-0000-4000-8000-000000000002','96000000-0000-4000-8000-000000000001',null,'UFS-INV-002','New Student','new@example.test','new','applied'),
  ('97000000-0000-4000-8000-000000000003','96000000-0000-4000-8000-000000000001',null,'UFS-INV-003','Founder Invite','founder@example.test','accepted','accepted'),
  ('97000000-0000-4000-8000-000000000004','96000000-0000-4000-8000-000000000001','95000000-0000-4000-8000-000000000005','UFS-INV-004','Existing Learner','existing@example.test','enrolled','explorer'),
  ('97000000-0000-4000-8000-000000000005','96000000-0000-4000-8000-000000000001',null,'UFS-INV-005','Second Learner Record','existing@example.test','accepted','accepted'),
  ('97000000-0000-4000-8000-000000000006','96000000-0000-4000-8000-000000000001',null,'UFS-INV-006','Revoked Invite','revoked@example.test','accepted','accepted'),
  ('97000000-0000-4000-8000-000000000007','96000000-0000-4000-8000-000000000001',null,'UFS-INV-007','Expired Invite','expired@example.test','accepted','accepted');

-- Invitation storage itself is not a client-readable API surface.
do $$
begin
  if has_table_privilege('anon','public.orbit_invitations','select') then
    raise exception 'anon can read invitation storage';
  end if;
  if has_table_privilege('authenticated','public.orbit_invitations','select') then
    raise exception 'authenticated can read invitation storage directly';
  end if;
  if not has_function_privilege('anon','public.inspect_orbit_invitation(text)','execute') then
    raise exception 'anon cannot inspect a minimal invitation snapshot';
  end if;
  if has_function_privilege('anon','public.accept_orbit_invitation(text)','execute') then
    raise exception 'anon can accept invitations';
  end if;
end
$$;

-- A non-admin cannot issue invitations.
select set_config('request.jwt.claim.sub','95000000-0000-4000-8000-000000000003',true);
do $$
begin
  begin
    perform * from public.create_foundry_invitation('97000000-0000-4000-8000-000000000001',24);
    raise exception 'non-admin issued an invitation';
  exception
    when insufficient_privilege then null;
  end;
end
$$;

-- Only accepted/enrolled Foundry students can cross the boundary.
select set_config('request.jwt.claim.sub','95000000-0000-4000-8000-000000000001',true);
do $$
begin
  begin
    perform * from public.create_foundry_invitation('97000000-0000-4000-8000-000000000002',24);
    raise exception 'pre-acceptance student received an Orbit invitation';
  exception
    when check_violation then null;
  end;
end
$$;

create temporary table invitation_case on commit drop as
select * from public.create_foundry_invitation(
  '97000000-0000-4000-8000-000000000001',
  24
);

-- Raw bearer token must never be persisted; only its SHA-256 digest is stored.
do $$
declare
  raw_token text;
  invitation_uuid uuid;
  stored_hash text;
begin
  select invitation_token, invitation_id
  into raw_token, invitation_uuid
  from invitation_case;

  select token_hash into stored_hash
  from public.orbit_invitations
  where id = invitation_uuid;

  if char_length(raw_token) < 32 then
    raise exception 'generated invitation token is too short';
  end if;
  if stored_hash = raw_token then
    raise exception 'raw invitation token was persisted';
  end if;
  if char_length(stored_hash) <> 64 then
    raise exception 'stored invitation digest is not SHA-256 hex';
  end if;
  if exists (select 1 from public.orbit_invitations where token_hash = raw_token) then
    raise exception 'raw invitation token is queryable in storage';
  end if;
end
$$;

-- Public inspection is deliberately minimal and masks the recipient email.
do $$
declare
  raw_token text;
  snapshot record;
begin
  select invitation_token into raw_token from invitation_case;
  select * into snapshot from public.inspect_orbit_invitation(raw_token);
  if snapshot.invitation_status <> 'valid' then
    raise exception 'fresh invitation is not valid';
  end if;
  if snapshot.workspace_name <> 'Invitation Workspace' then
    raise exception 'invitation workspace context is missing';
  end if;
  if snapshot.invited_email_hint = 'invitee@example.test' then
    raise exception 'public inspection leaked full invited email';
  end if;
end
$$;

-- A confirmed matching email alone must no longer claim Foundry identity.
select set_config('request.jwt.claim.sub','95000000-0000-4000-8000-000000000002',true);
do $$
declare
  access_row record;
  linked_user uuid;
begin
  select * into access_row from public.claim_orbit_access();
  if access_row.account_role <> 'pending' then
    raise exception 'matching email implicitly claimed Orbit access';
  end if;
  select auth_user_id into linked_user
  from public.foundry_students
  where id='97000000-0000-4000-8000-000000000001';
  if linked_user is not null then
    raise exception 'matching email mutated Foundry identity before invitation acceptance';
  end if;
end
$$;

-- Unverified accounts cannot accept, even with the correct mailbox address.
update auth.users
set email_confirmed_at = null
where id='95000000-0000-4000-8000-000000000002';
do $$
declare raw_token text;
begin
  select invitation_token into raw_token from invitation_case;
  begin
    perform * from public.accept_orbit_invitation(raw_token);
    raise exception 'unverified email accepted invitation';
  exception
    when insufficient_privilege then null;
  end;
end
$$;
update auth.users
set email_confirmed_at = now()
where id='95000000-0000-4000-8000-000000000002';

-- Wrong verified identity cannot consume someone else's bearer link.
select set_config('request.jwt.claim.sub','95000000-0000-4000-8000-000000000003',true);
do $$
declare raw_token text;
begin
  select invitation_token into raw_token from invitation_case;
  begin
    perform * from public.accept_orbit_invitation(raw_token);
    raise exception 'wrong email accepted invitation';
  exception
    when insufficient_privilege then null;
  end;
end
$$;

-- The invited verified identity can accept exactly once and receives student access.
select set_config('request.jwt.claim.sub','95000000-0000-4000-8000-000000000002',true);
create temporary table accepted_case on commit drop as
select * from public.accept_orbit_invitation((select invitation_token from invitation_case));

do $$
declare
  accepted_row record;
  access_row record;
  linked_user uuid;
begin
  select * into accepted_row from accepted_case;
  if accepted_row.acceptance_status <> 'accepted'
    or accepted_row.accepted_student_id <> '97000000-0000-4000-8000-000000000001'::uuid
  then
    raise exception 'valid invitation did not accept expected Foundry student';
  end if;

  select auth_user_id into linked_user
  from public.foundry_students
  where id='97000000-0000-4000-8000-000000000001';
  if linked_user <> '95000000-0000-4000-8000-000000000002'::uuid then
    raise exception 'accepted invitation did not bind exact auth identity';
  end if;

  if not exists (
    select 1 from public.audit_events
    where action='orbit.invitation.accepted'
      and actor_id='95000000-0000-4000-8000-000000000002'::uuid
      and entity_id=(select invitation_id from invitation_case)
  ) then
    raise exception 'invitation acceptance audit event missing';
  end if;

  select * into access_row from public.claim_orbit_access();
  if access_row.account_role <> 'student'
    or access_row.student_id <> '97000000-0000-4000-8000-000000000001'::uuid
  then
    raise exception 'accepted student did not resolve to student access';
  end if;
end
$$;

do $$
declare
  raw_token text;
  second_status text;
begin
  select invitation_token into raw_token from invitation_case;
  select acceptance_status into second_status
  from public.accept_orbit_invitation(raw_token);
  if second_status <> 'already_accepted' then
    raise exception 'same-user acceptance retry is not idempotent';
  end if;
end
$$;

-- A different identity cannot reuse an already-consumed invitation.
select set_config('request.jwt.claim.sub','95000000-0000-4000-8000-000000000003',true);
do $$
declare raw_token text;
begin
  select invitation_token into raw_token from invitation_case;
  begin
    perform * from public.accept_orbit_invitation(raw_token);
    raise exception 'different user reused accepted invitation';
  exception
    when insufficient_privilege then null;
  end;
end
$$;

-- Existing founder/admin identities cannot be silently converted into learner routing.
select set_config('request.jwt.claim.sub','95000000-0000-4000-8000-000000000001',true);
create temporary table founder_invitation on commit drop as
select * from public.create_foundry_invitation('97000000-0000-4000-8000-000000000003',24);
select set_config('request.jwt.claim.sub','95000000-0000-4000-8000-000000000004',true);
do $$
declare raw_token text;
begin
  select invitation_token into raw_token from founder_invitation;
  begin
    perform * from public.accept_orbit_invitation(raw_token);
    raise exception 'founder identity accepted student invitation';
  exception
    when insufficient_privilege then null;
  end;
end
$$;

-- Existing learners cannot bind a second active Foundry student record.
select set_config('request.jwt.claim.sub','95000000-0000-4000-8000-000000000001',true);
create temporary table learner_invitation on commit drop as
select * from public.create_foundry_invitation('97000000-0000-4000-8000-000000000005',24);
select set_config('request.jwt.claim.sub','95000000-0000-4000-8000-000000000005',true);
do $$
declare raw_token text;
begin
  select invitation_token into raw_token from learner_invitation;
  begin
    perform * from public.accept_orbit_invitation(raw_token);
    raise exception 'existing learner accepted second student identity';
  exception
    when insufficient_privilege then null;
  end;
end
$$;

-- Revocation is immediate and terminal for an unused invitation.
select set_config('request.jwt.claim.sub','95000000-0000-4000-8000-000000000001',true);
create temporary table revoked_invitation on commit drop as
select * from public.create_foundry_invitation('97000000-0000-4000-8000-000000000006',24);
select public.revoke_orbit_invitation((select invitation_id from revoked_invitation));

do $$
declare
  raw_token text;
  current_status text;
begin
  select invitation_token into raw_token from revoked_invitation;
  select invitation_status into current_status from public.inspect_orbit_invitation(raw_token);
  if current_status <> 'revoked' then
    raise exception 'revoked invitation still appears usable';
  end if;
end
$$;

select set_config('request.jwt.claim.sub','95000000-0000-4000-8000-000000000006',true);
do $$
declare raw_token text;
begin
  select invitation_token into raw_token from revoked_invitation;
  begin
    perform * from public.accept_orbit_invitation(raw_token);
    raise exception 'revoked invitation was accepted';
  exception
    when insufficient_privilege then null;
  end;
end
$$;

-- Expiry is evaluated at acceptance time, not only when the link is rendered.
select set_config('request.jwt.claim.sub','95000000-0000-4000-8000-000000000001',true);
create temporary table expired_invitation on commit drop as
select * from public.create_foundry_invitation('97000000-0000-4000-8000-000000000007',1);
update public.orbit_invitations
set created_at = now() - interval '2 hours',
    expires_at = now() - interval '1 hour'
where id=(select invitation_id from expired_invitation);

do $$
declare
  raw_token text;
  current_status text;
begin
  select invitation_token into raw_token from expired_invitation;
  select invitation_status into current_status from public.inspect_orbit_invitation(raw_token);
  if current_status <> 'expired' then
    raise exception 'expired invitation status is incorrect';
  end if;
end
$$;

select set_config('request.jwt.claim.sub','95000000-0000-4000-8000-000000000007',true);
do $$
declare raw_token text;
begin
  select invitation_token into raw_token from expired_invitation;
  begin
    perform * from public.accept_orbit_invitation(raw_token);
    raise exception 'expired invitation was accepted';
  exception
    when insufficient_privilege then null;
  end;
end
$$;

rollback;
