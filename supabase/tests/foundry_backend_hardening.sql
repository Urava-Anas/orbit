begin;

insert into auth.users (
  id,
  aud,
  role,
  email,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    'a1000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'hardening-founder@example.test',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Hardening Founder"}'::jsonb,
    now(),
    now()
  ),
  (
    'a2000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'hardening-student-a@example.test',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Hardening Student A"}'::jsonb,
    now(),
    now()
  ),
  (
    'a3000000-0000-4000-8000-000000000003',
    'authenticated',
    'authenticated',
    'hardening-student-b@example.test',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Hardening Student B"}'::jsonb,
    now(),
    now()
  );

insert into public.workspaces (id, name, slug, owner_id)
values (
  'a0000000-0000-4000-8000-000000000000',
  'Foundry Hardening Workspace',
  'foundry-hardening-workspace',
  'a1000000-0000-4000-8000-000000000001'
);

insert into public.workspace_members (workspace_id, user_id, role)
values (
  'a0000000-0000-4000-8000-000000000000',
  'a1000000-0000-4000-8000-000000000001',
  'owner'
);

insert into public.foundry_students (
  id,
  workspace_id,
  auth_user_id,
  foundry_id,
  full_name,
  email,
  department,
  level,
  lifecycle_status,
  health_status,
  created_by
)
values
  (
    'a4000000-0000-4000-8000-000000000004',
    'a0000000-0000-4000-8000-000000000000',
    'a2000000-0000-4000-8000-000000000002',
    'UFS-HARD-A',
    'Hardening Student A',
    'hardening-student-a@example.test',
    'creative_ui',
    'explorer',
    'enrolled',
    'green',
    'a1000000-0000-4000-8000-000000000001'
  ),
  (
    'a5000000-0000-4000-8000-000000000005',
    'a0000000-0000-4000-8000-000000000000',
    'a3000000-0000-4000-8000-000000000003',
    'UFS-HARD-B',
    'Hardening Student B',
    'hardening-student-b@example.test',
    'web_app',
    'explorer',
    'enrolled',
    'green',
    'a1000000-0000-4000-8000-000000000001'
  );

create temporary table foundry_hardening_context (
  workspace_id uuid not null,
  student_a_id uuid not null,
  student_b_id uuid not null,
  general_class_id uuid,
  creative_class_id uuid,
  web_class_id uuid,
  assignment_a_id uuid,
  assignment_b_id uuid,
  revision_assignment_id uuid,
  accepted_submission_id uuid,
  revision_submission_one_id uuid,
  revision_submission_two_id uuid
);

insert into foundry_hardening_context (
  workspace_id,
  student_a_id,
  student_b_id
)
values (
  'a0000000-0000-4000-8000-000000000000',
  'a4000000-0000-4000-8000-000000000004',
  'a5000000-0000-4000-8000-000000000005'
);

grant select, update on foundry_hardening_context to authenticated;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'a1000000-0000-4000-8000-000000000001',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $$
declare
  target_workspace uuid;
  target_student_a uuid;
  target_student_b uuid;
  class_general uuid;
  class_creative uuid;
  class_web uuid;
  assignment_a uuid;
  assignment_a_repeat uuid;
  assignment_b uuid;
  assignment_revision uuid;
  blocked boolean := false;
