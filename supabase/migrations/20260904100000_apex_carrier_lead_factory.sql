-- Apex Carrier Intelligence Factory v1
-- Persists the 1,000-lead/day delivery contract without creating a parallel CRM.
-- Canonical prospects remain public.leads + public.apex_carriers; this migration
-- adds the factory batch/duplicate/equipment evidence ledger around them.

insert into public.capabilities (capability_key, module_key, description, risk_level)
values
  ('carrier_intelligence.generate_leads', 'carrier_intelligence', 'Generate and rank carrier prospects from approved sources without contacting them.', 'green')
on conflict (capability_key) do update
set module_key = excluded.module_key,
    description = excluded.description,
    risk_level = excluded.risk_level;

insert into public.permission_bundle_capabilities (workspace_id, bundle_id, capability_key)
select pb.workspace_id, pb.id, 'carrier_intelligence.generate_leads'
from public.permission_bundles pb
join public.organisation_modules om
  on om.workspace_id = pb.workspace_id
 and om.module_key = 'carrier_intelligence'
 and om.status in ('enabled', 'pilot')
where pb.bundle_key in ('founder_administrator', 'operator')
on conflict do nothing;

create table if not exists public.apex_carrier_factory_batches (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  batch_date date not null,
  quota integer not null default 1000,
  candidates_scanned integer not null default 0,
  eligible_candidates integer not null default 0,
  deduped_candidates integer not null default 0,
  delivered_count integer not null default 0,
  tier_a_count integer not null default 0,
  tier_b_count integer not null default 0,
  tier_c_count integer not null default 0,
  status text not null default 'building',
  config jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint apex_carrier_factory_batches_workspace_date_uq unique (workspace_id, batch_date),
  constraint apex_carrier_factory_batches_quota_check check (quota > 0 and quota <= 10000),
  constraint apex_carrier_factory_batches_counts_check check (
    candidates_scanned >= 0
    and eligible_candidates >= 0
    and deduped_candidates >= 0
    and delivered_count >= 0
    and tier_a_count >= 0
    and tier_b_count >= 0
    and tier_c_count >= 0
    and delivered_count <= quota
    and tier_a_count + tier_b_count + tier_c_count = delivered_count
  ),
  constraint apex_carrier_factory_batches_status_check check (status in ('building', 'completed', 'partial', 'failed')),
  constraint apex_carrier_factory_batches_config_check check (jsonb_typeof(config) = 'object')
);

create index if not exists apex_carrier_factory_batches_status_idx
  on public.apex_carrier_factory_batches(workspace_id, status, batch_date desc);

create table if not exists public.apex_carrier_equipment_observations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  carrier_id uuid not null,
  vin text,
  vehicle_type text,
  make text,
  model text,
  model_year integer,
  body_class text,
  plate_number text,
  plate_state text,
  inspection_id text,
  observed_at timestamptz,
  source_name text not null,
  source_reference text,
  retrieved_at timestamptz not null default now(),
  confidence smallint not null default 100,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint apex_carrier_equipment_workspace_id_id_key unique (workspace_id, id),
  constraint apex_carrier_equipment_carrier_fk
    foreign key (workspace_id, carrier_id)
    references public.apex_carriers(workspace_id, id)
    on delete cascade,
  constraint apex_carrier_equipment_model_year_check check (model_year is null or model_year between 1900 and 2100),
  constraint apex_carrier_equipment_confidence_check check (confidence between 0 and 100),
  constraint apex_carrier_equipment_payload_check check (jsonb_typeof(raw_payload) = 'object')
);

create unique index if not exists apex_carrier_equipment_observation_dedupe_uq
  on public.apex_carrier_equipment_observations(
    workspace_id,
    carrier_id,
    coalesce(vin, ''),
    coalesce(inspection_id, ''),
    source_name
  );

create index if not exists apex_carrier_equipment_carrier_idx
  on public.apex_carrier_equipment_observations(workspace_id, carrier_id, observed_at desc nulls last, retrieved_at desc);

