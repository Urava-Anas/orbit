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
    '30000000-0000-4000-8000-000000000003',
    'authenticated',
    'authenticated',
    'foundry-rls-one@example.test',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Foundry RLS One","workspace_name":"Foundry RLS One"}'::jsonb,
    now(),
    now()
  ),
  (
    '40000000-0000-4000-8000-000000000004',
    'authenticated',
    'authenticated',
    'foundry-rls-two@example.test',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Foundry RLS Two","workspace_name":"Foundry RLS Two"}'::jsonb,
    now(),
    now()
  );

insert into public.workspaces (id, name, slug, owner_id)
values
  (
    '31000000-0000-4000-8000-000000000003',
    'Foundry RLS Workspace One',
    'foundry-rls-workspace-one',
    '30000000-0000-4000-8000-000000000003'
  ),
  (
    '41000000-0000-4000-8000-000000000004',
    'Foundry RLS Workspace Two',
    'foundry-rls-workspace-two',
    '40000000-0000-4000-8000-000000000004'
  );

insert into public.workspace_members (workspace_id, user_id, role)
values
  (
    '31000000-0000-4000-8000-000000000003',
    '30000000-0000-4000-8000-000000000003',
    'owner'
  ),
  (
    '41000000-0000-4000-8000-000000000004',
    '40000000-0000-4000-8000-000000000004',
    'owner'
  );

create temporary table foundry_test_context as
select
  '31000000-0000-4000-8000-000000000003'::uuid as workspace_one,
  '41000000-0000-4000-8000-000000000004'::uuid as workspace_two;

grant select on foundry_test_context to authenticated;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '30000000-0000-4000-8000-000000000003',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $$
declare
  own_workspace uuid;
  other_workspace uuid;
  cross_tenant_insert_blocked boolean := false;
begin
  select workspace_one, workspace_two
  into own_workspace, other_workspace
  from foundry_test_context;

  insert into public.foundry_students (
    workspace_id,
    foundry_id,
    full_name,
    department,
    level,
    lifecycle_status,
    health_status,
    created_by
  )
  values (
    own_workspace,
    'UFS-RLS-1',
    'Visible Foundry Student',
    'creative_ui',
    'applied',
    'new',
    'yellow',
    '30000000-0000-4000-8000-000000000003'::uuid
  );

  begin
    insert into public.foundry_students (
      workspace_id,
      foundry_id,
      full_name,
      department,
      level,
      lifecycle_status,
      health_status,
      created_by
    )
    values (
      other_workspace,
      'UFS-RLS-FORBIDDEN',
      'Forbidden Foundry Student',
      'web_app',
      'applied',
      'new',
      'yellow',
      '30000000-0000-4000-8000-000000000003'::uuid
    );
  exception
    when others then
      cross_tenant_insert_blocked := true;
  end;

  if not cross_tenant_insert_blocked then
    raise exception 'Foundry RLS failure: cross-tenant student insert was allowed';
  end if;
end;
$$;

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '40000000-0000-4000-8000-000000000004',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $$
declare
  own_workspace uuid;
begin
  select workspace_two into own_workspace from foundry_test_context;

  insert into public.foundry_students (
    workspace_id,
    foundry_id,
    full_name,
    department,
    level,
    lifecycle_status,
    health_status,
    created_by
  )
  values (
    own_workspace,
    'UFS-RLS-2',
    'Second Foundry Student',
    'web_app',
    'applied',
    'new',
    'yellow',
    '40000000-0000-4000-8000-000000000004'::uuid
  );
end;
$$;

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '30000000-0000-4000-8000-000000000003',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $$
declare
  visible_students integer;
  visible_foreign_students integer;
  other_workspace uuid;
begin
  select workspace_two into other_workspace from foundry_test_context;

  select count(*) into visible_students
  from public.foundry_students;

  select count(*) into visible_foreign_students
  from public.foundry_students
  where workspace_id = other_workspace;

  if visible_students <> 1 or visible_foreign_students <> 0 then
    raise exception
      'Foundry RLS failure: expected 1 own and 0 foreign students, found % and %',
      visible_students,
      visible_foreign_students;
  end if;
end;
$$;

rollback;
select 'foundry tenant isolation passed' as result;
