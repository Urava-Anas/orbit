begin;

insert into auth.users (
  id,
  aud,
  role,
  email,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    '10000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'orbit-rls-one@example.test',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"RLS One","workspace_name":"RLS Workspace One"}'::jsonb,
    now(),
    now()
  ),
  (
    '20000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'orbit-rls-two@example.test',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"RLS Two","workspace_name":"RLS Workspace Two"}'::jsonb,
    now(),
    now()
  );

create temporary table orbit_test_context as
select
  '10000000-0000-4000-8000-000000000001'::uuid as user_one,
  '20000000-0000-4000-8000-000000000002'::uuid as user_two,
  (
    select workspace_id
    from public.workspace_members
    where user_id = '10000000-0000-4000-8000-000000000001'::uuid
  ) as workspace_one,
  (
    select workspace_id
    from public.workspace_members
    where user_id = '20000000-0000-4000-8000-000000000002'::uuid
  ) as workspace_two;

grant select on orbit_test_context to authenticated;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000001',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $$
declare
  own_workspace uuid;
  other_workspace uuid;
  visible_workspaces integer;
  cross_tenant_insert_blocked boolean := false;
begin
  select workspace_one, workspace_two
  into own_workspace, other_workspace
  from orbit_test_context;

  select count(*) into visible_workspaces from public.workspaces;
  if visible_workspaces <> 1 then
    raise exception 'RLS failure: user one can see % workspaces', visible_workspaces;
  end if;

  insert into public.leads (
    workspace_id,
    name,
    source,
    stage,
    owner_id,
    created_by
  )
  values (
    own_workspace,
    'Visible lead',
    'direct',
    'new',
    '10000000-0000-4000-8000-000000000001'::uuid,
    '10000000-0000-4000-8000-000000000001'::uuid
  );

  begin
    insert into public.leads (
      workspace_id,
      name,
      source,
      stage,
      owner_id,
      created_by
    )
    values (
      other_workspace,
      'Forbidden lead',
      'direct',
      'new',
      '10000000-0000-4000-8000-000000000001'::uuid,
      '10000000-0000-4000-8000-000000000001'::uuid
    );
  exception
    when others then
      cross_tenant_insert_blocked := true;
  end;

  if not cross_tenant_insert_blocked then
    raise exception 'RLS failure: cross-tenant lead insert was allowed';
  end if;
end;
$$;

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '20000000-0000-4000-8000-000000000002',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $$
declare
  own_workspace uuid;
begin
  select workspace_two into own_workspace from orbit_test_context;

  insert into public.leads (
    workspace_id,
    name,
    source,
    stage,
    owner_id,
    created_by
  )
  values (
    own_workspace,
    'Second tenant lead',
    'referral',
    'qualified',
    '20000000-0000-4000-8000-000000000002'::uuid,
    '20000000-0000-4000-8000-000000000002'::uuid
  );
end;
$$;

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000001',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $$
declare
  other_workspace uuid;
  leaked_leads integer;
  visible_audit_events integer;
begin
  select workspace_two into other_workspace from orbit_test_context;

  select count(*)
  into leaked_leads
  from public.leads
  where workspace_id = other_workspace;

  if leaked_leads <> 0 then
    raise exception 'RLS failure: user one can read % foreign leads', leaked_leads;
  end if;

  select count(*) into visible_audit_events from public.audit_events;
  if visible_audit_events <> 1 then
    raise exception
      'Audit failure: user one expected 1 visible event, found %',
      visible_audit_events;
  end if;
end;
$$;

rollback;
select 'tenant isolation passed' as result;
