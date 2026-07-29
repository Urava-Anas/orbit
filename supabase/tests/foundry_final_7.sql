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
    'f1000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'final-founder@example.test',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Final Founder"}'::jsonb,
    now(),
    now()
  ),
  (
    'f2000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'final-student-a@example.test',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Final Student A"}'::jsonb,
    now(),
    now()
  ),
  (
    'f3000000-0000-4000-8000-000000000003',
    'authenticated',
    'authenticated',
    'final-student-b@example.test',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Final Student B"}'::jsonb,
    now(),
    now()
  );

insert into public.workspaces (id, name, slug, owner_id)
values (
  'f0000000-0000-4000-8000-000000000000',
  'Foundry Final Seven Workspace',
  'foundry-final-seven-workspace',
  'f1000000-0000-4000-8000-000000000001'
);

insert into public.workspace_members (workspace_id, user_id, role)
values (
  'f0000000-0000-4000-8000-000000000000',
  'f1000000-0000-4000-8000-000000000001',
  'owner'
);

insert into public.foundry_students (
  id,
  workspace_id,
  auth_user_id,
  foundry_id,
  full_name,
  email,
  phone,
  department,
  level,
  lifecycle_status,
  health_status,
  progress_percent,
  created_by
)
values
  (
    'f4000000-0000-4000-8000-000000000004',
    'f0000000-0000-4000-8000-000000000000',
    'f2000000-0000-4000-8000-000000000002',
    'UFS-FINAL-A',
    'Final Student A',
    'final-student-a@example.test',
    '+923001234567',
    'web_app',
    'operator',
    'enrolled',
    'green',
    85,
    'f1000000-0000-4000-8000-000000000001'
  ),
  (
    'f5000000-0000-4000-8000-000000000005',
    'f0000000-0000-4000-8000-000000000000',
    'f3000000-0000-4000-8000-000000000003',
    'UFS-FINAL-B',
    'Final Student B',
    'final-student-b@example.test',
    '+923007654321',
    'creative_ui',
    'explorer',
    'enrolled',
    'green',
    20,
    'f1000000-0000-4000-8000-000000000001'
  );

create temporary table foundry_final_context (
  review_id uuid,
  certificate_id uuid,
  certificate_token uuid
);

insert into foundry_final_context default values;
grant select, update on foundry_final_context to authenticated;
grant select on foundry_final_context to anon;

do $$
begin
  if (
    select count(*)
    from public.foundry_delivery_preferences
    where workspace_id = 'f0000000-0000-4000-8000-000000000000'
      and not email_enabled
      and not whatsapp_enabled
  ) <> 2 then
    raise exception 'Consent safety failure: new students were not default-off';
  end if;
end;
$$;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'f2000000-0000-4000-8000-000000000002',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $$
declare
  check_day date;
begin
  select public.record_foundry_daily_checkpoint('portal_opened')
  into check_day;
  perform public.record_foundry_daily_checkpoint('task_opened');
  perform public.record_foundry_daily_checkpoint('feedback_viewed');

  if not exists (
    select 1
    from public.foundry_daily_checks check_row
    where check_row.student_id =
      'f4000000-0000-4000-8000-000000000004'
      and check_row.check_date = check_day
      and check_row.portal_opened_at is not null
      and check_row.task_opened_at is not null
      and check_row.feedback_viewed_at is not null
  )
  then
    raise exception 'Daily check failure: real checkpoints were not recorded';
  end if;

  if (
    select count(*)
    from public.foundry_daily_checks
    where student_id = 'f5000000-0000-4000-8000-000000000005'
  ) <> 0 then
    raise exception 'Daily check privacy failure: Student A saw Student B';
  end if;

  if (select count(*) from public.foundry_external_records) <> 0
    or (select count(*) from public.foundry_external_deliveries) <> 0
  then
    raise exception 'Integration privacy failure: student saw worker state';
  end if;
end;
$$;

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'f1000000-0000-4000-8000-000000000001',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $$
declare
  target_review uuid;
  repeated_review uuid;
  target_certificate uuid;
  repeated_certificate uuid;
  blocked boolean := false;
