begin;

do $$
declare
  missing integer;
  dangerous integer;
  anon_tables integer;
  lead_summary_definer boolean;
begin
  select count(*) into missing
  from (values
    ('foundry_level_resources_workspace_student_idx'),
    ('foundry_studio_assignments_project_id_idx'),
    ('integration_connections_connected_by_idx'),
    ('lead_source_assets_created_by_idx'),
    ('leads_workspace_source_asset_idx'),
    ('leads_workspace_source_idx'),
    ('leads_workspace_score_created_idx'),
    ('lead_activities_workspace_occurred_idx'),
    ('projects_workspace_status_idx'),
    ('orbit_external_actions_workspace_created_idx')
  ) required(index_name)
  where not exists (
    select 1 from pg_indexes where schemaname='public' and indexname=required.index_name
  );
  if missing <> 0 then raise exception 'production scale indexes missing: %', missing; end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname='private' and indexname='orbit_rate_limit_buckets_window_idx'
  ) then
    raise exception 'rate-limit retention index is missing';
  end if;

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

  if has_function_privilege('anon', 'public.create_foundry_class_journey_command(uuid,uuid,text,text,text,timestamptz,timestamptz,text,text,text,smallint)', 'EXECUTE') then
    raise exception 'anonymous role can execute class journey command';
  end if;
  if has_function_privilege('anon', 'public.create_foundry_task_assignment_journey_command(uuid,uuid,uuid,text,text,text,text,text,smallint,timestamptz,timestamptz,smallint)', 'EXECUTE') then
    raise exception 'anonymous role can execute task journey command';
  end if;
  if not has_function_privilege('anon', 'public.verify_foundry_certificate(uuid)', 'EXECUTE') then
    raise exception 'public certificate verification RPC is no longer available';
  end if;
  if not has_function_privilege('authenticated', 'public.get_lead_engine_summary(uuid)', 'EXECUTE') then
    raise exception 'authenticated members cannot execute lead engine summary';
  end if;

  select p.prosecdef into lead_summary_definer
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='get_lead_engine_summary'
    and pg_get_function_identity_arguments(p.oid)='p_workspace_id uuid';
  if coalesce(lead_summary_definer, true) then
    raise exception 'lead engine summary must run as SECURITY INVOKER';
  end if;
end
$$;

rollback;
