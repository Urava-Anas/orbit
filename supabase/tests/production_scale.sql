begin;

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  '90000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'orbit-scale@example.test',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Scale Test"}'::jsonb,
  now(),
  now()
);

insert into public.workspaces (id, name, slug, owner_id)
values (
  '91000000-0000-4000-8000-000000000001',
  'Orbit Scale Test',
  'orbit-scale-test',
  '90000000-0000-4000-8000-000000000001'
);

insert into public.workspace_members (workspace_id, user_id, role)
values (
  '91000000-0000-4000-8000-000000000001',
  '90000000-0000-4000-8000-000000000001',
  'owner'
);

insert into public.lead_source_assets (
  id, workspace_id, source_slug, asset_type, name, created_by
)
values (
  '92000000-0000-4000-8000-000000000001',
  '91000000-0000-4000-8000-000000000001',
  'google',
  'business_profile',
  'Scale Source',
  '90000000-0000-4000-8000-000000000001'
);

insert into public.leads (
  workspace_id,
  name,
  company,
  source,
  stage,
  lead_score,
  next_action,
  source_asset_id,
  created_by,
  created_at
)
select
  '91000000-0000-4000-8000-000000000001'::uuid,
  'Scale Lead ' || g,
  'Company ' || g,
  case g % 6
    when 0 then 'google'
    when 1 then 'website'
    when 2 then 'instagram'
    when 3 then 'linkedin'
    when 4 then 'facebook'
    else 'referral'
  end,
  case g % 8
    when 0 then 'new'
    when 1 then 'scored'
    when 2 then 'contacted'
    when 3 then 'interested'
    when 4 then 'qualified'
    when 5 then 'proposal'
    when 6 then 'won'
    else 'lost'
  end,
  (g % 101)::smallint,
  case when g % 3 = 0 then 'Follow up' else null end,
  '92000000-0000-4000-8000-000000000001'::uuid,
  '90000000-0000-4000-8000-000000000001'::uuid,
  now() - make_interval(secs => g)
from generate_series(1, 50000) as g;

analyze public.leads;

set local role authenticated;
select set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $$
declare
  started timestamptz;
  elapsed_ms numeric;
  summary jsonb;
  i integer;
begin
  started := clock_timestamp();
  for i in 1..10 loop
    summary := public.get_lead_engine_summary('91000000-0000-4000-8000-000000000001');
  end loop;
  elapsed_ms := extract(epoch from (clock_timestamp() - started)) * 1000;

  if (summary->>'total')::integer <> 50000 then
    raise exception 'lead scale summary returned wrong total: %', summary->>'total';
  end if;
  if jsonb_array_length(summary->'flow') <> 8 then
    raise exception 'lead scale summary returned invalid flow';
  end if;
  if elapsed_ms > 5000 then
    raise exception 'lead scale summary exceeded 500ms average over 10 runs: % ms total', elapsed_ms;
  end if;
end
$$;

reset role;
rollback;
