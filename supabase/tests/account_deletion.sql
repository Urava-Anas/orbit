begin;

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  '93000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'delete-me@example.test',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Deletion Test"}'::jsonb,
  now(),
  now()
);

insert into public.workspaces (id, name, slug, owner_id)
values (
  '94000000-0000-4000-8000-000000000001',
  'Deletion Workspace',
  'deletion-workspace',
  '93000000-0000-4000-8000-000000000001'
);

insert into public.workspace_members(workspace_id,user_id,role)
values (
  '94000000-0000-4000-8000-000000000001',
  '93000000-0000-4000-8000-000000000001',
  'owner'
);

insert into public.leads(workspace_id,name,source,stage,created_by)
values (
  '94000000-0000-4000-8000-000000000001',
  'Deletion Lead',
  'direct',
  'new',
  '93000000-0000-4000-8000-000000000001'
);

-- Account deletion deliberately removes owned workspace data before the auth identity.
delete from public.workspaces
where id = '94000000-0000-4000-8000-000000000001';

do $$
begin
  if exists (select 1 from public.leads where workspace_id='94000000-0000-4000-8000-000000000001') then
    raise exception 'owned workspace records did not cascade';
  end if;
end
$$;

delete from auth.users where id='93000000-0000-4000-8000-000000000001';

do $$
declare
  blocking_fks integer;
begin
  select count(*) into blocking_fks
  from pg_constraint con
  join pg_class c on c.oid=con.conrelid
  join pg_namespace n on n.oid=c.relnamespace
  where con.contype='f'
    and con.confrelid='auth.users'::regclass
    and n.nspname='public'
    and con.confdeltype in ('a','r')
    and not c.relname='workspaces';
  if blocking_fks <> 0 then
    raise exception 'non-workspace auth-user foreign keys can still block deletion: %', blocking_fks;
  end if;
end
$$;

rollback;