begin
  select workspace_id, student_a_id, student_b_id
  into target_workspace, target_student_a, target_student_b
  from foundry_hardening_context;

  select public.create_foundry_class_command(
    target_workspace,
    'b1000000-0000-4000-8000-000000000001',
    'General Foundry Session',
    'Hardening Mentor',
    '',
    now() + interval '1 day',
    now() + interval '1 day 1 hour',
    'online',
    '',
    'All students can attend.'
  )
  into class_general;

  select public.create_foundry_class_command(
    target_workspace,
    'b2000000-0000-4000-8000-000000000002',
    'Creative Foundry Session',
    'Hardening Mentor',
    'creative_ui',
    now() + interval '2 days',
    now() + interval '2 days 1 hour',
    'online',
    '',
    'Creative students only.'
  )
  into class_creative;

  select public.create_foundry_class_command(
    target_workspace,
    'b3000000-0000-4000-8000-000000000003',
    'Web Foundry Session',
    'Hardening Mentor',
    'web_app',
    now() + interval '3 days',
    now() + interval '3 days 1 hour',
    'online',
    '',
    'Web students only.'
  )
  into class_web;

  insert into public.foundry_attendance (
    workspace_id,
    class_id,
    student_id,
    status,
    marked_by
  )
  values
    (
      target_workspace,
      class_general,
      target_student_a,
      'present',
      'a1000000-0000-4000-8000-000000000001'
    ),
    (
      target_workspace,
      class_general,
      target_student_b,
      'absent',
      'a1000000-0000-4000-8000-000000000001'
    );

  update public.foundry_classes
  set status = 'live'
  where id = class_general;

  update public.foundry_classes
  set status = 'completed'
  where id = class_general;

  if (
    select count(*)
    from public.foundry_progress_events
    where student_id = target_student_a
      and event_type = 'class_completed'
      and source_id = class_general
  ) <> 1 then
    raise exception 'Class completion evidence failure';
  end if;

  begin
    update public.foundry_classes
    set status = 'live'
    where id = class_general;
  exception
    when others then
      blocked := true;
  end;
  if not blocked then
    raise exception 'Class lifecycle failure: completed class reopened';
  end if;
  blocked := false;

  begin
    update public.foundry_classes
    set status = 'completed'
    where id = class_creative;
  exception
    when others then
      blocked := true;
  end;
  if not blocked then
    raise exception 'Class completion failure: unmarked roster was accepted';
  end if;
  blocked := false;

  select command.assignment_id
  into assignment_a
  from public.create_foundry_task_assignment_command(
    target_workspace,
    target_student_a,
    'b4000000-0000-4000-8000-000000000004',
    'Student A atomic task',
    'Pehla step complete karein aur short note submit karein.',
    'creative_ui',
    'starter',
    'quality',
    10::smallint,
    now() + interval '4 days'
  ) command;

  select command.assignment_id
  into assignment_a_repeat
  from public.create_foundry_task_assignment_command(
    target_workspace,
    target_student_a,
    'b4000000-0000-4000-8000-000000000004',
    'Ignored duplicate title',
    'Yeh duplicate request naya task create nahi kar sakti.',
    'creative_ui',
    'starter',
    'quality',
    10::smallint,
    now() + interval '5 days'
  ) command;

  if assignment_a_repeat <> assignment_a then
    raise exception 'Idempotency failure: duplicate task command changed assignment';
  end if;

  select command.assignment_id
  into assignment_b
  from public.create_foundry_task_assignment_command(
    target_workspace,
    target_student_b,
    'b5000000-0000-4000-8000-000000000005',
    'Student B private task',
    'Sirf linked student yeh task dekh aur submit kar sakta hai.',
    'web_app',
    'starter',
    'reliability',
    8::smallint,
    now() + interval '4 days'
  ) command;

  select command.assignment_id
  into assignment_revision
  from public.create_foundry_task_assignment_command(
    target_workspace,
    target_student_a,
    'b6000000-0000-4000-8000-000000000006',
    'Student A revision task',
    'Work submit karein, feedback parhein, phir revision bhejein.',
    'creative_ui',
    'standard',
    'revision',
    12::smallint,
    now() + interval '6 days'
  ) command;

  update foundry_hardening_context
  set general_class_id = class_general,
      creative_class_id = class_creative,
      web_class_id = class_web,
      assignment_a_id = assignment_a,
      assignment_b_id = assignment_b,
      revision_assignment_id = assignment_revision;

  if (
    select count(*)
    from public.foundry_command_receipts
    where actor_id = 'a1000000-0000-4000-8000-000000000001'
      and request_id = 'b4000000-0000-4000-8000-000000000004'
  ) <> 1 then
    raise exception 'Idempotency failure: command receipt is not unique';
  end if;

  perform set_config('app.foundry_command', '', true);
  begin
    insert into public.foundry_tasks (
      workspace_id,
      title,
      instructions_roman_urdu,
      department,
      difficulty,
      points,
      status,
      created_by
    )
    values (
      target_workspace,
      'Bypass task',
      'Yeh direct write command lock ko pass nahi karni chahiye.',
      'creative_ui',
      'starter',
      1,
      'published',
      'a1000000-0000-4000-8000-000000000001'
    );
  exception
    when others then
      blocked := true;
  end;

  if not blocked then
    raise exception 'Command lock failure: direct task insert was allowed';
  end if;

  blocked := false;
  begin
    insert into public.foundry_command_receipts (
      workspace_id,
      actor_id,
      request_id,
      command_type
    )
    values (
      target_workspace,
      'a1000000-0000-4000-8000-000000000001',
      'b7000000-0000-4000-8000-000000000007',
      'create_class'
    );
  exception
    when others then
      blocked := true;
  end;

  if not blocked then
    raise exception 'Command lock failure: forged receipt was allowed';
  end if;
