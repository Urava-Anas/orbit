begin;

do $$
declare
  table_name text;
  rls_enabled boolean;
  quota_definer boolean;
begin
  foreach table_name in array array[
    'apex_carrier_authorities',
    'apex_carrier_insurance_filings',
    'apex_carrier_safety_snapshots',
    'apex_carrier_source_records',
    'apex_carrier_field_provenance',
    'apex_carrier_risk_assessments',
    'apex_carrier_identifiers',
    'apex_carrier_field_current',
    'apex_carrier_lookup_quota'
  ] loop
    select c.relrowsecurity
      into rls_enabled
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = table_name;

    if coalesce(rls_enabled, false) = false then
      raise exception 'Carrier Intelligence table % must have RLS enabled', table_name;
    end if;

    if has_table_privilege('anon', format('public.%I', table_name), 'SELECT') then
      raise exception 'anon can read server-only Carrier Intelligence table %', table_name;
    end if;

    if has_table_privilege('authenticated', format('public.%I', table_name), 'SELECT') then
      raise exception 'authenticated clients can directly read server-only Carrier Intelligence table %', table_name;
    end if;
  end loop;

  if has_function_privilege(
    'anon',
    'public.consume_apex_carrier_lookup_quota(uuid,integer,integer)',
    'EXECUTE'
  ) then
    raise exception 'anonymous callers can consume Carrier 360 lookup quota';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.consume_apex_carrier_lookup_quota(uuid,integer,integer)',
    'EXECUTE'
  ) then
    raise exception 'authenticated Orbit members cannot consume Carrier 360 lookup quota';
  end if;

  select p.prosecdef
    into quota_definer
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'consume_apex_carrier_lookup_quota'
    and pg_get_function_identity_arguments(p.oid) =
      'p_workspace_id uuid, p_limit integer, p_window_seconds integer';

  if coalesce(quota_definer, false) = false then
    raise exception 'Carrier 360 lookup quota must be SECURITY DEFINER to enforce auth.uid membership internally';
  end if;

  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'apex_carrier_identifiers'
      and c.conname = 'apex_carrier_identifiers_identity_key'
      and c.contype = 'u'
  ) then
    raise exception 'carrier regulatory identifier uniqueness constraint missing';
  end if;

  if not exists (
    select 1 from public.capabilities
    where capability_key = 'carrier_intelligence.approve'
      and risk_level = 'red'
  ) then
    raise exception 'carrier approval must remain a RED capability';
  end if;

  if not exists (
    select 1 from public.capabilities
    where capability_key = 'carrier_intelligence.research'
      and risk_level = 'green'
  ) then
    raise exception 'carrier research capability missing or incorrectly classified';
  end if;
end
$$;

rollback;
