-- Synthetic fixtures only: this suite runs against the isolated CI database.
-- The transaction is always rolled back; these are not live carrier leads.
begin;

insert into public.workspaces (id,name,slug,owner_id) values
('93000000-0000-4000-8000-000000000001','Factory test A','factory-test-a','81000000-0000-4000-8000-000000000001'),
('93000000-0000-4000-8000-000000000002','Factory test B','factory-test-b','81000000-0000-4000-8000-000000000001');

insert into public.apex_carrier_factory_batches(id,workspace_id,batch_date,quota) values
('94000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','2026-09-01',1000),
('94000000-0000-4000-8000-000000000002','93000000-0000-4000-8000-000000000001','2026-09-02',1),
('94000000-0000-4000-8000-000000000003','93000000-0000-4000-8000-000000000002','2026-09-01',1),
('94000000-0000-4000-8000-000000000004','93000000-0000-4000-8000-000000000001','2026-09-03',2),
('94000000-0000-4000-8000-000000000005','93000000-0000-4000-8000-000000000001','2026-09-04',2);

insert into public.apex_carrier_factory_work_items(
 workspace_id,batch_id,usdot_number,status,opportunity_score,tier,material_fingerprint,dossier
)
select '93000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000001',
 (9000000+n)::text,'ready',85,'A','test:v1',
 '{"candidate":{"materialChangeKinds":[],"sourceUpdatedAt":"2026-09-01T00:00:00Z"}}'::jsonb
from generate_series(1,999) n;

do $$
declare r jsonb;
begin
  if has_function_privilege('anon','public.finalize_apex_carrier_factory_batch(uuid,uuid)','EXECUTE')
    or has_function_privilege('authenticated','public.finalize_apex_carrier_factory_batch(uuid,uuid)','EXECUTE') then
    raise exception 'Finalizer must be service-role-only';
  end if;
  if (select prosecdef from pg_proc where oid='public.finalize_apex_carrier_factory_batch(uuid,uuid)'::regprocedure) then
    raise exception 'Finalizer must not bypass RLS through SECURITY DEFINER';
  end if;
  r := public.finalize_apex_carrier_factory_batch('93000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000001');
  if r->>'status' <> 'waiting_for_more_ready' or (r->>'ready')::int <> 999 or (r->>'delivered')::int <> 0 then
    raise exception '999 ready rows must not produce 1000 deliveries: %',r;
  end if;
end $$;

insert into public.apex_carrier_factory_work_items(
 workspace_id,batch_id,usdot_number,status,opportunity_score,tier,material_fingerprint,dossier
)
select '93000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000001',
 (9000000+n)::text,'ready',70,'B','test:v1','{"candidate":{"materialChangeKinds":[]}}'::jsonb
from generate_series(1000,1001) n;