end;
$$;

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'a2000000-0000-4000-8000-000000000002',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $$
declare
  target_assignment_a uuid;
  target_assignment_b uuid;
  target_revision_assignment uuid;
  target_student_b uuid;
  first_submission uuid;
  first_submission_repeat uuid;
  revision_submission uuid;
  first_attempt integer;
  repeated_attempt integer;
  blocked boolean := false;
begin
  select
    assignment_a_id,
    assignment_b_id,
    revision_assignment_id,
    student_b_id
  into
    target_assignment_a,
    target_assignment_b,
    target_revision_assignment,
    target_student_b
  from foundry_hardening_context;

  if (select count(*) from public.foundry_classes) <> 2 then
    raise exception 'Class privacy failure: Student A should see 2 classes';
  end if;
  if (select count(*) from public.foundry_tasks) <> 2 then
    raise exception 'Task privacy failure: Student A should see 2 assigned tasks';
  end if;
  if (select count(*) from public.foundry_task_assignments) <> 2 then
    raise exception 'Assignment privacy failure: Student A should see 2 assignments';
  end if;
  if (
    select count(*)
    from public.foundry_notifications
    where student_id = target_student_b
  ) <> 0 then
    raise exception 'Notification privacy failure: Student A saw Student B';
  end if;
  if (select count(*) from public.foundry_outbox_events) <> 0 then
    raise exception 'Outbox privacy failure: student can read integration events';
  end if;

  begin
    perform *
    from public.claim_foundry_outbox_events(1);
  exception
    when others then
      blocked := true;
  end;
  if not blocked then
    raise exception 'Outbox privilege failure: student claimed integration work';
  end if;
  blocked := false;

  select command.submission_id, command.attempt_number
  into first_submission, first_attempt
  from public.submit_foundry_assignment_command(
    target_assignment_a,
    'c1000000-0000-4000-8000-000000000001',
    '',
    'Student A ka pehla evidence note.'
  ) command;

  select command.submission_id, command.attempt_number
  into first_submission_repeat, repeated_attempt
  from public.submit_foundry_assignment_command(
    target_assignment_a,
    'c1000000-0000-4000-8000-000000000001',
    '',
    'Duplicate request ka content ignore hona chahiye.'
  ) command;

  if first_submission_repeat <> first_submission
    or first_attempt <> 1
    or repeated_attempt <> 1
  then
    raise exception 'Submission idempotency failure';
  end if;

  if (
    select count(*)
    from public.foundry_submissions
    where assignment_id = target_assignment_a
  ) <> 1 then
    raise exception 'Submission idempotency created duplicate rows';
  end if;

  begin
    perform *
    from public.submit_foundry_assignment_command(
      target_assignment_b,
      'c2000000-0000-4000-8000-000000000002',
      '',
      'Cross-student work must fail.'
    );
  exception
    when others then
      blocked := true;
  end;

  if not blocked then
    raise exception 'Ownership failure: Student A submitted Student B assignment';
  end if;

  select command.submission_id
  into revision_submission
  from public.submit_foundry_assignment_command(
    target_revision_assignment,
    'c3000000-0000-4000-8000-000000000003',
    'https://example.test/student-a/revision-one',
    ''
  ) command;

  update foundry_hardening_context
  set accepted_submission_id = first_submission,
      revision_submission_one_id = revision_submission;

  perform set_config('app.foundry_command', '', true);
  blocked := false;
  begin
    insert into public.foundry_submissions (
      workspace_id,
      assignment_id,
      student_id,
      submission_url,
      status
    )
    values (
      'a0000000-0000-4000-8000-000000000000',
      target_revision_assignment,
      'a4000000-0000-4000-8000-000000000004',
      'https://example.test/direct-bypass',
      'submitted'
    );
  exception
    when others then
      blocked := true;
  end;

  if not blocked then
    raise exception 'Command lock failure: direct submission insert was allowed';
  end if;

  blocked := false;
  begin
    delete from public.foundry_submissions
    where id = first_submission;
  exception
    when others then
      blocked := true;
  end;

  if not blocked then
    raise exception 'Retention failure: student deleted a submission';
  end if;
