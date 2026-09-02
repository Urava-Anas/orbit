begin;

-- Foundry M1 acceptance contract for Orbit-native Application -> Review ->
-- Accept/Invite -> Enrolment. This suite proves tenant isolation, browser
-- denial, token hygiene, authenticated identity binding and Orbit capability
-- linkage without importing any legacy Urava-project auth identifiers.

insert into auth.users (
  id, aud, role, email, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '83000000-0000-4000-8000-000000000001',
    'authenticated','authenticated','foundry-m1-learner@urava.test',now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Foundry M1 Learner"}'::jsonb,now(),now()
  ),
  (
    '83000000-0000-4000-8000-000000000002',
    'authenticated','authenticated','foundry-m1-wrong@urava.test',now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Wrong Invite User"}'::jsonb,now(),now()
  ),
  (
    '83000000-0000-4000-8000-000000000003',
    'authenticated','authenticated','foundry-m1-other-owner@urava.test',now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Other Workspace Owner"}'::jsonb,now(),now()
  );

insert into public.workspaces (id, name, slug, owner_id)
values (
  '84000000-0000-4000-8000-000000000002',
  'Foundry M1 Other Workspace',
  'foundry-m1-other',
  '83000000-0000-4000-8000-000000000003'
);

insert into public.workspace_members (workspace_id, user_id, role)
values (
  '84000000-0000-4000-8000-000000000002',
  '83000000-0000-4000-8000-000000000003',
  'owner'
);

-- CI fixture workspaces are created after the platform seed migration, so add
-- the learner bundle explicitly for this deterministic acceptance tenant.
insert into public.permission_bundles (
  workspace_id, bundle_key, name, description, system_managed, created_by
)
values (
  '82000000-0000-4000-8000-000000000001',
  'foundry_learner',
  'Foundry Learner',
  'Learning access only; no Studio or organisation administration.',
  true,
  '81000000-0000-4000-8000-000000000001'
)
on conflict (workspace_id, bundle_key) do nothing;

insert into public.permission_bundle_capabilities (
  workspace_id, bundle_id, capability_key
)
select
  bundle.workspace_id,
  bundle.id,
  'foundry.learn'
from public.permission_bundles bundle
where bundle.workspace_id = '82000000-0000-4000-8000-000000000001'
  and bundle.bundle_key = 'foundry_learner'
on conflict do nothing;

set local role service_role;

insert into public.foundry_applications (
  id, workspace_id, full_name, email, status, preferred_course,
  department, validation_state, source_evidence, created_by
)
values (
  '85000000-0000-4000-8000-000000000001',
  '82000000-0000-4000-8000-000000000001',
  'Foundry M1 Learner',
  'foundry-m1-learner@urava.test',
  'new',
  'web_development',
  'unassigned',
  'evidence_verified',
  'CI acceptance application',
  '81000000-0000-4000-8000-000000000001'
),(
  '85000000-0000-4000-8000-000000000002',
  '84000000-0000-4000-8000-000000000002',
  'Other Workspace Applicant',
  'other-applicant@urava.test',
  'new',
  'content_media',
  'unassigned',
  'unverified',
  'Tenant isolation fixture',
  '83000000-0000-4000-8000-000000000003'
);

reset role;

-- Browser/authenticated clients must not read lifecycle state directly and must
-- not be able to invoke service-only transition RPCs.
set local role authenticated;
select set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);

do $$
declare
  blocked_read boolean := false;
  blocked_rpc boolean := false;
begin
  begin
    perform count(*) from public.foundry_applications;
  exception when insufficient_privilege then
    blocked_read := true;
  end;

  if not blocked_read then
    raise exception 'Foundry M1 security failure: authenticated lifecycle read was allowed';
  end if;

  begin
    perform public.foundry_review_application(
      '82000000-0000-4000-8000-000000000001'::uuid,
      '85000000-0000-4000-8000-000000000001'::uuid,
      'reviewing',
      '81000000-0000-4000-8000-000000000001'::uuid,
      null,null,'unverified',false
    );
  exception when insufficient_privilege then
    blocked_rpc := true;
  end;

  if not blocked_rpc then
    raise exception 'Foundry M1 security failure: authenticated admin RPC execution was allowed';
  end if;
end;
$$;

reset role;
set local role service_role;

do $$
declare
  v_review uuid;
  v_invitation uuid;
  v_token text;
  v_hash text;
  duplicate_blocked boolean := false;
  wrong_workspace_reviewer_blocked boolean := false;
  wrong_user_blocked boolean := false;
  v_enrolment uuid;
  v_student uuid;
  v_workspace uuid;
  v_stage text;
  v_complete boolean;
  event_count integer;
  event_types text[];