comment on table public.apex_carrier_equipment_observations is
  'Inspection/source-observed equipment. It must not be presented as the carrier complete declared fleet.';

create table if not exists public.apex_carrier_lead_delivery_ledger (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  batch_id uuid not null,
  carrier_id uuid,
  lead_id uuid,
  usdot_number text not null,
  material_fingerprint text not null,
  material_change_kinds text[] not null default '{}'::text[],
  opportunity_score smallint not null,
  tier text not null,
  new_to_apex boolean not null,
  previously_delivered_at timestamptz,
  source_freshness_at timestamptz,
  dossier jsonb not null default '{}'::jsonb,
  delivered_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint apex_carrier_lead_delivery_workspace_id_id_key unique (workspace_id, id),
  constraint apex_carrier_lead_delivery_batch_fk
    foreign key (workspace_id, batch_id)
    references public.apex_carrier_factory_batches(workspace_id, id)
    on delete cascade,
  constraint apex_carrier_lead_delivery_carrier_fk
    foreign key (workspace_id, carrier_id)
    references public.apex_carriers(workspace_id, id)
    on delete set null,
  constraint apex_carrier_lead_delivery_lead_fk
    foreign key (workspace_id, lead_id)
    references public.leads(workspace_id, id)
    on delete set null,
  constraint apex_carrier_lead_delivery_usdot_check check (usdot_number ~ '^[0-9]+$'),
  constraint apex_carrier_lead_delivery_score_check check (opportunity_score between 0 and 100),
  constraint apex_carrier_lead_delivery_tier_check check (tier in ('A', 'B', 'C')),
  constraint apex_carrier_lead_delivery_dossier_check check (jsonb_typeof(dossier) = 'object'),
  constraint apex_carrier_lead_delivery_material_uq unique (workspace_id, usdot_number, material_fingerprint)
);

create index if not exists apex_carrier_lead_delivery_daily_idx
  on public.apex_carrier_lead_delivery_ledger(workspace_id, delivered_at desc);
create index if not exists apex_carrier_lead_delivery_usdot_idx
  on public.apex_carrier_lead_delivery_ledger(workspace_id, usdot_number, delivered_at desc);
create index if not exists apex_carrier_lead_delivery_score_idx
  on public.apex_carrier_lead_delivery_ledger(workspace_id, tier, opportunity_score desc, delivered_at desc);

comment on table public.apex_carrier_lead_delivery_ledger is
  'Lifetime Apex carrier delivery ledger. Same USDOT + same material fingerprint cannot be delivered twice. A materially changed carrier may re-enter with a new fingerprint and explicit change reason.';

create or replace function public.apex_carrier_factory_can_deliver(
  p_workspace_id uuid,
  p_usdot_number text,
  p_material_fingerprint text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1
    from public.apex_carrier_lead_delivery_ledger l
    where l.workspace_id = p_workspace_id
      and l.usdot_number = regexp_replace(p_usdot_number, '[^0-9]', '', 'g')
      and l.material_fingerprint = p_material_fingerprint
  );
$$;

revoke all on function public.apex_carrier_factory_can_deliver(uuid, text, text) from public, anon, authenticated;
grant execute on function public.apex_carrier_factory_can_deliver(uuid, text, text) to service_role;

alter table public.apex_carrier_factory_batches enable row level security;
alter table public.apex_carrier_equipment_observations enable row level security;
alter table public.apex_carrier_lead_delivery_ledger enable row level security;

revoke all on table public.apex_carrier_factory_batches from anon, authenticated;
revoke all on table public.apex_carrier_equipment_observations from anon, authenticated;
revoke all on table public.apex_carrier_lead_delivery_ledger from anon, authenticated;

grant select, insert, update, delete on table public.apex_carrier_factory_batches to service_role;
grant select, insert, update, delete on table public.apex_carrier_equipment_observations to service_role;
grant select, insert, update, delete on table public.apex_carrier_lead_delivery_ledger to service_role;