end;
$$;

reset role;
set local role service_role;

do $$
declare
  claimed_event_id bigint;
  result_status text;
begin
  select event.id
  into claimed_event_id
  from public.claim_foundry_outbox_events(1) event;

  if claimed_event_id is null then
    raise exception 'Outbox worker failure: no event was claimed';
  end if;

  select public.complete_foundry_outbox_event(
    claimed_event_id,
    false,
    'Temporary test failure'
  )
  into result_status;
  if result_status <> 'failed' then
    raise exception 'Outbox worker failure: retry state was not recorded';
  end if;

  update public.foundry_outbox_events
  set available_at = '2000-01-01 00:00:00+00'::timestamptz
  where id = claimed_event_id;

  if (
    select event.id
    from public.claim_foundry_outbox_events(1) event
  ) <> claimed_event_id then
    raise exception 'Outbox worker failure: retry was not claimed';
  end if;

  select public.complete_foundry_outbox_event(
    claimed_event_id,
    true,
    null
  )
  into result_status;
  if result_status <> 'succeeded' then
    raise exception 'Outbox worker failure: success was not recorded';
  end if;

  if not exists (
    select 1
    from public.foundry_outbox_events
    where id = claimed_event_id
      and status = 'succeeded'
      and attempt_count = 2
      and processed_at is not null
      and locked_at is null
      and last_error is null
  ) then
    raise exception 'Outbox worker failure: final event state is invalid';
  end if;
end;
$$;

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'a1000000-0000-4000-8000-000000000001',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $$
declare
  target_workspace uuid;
  accepted_submission uuid;
  revision_submission uuid;
  target_assignment_a uuid;
  target_revision_assignment uuid;
  review_status text;
  review_status_repeat text;
  blocked boolean := false;