begin
  -- A reviewer from another workspace must not be accepted for this tenant.
  begin
    perform public.foundry_review_application(
      '82000000-0000-4000-8000-000000000001'::uuid,
      '85000000-0000-4000-8000-000000000001'::uuid,
      'reviewing',
      '83000000-0000-4000-8000-000000000003'::uuid,
      'must fail',null,'unverified',false
    );
  exception when others then
    wrong_workspace_reviewer_blocked := true;
  end;

  if not wrong_workspace_reviewer_blocked then
    raise exception 'Foundry M1 isolation failure: foreign workspace reviewer was accepted';
  end if;

  select review_id, invitation_id, invite_token
  into v_review, v_invitation, v_token
  from public.foundry_accept_application(
    '82000000-0000-4000-8000-000000000001'::uuid,
    '85000000-0000-4000-8000-000000000001'::uuid,
    'foundry-m1-learner@urava.test',
    '81000000-0000-4000-8000-000000000001'::uuid,
    'Accepted in CI',
    'Evidence verified in CI',
    'evidence_verified',
    7
  );

  if v_review is null or v_invitation is null or v_token !~ '^[a-f0-9]{64}$' then
    raise exception 'Foundry M1 acceptance failure: invite preparation shape is invalid';
  end if;

  select token_hash into v_hash
  from public.foundry_invitations
  where workspace_id = '82000000-0000-4000-8000-000000000001'::uuid
    and id = v_invitation;

  if v_hash is null or v_hash = v_token
     or v_hash <> encode(extensions.digest(v_token,'sha256'),'hex') then
    raise exception 'Foundry M1 token failure: plaintext token stored or hash mismatch';
  end if;

  begin
    perform * from public.foundry_accept_application(
      '82000000-0000-4000-8000-000000000001'::uuid,
      '85000000-0000-4000-8000-000000000001'::uuid,
      'foundry-m1-learner@urava.test',
      '81000000-0000-4000-8000-000000000001'::uuid,
      null,null,'evidence_verified',7
    );
  exception when others then
    duplicate_blocked := true;
  end;

  if not duplicate_blocked then
    raise exception 'Foundry M1 integrity failure: duplicate open invitation was allowed';
  end if;

  perform public.foundry_mark_invitation_sent(
    '82000000-0000-4000-8000-000000000001'::uuid,
    v_invitation,
    '81000000-0000-4000-8000-000000000001'::uuid,
    'CI invite delivery confirmed'
  );

  begin
    perform * from public.foundry_claim_invitation(
      v_token,
      '83000000-0000-4000-8000-000000000002'::uuid,
      'wrong-account test'
    );
  exception when others then
    wrong_user_blocked := true;
  end;

  if not wrong_user_blocked then
    raise exception 'Foundry M1 identity failure: invitation was claimable by wrong account';
  end if;

  if (select status from public.foundry_invitations where id=v_invitation) <> 'sent' then
    raise exception 'Foundry M1 transaction failure: rejected claim changed invitation state';
  end if;

  select enrolment_id, student_id, workspace_id
  into v_enrolment, v_student, v_workspace
  from public.foundry_claim_invitation(
    v_token,
    '83000000-0000-4000-8000-000000000001'::uuid,
    'Authenticated CI claim'
  );

  if v_enrolment is null or v_student is null
     or v_workspace <> '82000000-0000-4000-8000-000000000001'::uuid then
    raise exception 'Foundry M1 enrolment failure: claim result is incomplete';
  end if;

  if not exists (
    select 1 from public.workspace_members
    where workspace_id=v_workspace
      and user_id='83000000-0000-4000-8000-000000000001'::uuid
      and role='member'
  ) then
    raise exception 'Foundry M1 access failure: workspace membership was not created';
  end if;

  if not exists (
    select 1
    from public.member_permission_bundles mpb
    join public.permission_bundles pb
      on pb.workspace_id=mpb.workspace_id and pb.id=mpb.bundle_id
    where mpb.workspace_id=v_workspace
      and mpb.user_id='83000000-0000-4000-8000-000000000001'::uuid
      and pb.bundle_key='foundry_learner'
  ) then
    raise exception 'Foundry M1 access failure: foundry_learner bundle was not assigned';
  end if;

  if not exists (
    select 1 from public.foundry_students
    where workspace_id=v_workspace
      and id=v_student
      and auth_user_id='83000000-0000-4000-8000-000000000001'::uuid
      and lifecycle_status='enrolled'
      and level='onboarding'
      and department='web_app'
      and application_id='85000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'Foundry M1 student failure: Orbit student was not linked correctly';
  end if;

  if not exists (
    select 1 from public.foundry_enrolments
    where workspace_id=v_workspace
      and id=v_enrolment
      and application_id='85000000-0000-4000-8000-000000000001'::uuid
      and auth_user_id='83000000-0000-4000-8000-000000000001'::uuid
      and foundry_student_id=v_student
      and status='active'
      and validation_state='evidence_verified'
  ) then
    raise exception 'Foundry M1 enrolment failure: canonical active enrolment missing';
  end if;

  select lifecycle_stage, milestone_complete
  into v_stage, v_complete
  from public.foundry_application_lifecycle
  where workspace_id=v_workspace
    and application_id='85000000-0000-4000-8000-000000000001'::uuid;

  if v_stage <> 'enrolled' or v_complete is not true then
    raise exception 'Foundry M1 lifecycle failure: expected enrolled/true, got %/%', v_stage, v_complete;
  end if;

  select count(*), array_agg(event_type order by id)
  into event_count, event_types
  from public.foundry_lifecycle_events
  where workspace_id=v_workspace
    and application_id='85000000-0000-4000-8000-000000000001'::uuid;

  if event_count <> 5
     or event_types <> array[
       'application_accepted','invitation_prepared','invitation_sent',
       'invitation_accepted','enrolled'
     ]::text[] then
    raise exception 'Foundry M1 audit failure: unexpected lifecycle events %', event_types;
  end if;

  if exists (
    select 1 from public.foundry_lifecycle_events
    where workspace_id='84000000-0000-4000-8000-000000000002'::uuid
      and application_id='85000000-0000-4000-8000-000000000001'::uuid
  ) then
    raise exception 'Foundry M1 isolation failure: lifecycle event crossed workspace boundary';
  end if;
end;
$$;

rollback;
select 'foundry M1 Orbit parity passed' as result;
