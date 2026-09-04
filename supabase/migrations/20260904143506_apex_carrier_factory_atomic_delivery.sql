-- Finalization must count persisted deliveries, not attempted upserts. Keep all
-- ledger writes, work-item settlement and batch completion in one transaction.
create or replace function public.finalize_apex_carrier_factory_batch(
  p_workspace_id uuid,
  p_batch_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  batch public.apex_carrier_factory_batches%rowtype;
  ready_ids uuid[];
  ready_count integer := 0;
  eligible_ready_count integer := 0;
  v_delivered_count integer;
  unique_count integer;
  tier_a integer;
  tier_b integer;
  tier_c integer;
  finished_at timestamptz := now();
begin
  -- Serialize finalizers across this workspace, including different batch dates.
  -- The lock is transaction-scoped and cannot survive a failed request.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('apex-carrier-delivery:' || p_workspace_id::text, 0)
  );

  select b.* into batch
  from public.apex_carrier_factory_batches b
  where b.workspace_id = p_workspace_id and b.id = p_batch_id
  for update;
  if not found then
    raise exception 'Carrier factory batch not found in this workspace';
  end if;

  select count(*), count(distinct l.usdot_number),
    count(*) filter (where l.tier = 'A'),
    count(*) filter (where l.tier = 'B'),
    count(*) filter (where l.tier = 'C')
  into v_delivered_count, unique_count, tier_a, tier_b, tier_c
  from public.apex_carrier_lead_delivery_ledger l
  where l.workspace_id = p_workspace_id and l.batch_id = p_batch_id;

  if v_delivered_count <> unique_count or v_delivered_count > batch.quota then
    raise exception 'Carrier factory ledger violates unique delivery quota';
  end if;

  -- Recover a response lost after a previous ledger write. Only this batch's
  -- matching persisted material version is evidence of delivery.
  update public.apex_carrier_factory_work_items wi
  set status = 'delivered', locked_by = null, locked_at = null,
      updated_at = finished_at
  from public.apex_carrier_lead_delivery_ledger l
  where wi.workspace_id = p_workspace_id and wi.batch_id = p_batch_id
    and l.workspace_id = wi.workspace_id and l.batch_id = wi.batch_id
    and l.usdot_number = wi.usdot_number
    and l.material_fingerprint = wi.material_fingerprint
    and wi.status = 'ready';

  if v_delivered_count < batch.quota then
    select coalesce(array_agg(candidate.id), '{}'::uuid[]) into ready_ids
    from (
      select wi.id
      from public.apex_carrier_factory_work_items wi
      where wi.workspace_id = p_workspace_id and wi.batch_id = p_batch_id
        and wi.status = 'ready'
        and wi.opportunity_score >= 50
        and wi.tier in ('A', 'B', 'C')
        and length(trim(wi.material_fingerprint)) > 0
        and jsonb_typeof(wi.dossier->'candidate') = 'object'
        and not exists (
          select 1 from public.apex_carrier_lead_delivery_ledger l
          where l.workspace_id = p_workspace_id and l.usdot_number = wi.usdot_number
            and (l.material_fingerprint = wi.material_fingerprint or l.batch_id = p_batch_id)
        )
        and (
          not exists (
            select 1 from public.apex_carrier_lead_delivery_ledger l
            where l.workspace_id = p_workspace_id and l.usdot_number = wi.usdot_number
          )
          or (
            case when jsonb_typeof(wi.dossier#>'{candidate,materialChangeKinds}') = 'array'
              then jsonb_array_length(wi.dossier#>'{candidate,materialChangeKinds}') > 0
                and not exists (
                  select 1 from jsonb_array_elements_text(wi.dossier#>'{candidate,materialChangeKinds}') k(kind)
                  where k.kind is null or k.kind not in ('authority','fleet','mcs150','equipment','contact','reactivation')
                )
              else false
            end
          )
        )
      order by wi.opportunity_score desc, wi.discovery_score desc, wi.id
      limit batch.quota - v_delivered_count
      for update of wi
    ) candidate;
    eligible_ready_count := cardinality(ready_ids);
    select count(*) into ready_count
    from public.apex_carrier_factory_work_items wi
    where wi.workspace_id = p_workspace_id and wi.batch_id = p_batch_id and wi.status = 'ready';

    if v_delivered_count + eligible_ready_count < batch.quota then
      update public.apex_carrier_factory_batches b
      set status = case when v_delivered_count > 0 then 'partial' else 'building' end,
          delivered_count = v_delivered_count,
          tier_a_count = tier_a, tier_b_count = tier_b, tier_c_count = tier_c,
          completed_at = null, updated_at = finished_at
      where b.workspace_id = p_workspace_id and b.id = p_batch_id;
      return jsonb_build_object(
        'status', 'waiting_for_more_ready', 'quota', batch.quota,
        'ready', ready_count, 'eligibleReady', eligible_ready_count, 'delivered', v_delivered_count,
        'tierCounts', jsonb_build_object('A',tier_a,'B',tier_b,'C',tier_c)
      );
    end if;

    insert into public.apex_carrier_lead_delivery_ledger (
      workspace_id,batch_id,carrier_id,lead_id,usdot_number,material_fingerprint,
      material_change_kinds,opportunity_score,tier,new_to_apex,
      previously_delivered_at,source_freshness_at,dossier,delivered_at
    )
    select wi.workspace_id,wi.batch_id,wi.carrier_id,wi.lead_id,wi.usdot_number,
      wi.material_fingerprint,
      case when jsonb_typeof(wi.dossier#>'{candidate,materialChangeKinds}') = 'array'
        then array(select jsonb_array_elements_text(wi.dossier#>'{candidate,materialChangeKinds}'))
        else '{}'::text[] end,
      wi.opportunity_score,wi.tier,
      not exists (
        select 1 from public.apex_carrier_lead_delivery_ledger l
        where l.workspace_id = p_workspace_id and l.usdot_number = wi.usdot_number
      ),
      (select max(l.delivered_at) from public.apex_carrier_lead_delivery_ledger l
       where l.workspace_id = p_workspace_id and l.usdot_number = wi.usdot_number),
      coalesce(nullif(wi.dossier#>>'{candidate,sourceUpdatedAt}',''),
               nullif(wi.dossier#>>'{candidate,mcs150UpdatedAt}',''))::timestamptz,
      wi.dossier,finished_at
    from public.apex_carrier_factory_work_items wi
    where wi.workspace_id = p_workspace_id and wi.batch_id = p_batch_id
      and wi.id = any(ready_ids) and wi.status = 'ready'
    on conflict (workspace_id,usdot_number,material_fingerprint) do nothing;

    select count(*),count(distinct l.usdot_number),
      count(*) filter (where l.tier = 'A'),
      count(*) filter (where l.tier = 'B'),
      count(*) filter (where l.tier = 'C')
    into v_delivered_count,unique_count,tier_a,tier_b,tier_c
    from public.apex_carrier_lead_delivery_ledger l
    where l.workspace_id = p_workspace_id and l.batch_id = p_batch_id;
    if v_delivered_count <> batch.quota or unique_count <> batch.quota then
      -- Roll back the whole call; never convert ignored duplicate inserts into
      -- delivered work items or a successful batch count.
      raise exception 'Carrier factory delivery count changed during finalization; retry safely';
    end if;

    update public.apex_carrier_factory_work_items wi
    set status = 'delivered',locked_by = null,locked_at = null,updated_at = finished_at
    from public.apex_carrier_lead_delivery_ledger l
    where wi.workspace_id = p_workspace_id and wi.batch_id = p_batch_id
      and wi.id = any(ready_ids) and wi.status = 'ready'
      and l.workspace_id = wi.workspace_id and l.batch_id = wi.batch_id
      and l.usdot_number = wi.usdot_number and l.material_fingerprint = wi.material_fingerprint;
  end if;

  update public.apex_carrier_factory_batches b
  set status = 'completed',delivered_count = v_delivered_count,
      tier_a_count = tier_a,tier_b_count = tier_b,tier_c_count = tier_c,
      completed_at = coalesce(b.completed_at,finished_at),updated_at = finished_at
  where b.workspace_id = p_workspace_id and b.id = p_batch_id;
  select count(*) into ready_count
  from public.apex_carrier_factory_work_items wi
  where wi.workspace_id = p_workspace_id and wi.batch_id = p_batch_id and wi.status = 'ready';
  return jsonb_build_object(
    'status','completed','quota',batch.quota,'ready',ready_count,'eligibleReady',0,'delivered',v_delivered_count,
    'tierCounts',jsonb_build_object('A',tier_a,'B',tier_b,'C',tier_c)
  );
end;
$$;

revoke all on function public.finalize_apex_carrier_factory_batch(uuid,uuid) from public,anon,authenticated;
grant execute on function public.finalize_apex_carrier_factory_batch(uuid,uuid) to service_role;