begin
  select
    workspace_id,
    accepted_submission_id,
    revision_submission_one_id,
    assignment_a_id,
    revision_assignment_id
  into
    target_workspace,
    accepted_submission,
    revision_submission,
    target_assignment_a,
    target_revision_assignment
  from foundry_hardening_context;

  select command.submission_status
  into review_status
  from public.review_foundry_submission_command(
    accepted_submission,
    'd1000000-0000-4000-8000-000000000001',
    'accepted',
    'Strong first attempt. Task accepted.',
    88::smallint
  ) command;

  select command.submission_status
  into review_status_repeat
  from public.review_foundry_submission_command(
    accepted_submission,
    'd1000000-0000-4000-8000-000000000001',
    'accepted',
    'Duplicate review must not apply twice.',
    1::smallint
  ) command;

  if review_status <> 'accepted' or review_status_repeat <> 'accepted' then
    raise exception 'Review idempotency returned an unexpected status';
  end if;
  if (
    select count(*)
    from public.foundry_progress_events
    where event_type = 'task_completed'
      and source_id = accepted_submission
  ) <> 1 then
    raise exception 'Review idempotency created duplicate progress';
  end if;
  if (
    select status
    from public.foundry_task_assignments
    where id = target_assignment_a
  ) <> 'completed' then
    raise exception 'Accepted submission did not complete its assignment';
  end if;

  perform *
  from public.review_foundry_submission_command(
    revision_submission,
    'd2000000-0000-4000-8000-000000000002',
    'revision_required',
    'Sirf spacing revise karein aur dobara submit karein.',
    64::smallint
  );

  if (
    select status
    from public.foundry_task_assignments
    where id = target_revision_assignment
  ) <> 'revision_required' then
    raise exception 'Revision review did not reopen the assignment';
  end if;

  begin
    perform *
    from public.review_foundry_submission_command(
      accepted_submission,
      'd3000000-0000-4000-8000-000000000003',
      'revision_required',
      'Terminal review must remain immutable.',
      50::smallint
    );
  exception
    when others then
      blocked := true;
  end;

  if not blocked then
    raise exception 'State failure: an accepted submission was reviewed again';
  end if;

  perform set_config('app.foundry_command', '', true);
  blocked := false;
  begin
    update public.foundry_students
    set email = 'changed-connected-email@example.test'
    where id = 'a4000000-0000-4000-8000-000000000004';
  exception
    when others then
      blocked := true;
  end;

  if not blocked then
    raise exception 'Identity failure: connected student email was changed';
  end if;

  blocked := false;
  begin
    delete from public.foundry_students
    where id = 'a4000000-0000-4000-8000-000000000004';
  exception
    when others then
      blocked := true;
  end;

  if not blocked then
    raise exception 'Retention failure: founder hard-deleted a student';
  end if;

  if not exists (
    select 1
    from public.audit_events
    where workspace_id = target_workspace
      and entity_type = 'foundry_submissions'
      and entity_id = accepted_submission
      and metadata -> 'changed_fields' ? 'status'
      and metadata ? 'transaction_id'
  ) then
    raise exception 'Audit failure: status change metadata is incomplete';
  end if;
end;
$$;

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'a2000000-0000-4000-8000-000000000002',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $$
declare
  target_revision_assignment uuid;
  second_submission uuid;
  second_attempt integer;
begin
  select revision_assignment_id
  into target_revision_assignment
  from foundry_hardening_context;

  select command.submission_id, command.attempt_number
  into second_submission, second_attempt
  from public.submit_foundry_assignment_command(
    target_revision_assignment,
    'e1000000-0000-4000-8000-000000000001',
    'https://example.test/student-a/revision-two',
    'Spacing feedback apply kar di.'
  ) command;

  if second_attempt <> 2 then
    raise exception 'Retry failure: expected attempt 2, found %', second_attempt;
  end if;
  if (
    select count(*)
    from public.foundry_submissions
    where assignment_id = target_revision_assignment
      and status in ('submitted', 'under_review')
  ) <> 1 then
    raise exception 'Retry failure: expected exactly one open attempt';
  end if;

  update foundry_hardening_context
  set revision_submission_two_id = second_submission;
end;
$$;

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'a1000000-0000-4000-8000-000000000001',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $$
declare
  second_submission uuid;
