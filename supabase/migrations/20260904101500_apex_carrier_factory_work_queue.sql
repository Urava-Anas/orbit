-- Resumable enrichment queue for the Apex Carrier Intelligence Factory.
-- A daily factory run can over-collect candidates and process them in bounded
-- chunks rather than attempting 1,000 deep carrier lookups inside one request.

create table if not exists public.apex_carrier_factory_work_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  batch_id uuid not null,
  usdot_number text not null,
  discovery_score smallint not null default 0,
  priority integer not null default 0,
  status text not null default 'queued',
  candidate_payload jsonb not null default '{}'::jsonb,
  attempts integer not null default 0,
  max_attempts integer not null default 4,
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  carrier_id uuid,
  lead_id uuid,
  opportunity_score smallint,
  tier text,
  material_fingerprint text,
  dossier jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint apex_carrier_factory_work_items_workspace_id_id_key unique (workspace_id, id),
  constraint apex_carrier_factory_work_items_batch_fk
    foreign key (workspace_id, batch_id)
    references public.apex_carrier_factory_batches(workspace_id, id)
    on delete cascade,
  constraint apex_carrier_factory_work_items_carrier_fk
    foreign key (workspace_id, carrier_id)
    references public.apex_carriers(workspace_id, id)
    on delete set null,
  constraint apex_carrier_factory_work_items_lead_fk
    foreign key (workspace_id, lead_id)
    references public.leads(workspace_id, id)
    on delete set null,
  constraint apex_carrier_factory_work_items_usdot_check check (usdot_number ~ '^[0-9]+$'),
  constraint apex_carrier_factory_work_items_discovery_score_check check (discovery_score between 0 and 100),
  constraint apex_carrier_factory_work_items_attempts_check check (attempts >= 0 and max_attempts between 1 and 20),
  constraint apex_carrier_factory_work_items_status_check check (
    status in ('queued', 'enriching', 'ready', 'rejected', 'delivered', 'failed')
  ),
  constraint apex_carrier_factory_work_items_opportunity_score_check check (
    opportunity_score is null or opportunity_score between 0 and 100
  ),
  constraint apex_carrier_factory_work_items_tier_check check (tier is null or tier in ('A', 'B', 'C')),
  constraint apex_carrier_factory_work_items_payload_check check (jsonb_typeof(candidate_payload) = 'object'),
  constraint apex_carrier_factory_work_items_dossier_check check (dossier is null or jsonb_typeof(dossier) = 'object'),
  constraint apex_carrier_factory_work_items_batch_usdot_uq unique (workspace_id, batch_id, usdot_number)
);

create index if not exists apex_carrier_factory_work_claim_idx
  on public.apex_carrier_factory_work_items(
    workspace_id,
    batch_id,
    status,
    priority desc,
    discovery_score desc,
    available_at asc
  );

create index if not exists apex_carrier_factory_work_ready_idx
  on public.apex_carrier_factory_work_items(
    workspace_id,
    batch_id,
    status,
    opportunity_score desc nulls last,
    updated_at asc
  );

comment on table public.apex_carrier_factory_work_items is
  'Resumable per-USDOT enrichment queue. Discovery over-collects candidates; workers claim small chunks, enrich them through Carrier 360, and mark them ready/rejected without losing progress.';

create or replace function public.claim_apex_carrier_factory_work(
  p_workspace_id uuid,
  p_batch_id uuid,
  p_worker_id text,
  p_limit integer default 25
)
returns setof public.apex_carrier_factory_work_items
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_worker_id is null or length(trim(p_worker_id)) = 0 then
    raise exception 'worker id is required';
  end if;

  if p_limit < 1 or p_limit > 100 then
    raise exception 'claim limit must be between 1 and 100';
  end if;

  return query
  with candidates as (
    select wi.id
    from public.apex_carrier_factory_work_items wi
    where wi.workspace_id = p_workspace_id
      and wi.batch_id = p_batch_id
      and wi.status = 'queued'
      and wi.available_at <= now()
      and wi.attempts < wi.max_attempts
    order by wi.priority desc, wi.discovery_score desc, wi.available_at asc, wi.id
    for update skip locked
    limit p_limit
  )
  update public.apex_carrier_factory_work_items wi
  set status = 'enriching',
      attempts = wi.attempts + 1,
      locked_at = now(),
      locked_by = p_worker_id,
      updated_at = now()
  from candidates c
  where wi.id = c.id
  returning wi.*;
end;
$$;

create or replace function public.release_stale_apex_carrier_factory_work(
  p_workspace_id uuid,
  p_older_than interval default interval '15 minutes'
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  released_count integer;
begin
  update public.apex_carrier_factory_work_items
  set status = case when attempts >= max_attempts then 'failed' else 'queued' end,
      available_at = case
        when attempts >= max_attempts then available_at
        else now() + least(interval '30 minutes', interval '1 minute' * greatest(1, attempts * attempts))
      end,
      locked_at = null,
      locked_by = null,
      last_error = coalesce(last_error, 'Worker lease expired before completion.'),
      updated_at = now()
  where workspace_id = p_workspace_id
    and status = 'enriching'
    and locked_at < now() - p_older_than;

  get diagnostics released_count = row_count;
  return released_count;
end;
$$;

revoke all on function public.claim_apex_carrier_factory_work(uuid, uuid, text, integer) from public, anon, authenticated;
revoke all on function public.release_stale_apex_carrier_factory_work(uuid, interval) from public, anon, authenticated;
grant execute on function public.claim_apex_carrier_factory_work(uuid, uuid, text, integer) to service_role;
grant execute on function public.release_stale_apex_carrier_factory_work(uuid, interval) to service_role;

alter table public.apex_carrier_factory_work_items enable row level security;
revoke all on table public.apex_carrier_factory_work_items from anon, authenticated;
grant select, insert, update, delete on table public.apex_carrier_factory_work_items to service_role;