set local role service_role;
do $$
declare r jsonb; r2 jsonb; n integer; stamp timestamptz;
begin
  r := public.finalize_apex_carrier_factory_batch('93000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000001');
  if r->>'status' <> 'completed' or (r->>'delivered')::int <> 1000 or (r->>'ready')::int <> 1
    or (r#>>'{tierCounts,A}')::int <> 999 or (r#>>'{tierCounts,B}')::int <> 1 then
    raise exception 'Exact quota and tier counts must come from ledger: %',r;
  end if;
  select count(distinct usdot_number) into n from public.apex_carrier_lead_delivery_ledger
    where batch_id='94000000-0000-4000-8000-000000000001';
  if n <> 1000 then raise exception 'Expected 1000 unique ledger identities'; end if;
  select completed_at into stamp from public.apex_carrier_factory_batches where id='94000000-0000-4000-8000-000000000001';
  r2 := public.finalize_apex_carrier_factory_batch('93000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000001');
  if r <> r2 or stamp <> (select completed_at from public.apex_carrier_factory_batches where id='94000000-0000-4000-8000-000000000001') then
    raise exception 'Completed finalization must be idempotent';
  end if;
  begin
    perform public.finalize_apex_carrier_factory_batch('93000000-0000-4000-8000-000000000002','94000000-0000-4000-8000-000000000001');
    raise exception 'Wrong workspace unexpectedly finalized a batch';
  exception when raise_exception then
    if sqlerrm <> 'Carrier factory batch not found in this workspace' then raise; end if;
  end;
end $$;
reset role;

-- A second batch cannot count a skipped duplicate as delivered. Even a new
-- fingerprint requires an explicit material-change reason for lifetime re-entry.
insert into public.apex_carrier_factory_work_items(
 workspace_id,batch_id,usdot_number,status,opportunity_score,tier,material_fingerprint,dossier
) values
('93000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000002','9000001','ready',85,'A','test:v1','{"candidate":{"materialChangeKinds":[]}}'),
('93000000-0000-4000-8000-000000000002','94000000-0000-4000-8000-000000000003','9000001','ready',85,'A','test:v1','{"candidate":{"materialChangeKinds":[]}}');
do $$
declare r jsonb;
begin
  r := public.finalize_apex_carrier_factory_batch('93000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000002');
  if (r->>'delivered')::int <> 0 or (r->>'eligibleReady')::int <> 0 then raise exception 'Duplicate counted as delivered: %',r; end if;
  update public.apex_carrier_factory_work_items set material_fingerprint='test:v2'
    where batch_id='94000000-0000-4000-8000-000000000002';
  r := public.finalize_apex_carrier_factory_batch('93000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000002');
  if (r->>'delivered')::int <> 0 then raise exception 'Re-entry without change reason was accepted'; end if;
  update public.apex_carrier_factory_work_items set dossier='{"candidate":{"materialChangeKinds":["fleet"]}}'
    where batch_id='94000000-0000-4000-8000-000000000002';
  r := public.finalize_apex_carrier_factory_batch('93000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000002');
  if (r->>'delivered')::int <> 1 then raise exception 'Explicit changed version did not re-enter'; end if;
  if not exists (select 1 from public.apex_carrier_lead_delivery_ledger
    where batch_id='94000000-0000-4000-8000-000000000002' and not new_to_apex and previously_delivered_at is not null) then
    raise exception 'Re-entry history was lost';
  end if;
  r := public.finalize_apex_carrier_factory_batch('93000000-0000-4000-8000-000000000002','94000000-0000-4000-8000-000000000003');
  if (r->>'delivered')::int <> 1 then raise exception 'Another tenant delivery incorrectly suppressed this tenant'; end if;
end $$;

-- Simulate the old non-atomic finalizer stopping after its first ledger insert.
insert into public.apex_carrier_factory_work_items(
 workspace_id,batch_id,usdot_number,status,opportunity_score,tier,material_fingerprint,dossier
) select '93000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000004',
 (9100000+n)::text,'ready',85,'A','test:v1','{"candidate":{"materialChangeKinds":[]}}'::jsonb
from generate_series(1,2) n;
insert into public.apex_carrier_lead_delivery_ledger(
 workspace_id,batch_id,usdot_number,material_fingerprint,opportunity_score,tier,new_to_apex,dossier
) values ('93000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000004','9100001','test:v1',85,'A',true,'{"candidate":{}}');
do $$
declare r jsonb;
begin
  r := public.finalize_apex_carrier_factory_batch('93000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000004');
  if (r->>'delivered')::int <> 2 or (r->>'ready')::int <> 0 then raise exception 'Partial ledger recovery failed: %',r; end if;
end $$;

-- A failure after inserts but before queue settlement must roll back inserts.
insert into public.apex_carrier_factory_work_items(
 workspace_id,batch_id,usdot_number,status,opportunity_score,tier,material_fingerprint,dossier
) select '93000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000005',
 (9200000+n)::text,'ready',85,'A','test:v1','{"candidate":{"materialChangeKinds":[]}}'::jsonb
from generate_series(1,2) n;
create function pg_temp.fail_factory_settlement() returns trigger language plpgsql as $$
begin
  if new.batch_id='94000000-0000-4000-8000-000000000005' and new.status='delivered' then
    raise exception 'injected settlement failure';
  end if;
  return new;
end $$;
create trigger test_fail_factory_settlement before update on public.apex_carrier_factory_work_items
for each row execute function pg_temp.fail_factory_settlement();
do $$
begin
  begin
    perform public.finalize_apex_carrier_factory_batch('93000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000005');
    raise exception 'Expected injected failure';
  exception when raise_exception then
    if sqlerrm <> 'injected settlement failure' then raise; end if;
  end;
  if exists (select 1 from public.apex_carrier_lead_delivery_ledger where batch_id='94000000-0000-4000-8000-000000000005') then
    raise exception 'Failed transaction left partial delivery evidence';
  end if;
end $$;

rollback;