begin
  select revision_submission_two_id
  into second_submission
  from foundry_hardening_context;

  perform *
  from public.review_foundry_submission_command(
    second_submission,
    'f1000000-0000-4000-8000-000000000001',
    'accepted',
    'Revision complete. Work accepted.',
    91::smallint
  );

  if (
    select count(*)
    from public.foundry_submissions
    where assignment_id = (
      select revision_assignment_id
      from foundry_hardening_context
    )
  ) <> 2 then
    raise exception 'Retry history failure: both attempts were not retained';
  end if;
end;
$$;

reset role;
update public.foundry_task_assignments
set starts_at = now() - interval '2 hours',
    due_at = now() - interval '1 hour'
where id = (
  select assignment_b_id
  from foundry_hardening_context
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'a1000000-0000-4000-8000-000000000001',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $$
declare
  target_workspace uuid;
  target_assignment_b uuid;
  affected integer;
begin
  select workspace_id, assignment_b_id
  into target_workspace, target_assignment_b
  from foundry_hardening_context;

  select public.run_foundry_deadline_sweep(target_workspace)
  into affected;
  if affected <> 1 then
    raise exception 'Deadline sweep failure: expected 1, found %', affected;
  end if;
  if (
    select status
    from public.foundry_task_assignments
    where id = target_assignment_b
  ) <> 'recovery_assigned' then
    raise exception 'Recovery failure: missed assignment was not recovered';
  end if;
  if (
    select count(*)
    from public.foundry_task_assignments
    where recovery_for_assignment_id = target_assignment_b
  ) <> 1 then
    raise exception 'Recovery failure: expected exactly one recovery assignment';
  end if;

  select public.run_foundry_deadline_sweep(target_workspace)
  into affected;
  if affected <> 0 then
    raise exception 'Deadline sweep idempotency failure';
  end if;

  if exists (
    select 1
    from public.foundry_outbox_events
    where payload - 'record_id' - 'occurred_at' <> '{}'::jsonb
  ) then
    raise exception 'Outbox privacy failure: payload contains business data';
  end if;
  if (select count(*) from public.foundry_outbox_events) = 0 then
    raise exception 'Outbox failure: no durable integration events were created';
  end if;
end;
$$;

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'a2000000-0000-4000-8000-000000000002',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $$
begin
  if (
    select count(*)
    from public.foundry_notifications
    where student_id = 'a4000000-0000-4000-8000-000000000004'
  ) <> 8 then
    raise exception 'Notification failure: Student A expected 8 notifications';
  end if;
  if exists (
    select 1
    from public.foundry_notifications
    where student_id = 'a5000000-0000-4000-8000-000000000005'
  ) then
    raise exception 'Notification isolation failure after workflow completion';
  end if;

  update public.foundry_notifications
  set read_at = now()
  where student_id = 'a4000000-0000-4000-8000-000000000004'
    and read_at is null;

  if exists (
    select 1
    from public.foundry_notifications
    where student_id = 'a4000000-0000-4000-8000-000000000004'
      and read_at is null
  ) then
    raise exception 'Notification read-state failure';
  end if;
end;
$$;

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'a3000000-0000-4000-8000-000000000003',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $$
begin
  if (select count(*) from public.foundry_classes) <> 2 then
    raise exception 'Class privacy failure: Student B should see 2 classes';
  end if;
  if (select count(*) from public.foundry_tasks) <> 2 then
    raise exception 'Task privacy failure: Student B should see task plus recovery';
  end if;
  if (select count(*) from public.foundry_task_assignments) <> 2 then
    raise exception 'Assignment privacy failure: Student B should see task plus recovery';
  end if;
  if (
    select count(*)
    from public.foundry_notifications
    where student_id = 'a5000000-0000-4000-8000-000000000005'
  ) <> 5 then
    raise exception 'Recovery notification failure for Student B';
  end if;
  if exists (
    select 1
    from public.foundry_notifications
    where student_id = 'a4000000-0000-4000-8000-000000000004'
  ) then
    raise exception 'Notification isolation failure: Student B saw Student A';
  end if;
end;
$$;

rollback;
select 'foundry backend hardening passed' as result;
