begin;

do $$
declare
  missing integer;
  meta_provider_constraint text;
  project_url_nullable text;
  project_external_ref_count integer;
  content_insert_policy text;
  proof_fk_definition text;
begin
  select count(*) into missing
  from (values
    ('pricing_plans'),
    ('pricing_plan_versions'),
    ('commercial_content_assets'),
    ('orbit_recommended_send_packs'),
    ('content_brand_profiles'),
    ('content_batches'),
    ('content_drafts'),
    ('content_review_events'),
    ('content_publications'),
    ('content_metric_snapshots'),
    ('content_learning_notes'),
    ('content_assets'),
    ('project_files'),
    ('apex_authorized_users'),
    ('apex_carriers'),
    ('apex_carrier_checks'),
    ('apex_loads'),
    ('apex_interactions'),
    ('apex_tasks'),
    ('apex_integrations'),
    ('apex_dispatch_events'),
    ('apex_integration_credentials')
  ) required(table_name)
  where to_regclass('public.' || required.table_name) is null;

  if missing <> 0 then
    raise exception 'recovered production tables missing after clean reset: %', missing;
  end if;

  if to_regprocedure('public.orbit_relay_get_credential(uuid)') is null then
    raise exception 'Relay credential getter is missing';
  end if;
  if has_function_privilege('authenticated', 'public.orbit_relay_get_credential(uuid)', 'EXECUTE') then
    raise exception 'authenticated role can execute Relay decrypted credential getter';
  end if;
  if not has_function_privilege('service_role', 'public.orbit_relay_get_credential(uuid)', 'EXECUTE') then
    raise exception 'service role cannot execute Relay credential getter';
  end if;

  if to_regprocedure('public.apex_service_get_integration_credential(uuid,text)') is null then
    raise exception 'Apex service integration credential getter is missing';
  end if;
  if has_function_privilege('authenticated', 'public.apex_service_get_integration_credential(uuid,text)', 'EXECUTE') then
    raise exception 'authenticated role can execute Apex integration secret getter';
  end if;
  if not has_function_privilege('service_role', 'public.apex_service_get_integration_credential(uuid,text)', 'EXECUTE') then
    raise exception 'service role cannot execute Apex integration secret getter';
  end if;

  select pg_get_constraintdef(c.oid)
    into meta_provider_constraint
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public'
    and t.relname = 'integration_oauth_states'
    and c.conname = 'integration_oauth_states_provider_check';

  if meta_provider_constraint is null or position('meta' in lower(meta_provider_constraint)) = 0 then
    raise exception 'Meta OAuth state provider support is missing';
  end if;

  select is_nullable
    into project_url_nullable
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'project_files'
    and column_name = 'url';

  if project_url_nullable is distinct from 'YES' then
    raise exception 'project_files.url must support connector-backed files without URLs';
  end if;

  select count(*) into project_external_ref_count
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'project_files'
    and column_name = 'external_ref';

  if project_external_ref_count <> 1 then
    raise exception 'project_files.external_ref is missing';
  end if;

  select with_check
    into content_insert_policy
  from pg_policies
  where schemaname = 'public'
    and tablename = 'content_drafts'
    and policyname = 'content_insert_member_draft_only';

  if content_insert_policy is null
     or position('draft' in lower(content_insert_policy)) = 0
     or position('review' in lower(content_insert_policy)) = 0
     or position('approved_by' in lower(content_insert_policy)) = 0 then
    raise exception 'content insert policy does not restrict members to unapproved draft/review states';
  end if;

  select pg_get_constraintdef(c.oid)
    into proof_fk_definition
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public'
    and t.relname = 'commercial_content_assets'
    and c.conname = 'commercial_content_assets_proof_fk';

  if proof_fk_definition is null
     or position('SET NULL (proof_id)' in proof_fk_definition) = 0 then
    raise exception 'commercial content proof deletion must null proof_id only';
  end if;
end
$$;

rollback;
