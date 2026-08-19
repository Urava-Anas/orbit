begin;

do $$
declare
  missing integer;
  dangerous integer;
  anon_tables integer;
begin
  select count(*) into missing
  from (values
    ('foundry_level_resources_workspace_student_idx'),
    ('foundry_studio_assignments_project_id_idx'),
    ('integration_connections_connected_by_idx'),
    ('lead_source_assets_created_by_idx'),
    ('leads_workspace_source_asset_idx')
  ) required(index_name)
  where not exists (
    select 1 from pg_indexes where schemaname='public' and indexname=required.index_name
  );
  if missing <> 0 then raise exception 'production scale indexes missing: %', missing; end if;

  select count(*) into dangerous
  from information_schema.role_table_grants
  where table_schema='public'
    and grantee='authenticated'
    and privilege_type in ('TRUNCATE','TRIGGER','REFERENCES');
  if dangerous <> 0 then raise exception 'authenticated role still has maintenance privileges: %', dangerous; end if;

  select count(*) into anon_tables
  from information_schema.role_table_grants
  where table_schema='public' and grantee='anon';
  if anon_tables <> 0 then raise exception 'anonymous role still has direct table grants: %', anon_tables; end if;

  if has_function_privilege('authenticated', 'public.consume_orbit_rate_limit(text,text,integer,integer)', 'EXECUTE') then
    raise exception 'authenticated role can execute server rate limiter';
  end if;
  if not has_function_privilege('service_role', 'public.consume_orbit_rate_limit(text,text,integer,integer)', 'EXECUTE') then
    raise exception 'service role cannot execute server rate limiter';
  end if;
end
$$;

rollback;