begin
  perform public.queue_foundry_full_sync(
    'f0000000-0000-4000-8000-000000000000'
  );

  perform public.update_foundry_delivery_preferences(
    'f0000000-0000-4000-8000-000000000000',
    'f4000000-0000-4000-8000-000000000004',
    true,
    true,
    '+923001234567',
    'Student agreed during the Foundry onboarding call.'
  );

  if not exists (
    select 1
    from public.foundry_delivery_preferences preference
    where preference.student_id =
      'f4000000-0000-4000-8000-000000000004'
      and preference.email_enabled
      and preference.whatsapp_enabled
      and preference.email_consented_at is not null
      and preference.whatsapp_consented_at is not null
  )
  then
    raise exception 'Consent command failure';
  end if;

  begin
    perform public.review_foundry_studio_readiness(
      'f0000000-0000-4000-8000-000000000000',
      'f4000000-0000-4000-8000-000000000004',
      'f6000000-0000-4000-8000-000000000006',
      'approved',
      5::smallint,
      5::smallint,
      5::smallint,
      5::smallint,
      2::smallint,
      5::smallint,
      'Evidence exists, but reliability is deliberately below the gate.',
      'Must be blocked.'
    );
  exception
    when others then
      blocked := true;
  end;
  if not blocked then
    raise exception 'Studio gate failure: weak standard was approved';
  end if;

  select public.review_foundry_studio_readiness(
    'f0000000-0000-4000-8000-000000000000',
    'f4000000-0000-4000-8000-000000000004',
    'f7000000-0000-4000-8000-000000000007',
    'approved',
    4::smallint,
    4::smallint,
    4::smallint,
    4::smallint,
    4::smallint,
    4::smallint,
    'Accepted task evidence and observed conduct support all six standards.',
    'Approved for supervised Studio briefs only.'
  )
  into target_review;

  select public.review_foundry_studio_readiness(
    'f0000000-0000-4000-8000-000000000000',
    'f4000000-0000-4000-8000-000000000004',
    'f7000000-0000-4000-8000-000000000007',
    'approved',
    5::smallint,
    5::smallint,
    5::smallint,
    5::smallint,
    5::smallint,
    5::smallint,
    'A duplicate request must not create a second review.',
    'Duplicate.'
  )
  into repeated_review;

  if target_review <> repeated_review then
    raise exception 'Studio review idempotency failure';
  end if;
  if not exists (
    select 1
    from public.foundry_students
    where id = 'f4000000-0000-4000-8000-000000000004'
      and studio_eligible
      and health_status = 'gold'
  )
  then
    raise exception 'Studio approval did not update student state';
  end if;

  select public.issue_foundry_certificate(
    'f0000000-0000-4000-8000-000000000000',
    'f4000000-0000-4000-8000-000000000004',
    'f8000000-0000-4000-8000-000000000008',
    'studio_readiness',
    'Studio Readiness'
  )
  into target_certificate;

  select public.issue_foundry_certificate(
    'f0000000-0000-4000-8000-000000000000',
    'f4000000-0000-4000-8000-000000000004',
    'f8000000-0000-4000-8000-000000000008',
    'studio_readiness',
    'Duplicate ignored'
  )
  into repeated_certificate;

  if target_certificate <> repeated_certificate then
    raise exception 'Certificate idempotency failure';
  end if;

  update foundry_final_context
  set review_id = target_review,
      certificate_id = target_certificate,
      certificate_token = (
        select verification_token
        from public.foundry_certificates
        where id = target_certificate
      );
end;
$$;

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'f3000000-0000-4000-8000-000000000003',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $$
begin
  if (
    select count(*)
    from public.foundry_studio_readiness_reviews
  ) <> 0 then
    raise exception 'Studio review privacy failure: Student B saw Student A';
  end if;
  if (
    select count(*)
    from public.foundry_certificates
  ) <> 0 then
    raise exception 'Certificate privacy failure: Student B saw Student A';
  end if;
  if (
    select count(*)
    from public.foundry_delivery_preferences
    where student_id = 'f4000000-0000-4000-8000-000000000004'
  ) <> 0 then
    raise exception 'Consent privacy failure: Student B saw Student A';
  end if;
end;
$$;

reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);

do $$
declare
  target_token uuid;
  direct_table_blocked boolean := false;
begin
  select certificate_token
  into target_token
  from foundry_final_context;

  if (
    select status
    from public.verify_foundry_certificate(target_token)
  ) <> 'issued' then
    raise exception 'Public certificate verification failure';
  end if;

  begin
    perform count(*) from public.foundry_certificates;
  exception
    when others then
      direct_table_blocked := true;
  end;
  if not direct_table_blocked then
    raise exception 'Public verification leaked direct certificate access';
  end if;
end;
$$;

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'f1000000-0000-4000-8000-000000000001',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $$
declare
  target_certificate uuid;
  target_token uuid;
begin
  select certificate_id, certificate_token
  into target_certificate, target_token
  from foundry_final_context;

  perform public.revoke_foundry_certificate(
    'f0000000-0000-4000-8000-000000000000',
    target_certificate,
    'Test revocation after evidence correction.'
  );

  if (
    select status
    from public.verify_foundry_certificate(target_token)
  ) <> 'revoked' then
    raise exception 'Certificate revocation did not update verification';
  end if;
end;
$$;

reset role;
set local role service_role;

do $$
declare
  target_event bigint;
  created_delivery bigint;
  target_delivery bigint;
  result_status text;
begin
  select event.id
  into target_event
  from public.claim_foundry_outbox_events(100) event
  where event.aggregate_type = 'foundry_notifications'
  order by event.id
  limit 1;

  if target_event is null then
    raise exception 'Notification outbox failure';
  end if;

  insert into public.foundry_external_deliveries (
    event_id,
    workspace_id,
    student_id,
    channel
  )
  values (
    target_event,
    'f0000000-0000-4000-8000-000000000000',
    'f4000000-0000-4000-8000-000000000004',
    'email'
  )
  returning id into created_delivery;

  select delivery.id
  into target_delivery
  from public.claim_foundry_external_deliveries(1) delivery
  where delivery.id = created_delivery;

  select public.complete_foundry_external_delivery(
    target_delivery,
    false,
    null,
    'Temporary provider failure'
  )
  into result_status;
  if result_status <> 'failed' then
    raise exception 'External delivery retry state failure';
  end if;

  update public.foundry_external_deliveries
  set available_at = now()
  where id = target_delivery;

  select delivery.id
  into target_delivery
  from public.claim_foundry_external_deliveries(1) delivery
  where delivery.id = target_delivery;

  select public.complete_foundry_external_delivery(
    target_delivery,
    true,
    'provider-test-id',
    null
  )
  into result_status;
  if result_status <> 'succeeded' then
    raise exception 'External delivery completion failure';
  end if;
  if not exists (
    select 1
    from public.foundry_external_deliveries delivery
    where delivery.id = target_delivery
      and delivery.attempt_count = 2
      and delivery.provider_message_id = 'provider-test-id'
      and delivery.processed_at is not null
      and delivery.last_error is null
  )
  then
    raise exception 'External delivery final state failure';
  end if;
end;
$$;

rollback;
select 'foundry final 7 passed' as result;
