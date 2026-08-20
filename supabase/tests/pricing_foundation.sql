-- Phase One pricing acceptance test.
-- Verifies commercial bounds, append-only versions and archive-only retention.

begin;

do $$
declare
  w uuid;
  u uuid;
  plan_id uuid;
  version_count integer;
  invalid_custom_blocked boolean := false;
  stale_update_blocked boolean := false;
  delete_blocked boolean := false;
begin
  select id, owner_id into w, u
  from public.workspaces
  where name = 'Urava'
  order by created_at asc
  limit 1;

  if w is null or u is null then
    raise exception 'Urava workspace/owner missing';
  end if;

  insert into public.pricing_plans (
    workspace_id, plan_key, name, service_category, summary, pricing_type,
    base_price, min_price, max_price, currency, max_discount_percent,
    included_features, status, created_by, updated_by
  ) values (
    w, 'phase-one-test-plan', 'Phase One Test Plan', 'Website',
    'Acceptance-only pricing plan.', 'range', 60000, 50000, 75000,
    'PKR', 15, '["Conversion page","WhatsApp enquiry"]'::jsonb,
    'active', u, u
  ) returning id into plan_id;

  select count(*) into version_count
  from public.pricing_plan_versions
  where workspace_id = w and pricing_plan_id = plan_id and version = 1;
  if version_count <> 1 then
    raise exception 'Initial pricing version was not captured';
  end if;

  begin
    insert into public.pricing_plans (
      workspace_id, plan_key, name, service_category, pricing_type,
      requires_approval, status, created_by, updated_by
    ) values (
      w, 'invalid-custom-test-plan', 'Invalid Custom Plan', 'Automation',
      'custom', false, 'draft', u, u
    );
  exception when check_violation then
    invalid_custom_blocked := true;
  end;
  if not invalid_custom_blocked then
    raise exception 'Custom pricing without founder approval was accepted';
  end if;

  update public.pricing_plans
  set base_price = 65000, max_price = 80000, version = 2, updated_by = u
  where id = plan_id;

  select count(*) into version_count
  from public.pricing_plan_versions
  where workspace_id = w and pricing_plan_id = plan_id;
  if version_count <> 2 then
    raise exception 'Expected two pricing versions, found %', version_count;
  end if;

  begin
    update public.pricing_plans
    set summary = 'Stale unversioned update', updated_by = u
    where id = plan_id;
  exception when unique_violation then
    stale_update_blocked := true;
  end;
  if not stale_update_blocked then
    raise exception 'Unversioned pricing update was accepted';
  end if;

  begin
    delete from public.pricing_plans where id = plan_id;
  exception when foreign_key_violation then
    delete_blocked := true;
  end;
  if not delete_blocked then
    raise exception 'Pricing history could be deleted instead of archived';
  end if;

  if not (select relrowsecurity from pg_class where oid = 'public.pricing_plans'::regclass) then
    raise exception 'Pricing plans RLS is disabled';
  end if;
  if has_table_privilege('authenticated', 'public.pricing_plans', 'DELETE') then
    raise exception 'Authenticated role received pricing delete permission';
  end if;
end;
$$;

rollback;
select 'pricing foundation passed' as result;
