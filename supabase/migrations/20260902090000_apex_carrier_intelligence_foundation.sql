-- Orbit Carrier Intelligence / Apex first-tenant foundation.
--
-- This migration deliberately EXTENDS the existing Apex Control Center instead of
-- creating a parallel carrier CRM. The core data contract is designed around
-- zero paid carrier-data API dependencies, field-level provenance, and a strict
-- separation between official regulatory facts and Apex-derived risk decisions.

-- -----------------------------------------------------------------------------
-- 1. Register the reusable Orbit capability pack.
-- -----------------------------------------------------------------------------
insert into public.capabilities (capability_key, module_key, description, risk_level)
values
  ('carrier_intelligence.read', 'carrier_intelligence', 'View Carrier 360 profiles and carrier intelligence evidence.', 'green'),
  ('carrier_intelligence.research', 'carrier_intelligence', 'Research and enrich carrier profiles from approved public and first-party sources.', 'green'),
  ('carrier_intelligence.verify', 'carrier_intelligence', 'Verify authority, insurance, safety, identity, and freight credentials.', 'amber'),
  ('carrier_intelligence.approve', 'carrier_intelligence', 'Approve, hold, block, or reject a carrier for operational use.', 'red')
on conflict (capability_key) do update
set module_key = excluded.module_key,
    description = excluded.description,
    risk_level = excluded.risk_level;

-- Enable the bounded product only for Apex-like workspaces already present at
-- migration time. Future logistics tenants must explicitly enable the module.
insert into public.organisation_modules (
  workspace_id,
  module_key,
  status,
  config,
  enabled_at,
  enabled_by
)
select
  w.id,
  'carrier_intelligence',
  'pilot',
  '{"zero_paid_carrier_data":true,"first_tenant":"apex","source_priority_version":"v1"}'::jsonb,
  now(),
  w.owner_id
from public.workspaces w
where lower(w.name) like '%apex%'
   or lower(w.slug) like '%apex%'
on conflict (workspace_id, module_key) do update
set status = case
      when public.organisation_modules.status = 'disabled' then 'pilot'
      else public.organisation_modules.status
    end,
    config = public.organisation_modules.config || excluded.config,
    enabled_at = coalesce(public.organisation_modules.enabled_at, excluded.enabled_at);

-- Existing founder/admin bundles receive all carrier capabilities for Apex.
insert into public.permission_bundle_capabilities (workspace_id, bundle_id, capability_key)
select pb.workspace_id, pb.id, c.capability_key
from public.permission_bundles pb
join public.organisation_modules om
  on om.workspace_id = pb.workspace_id
 and om.module_key = 'carrier_intelligence'
 and om.status in ('enabled', 'pilot')
join public.capabilities c
  on c.module_key = 'carrier_intelligence'
where pb.bundle_key = 'founder_administrator'
on conflict do nothing;

-- Operators can research and verify but cannot make the RED carrier approval decision.
insert into public.permission_bundle_capabilities (workspace_id, bundle_id, capability_key)
select pb.workspace_id, pb.id, capability.capability_key
from public.permission_bundles pb
join public.organisation_modules om
  on om.workspace_id = pb.workspace_id
 and om.module_key = 'carrier_intelligence'
 and om.status in ('enabled', 'pilot')
cross join (
  values
    ('carrier_intelligence.read'),
    ('carrier_intelligence.research'),
    ('carrier_intelligence.verify')
) as capability(capability_key)
where pb.bundle_key = 'operator'
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- 2. Extend the canonical Apex carrier entity rather than duplicating it.
-- -----------------------------------------------------------------------------
alter table public.apex_carriers
  add column if not exists lead_id uuid,
  add column if not exists officer_name text,
  add column if not exists officer_title text,
  add column if not exists cell_phone text,
  add column if not exists website_url text,
  add column if not exists social_profiles jsonb not null default '{}'::jsonb,
  add column if not exists physical_address text,
  add column if not exists city text,
  add column if not exists postal_code text,
  add column if not exists drivers integer,
  add column if not exists power_units integer,
  add column if not exists trailers integer,
  add column if not exists operating_classification text[] not null default '{}'::text[],
  add column if not exists cargo_types text[] not null default '{}'::text[],
  add column if not exists hazmat_declared boolean,
  add column if not exists hmsp_status text not null default 'unknown',
  add column if not exists authority_status text,
  add column if not exists authority_granted_at date,
  add column if not exists insurance_status text,
  add column if not exists apex_risk_score smallint,
  add column if not exists vetting_decision text not null default 'unassessed',
  add column if not exists data_freshness_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.apex_carriers'::regclass
      and conname = 'apex_carriers_workspace_id_id_key'
  ) then
    alter table public.apex_carriers
      add constraint apex_carriers_workspace_id_id_key unique (workspace_id, id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.apex_carriers'::regclass
      and conname = 'apex_carriers_lead_fk'
  ) then
    alter table public.apex_carriers
      add constraint apex_carriers_lead_fk
      foreign key (workspace_id, lead_id)
      references public.leads(workspace_id, id)
      on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.apex_carriers'::regclass
      and conname = 'apex_carriers_social_profiles_object_check'
  ) then
    alter table public.apex_carriers
      add constraint apex_carriers_social_profiles_object_check
      check (jsonb_typeof(social_profiles) = 'object');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.apex_carriers'::regclass
      and conname = 'apex_carriers_nonnegative_fleet_check'
  ) then
    alter table public.apex_carriers
      add constraint apex_carriers_nonnegative_fleet_check
      check (
        (drivers is null or drivers >= 0)
        and (power_units is null or power_units >= 0)
        and (trailers is null or trailers >= 0)
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.apex_carriers'::regclass
      and conname = 'apex_carriers_hmsp_status_check'
  ) then
    alter table public.apex_carriers
      add constraint apex_carriers_hmsp_status_check
      check (hmsp_status in ('unknown', 'active', 'inactive', 'not_required'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.apex_carriers'::regclass
      and conname = 'apex_carriers_risk_score_check'
  ) then
    alter table public.apex_carriers
      add constraint apex_carriers_risk_score_check
      check (apex_risk_score is null or apex_risk_score between 0 and 100);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.apex_carriers'::regclass
      and conname = 'apex_carriers_vetting_decision_check'
  ) then
    alter table public.apex_carriers
      add constraint apex_carriers_vetting_decision_check
      check (vetting_decision in ('unassessed', 'approved', 'review', 'hold', 'reject'));
  end if;
end $$;

create unique index if not exists apex_carriers_workspace_lead_uq
  on public.apex_carriers(workspace_id, lead_id)
  where lead_id is not null;

create index if not exists apex_carriers_workspace_decision_idx
  on public.apex_carriers(workspace_id, vetting_decision, apex_risk_score);

create index if not exists apex_carriers_workspace_freshness_idx
  on public.apex_carriers(workspace_id, data_freshness_at desc nulls last);

comment on column public.apex_carriers.lead_id is
  'Optional link to the canonical Orbit Lead Engine record. Carrier Intelligence extends Leads; it does not replace them.';
comment on column public.apex_carriers.power_units is
  'Filed/verified power-unit count. Do not assume this equals real-time dispatch availability.';
comment on column public.apex_carriers.trailers is
  'Filed or carrier-confirmed trailer/equipment count. Provenance determines whether this is regulatory, verified, or self-reported.';
comment on column public.apex_carriers.apex_risk_score is
  'Apex-derived operational vetting score. This is never an FMCSA safety score.';
comment on column public.apex_carriers.data_freshness_at is
  'Timestamp representing the freshest material Carrier 360 source used for the normalized summary.';

-- -----------------------------------------------------------------------------
-- 3. Store current and historical authority facts from official sources.
-- -----------------------------------------------------------------------------
create table if not exists public.apex_carrier_authorities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  carrier_id uuid not null,
  docket_number text,
  authority_type text not null,
  status text not null,
  granted_at date,
  effective_at date,
  revoked_at date,
  source_name text not null,
  source_reference text,
  source_date timestamptz,
  retrieved_at timestamptz not null default now(),
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint apex_carrier_authorities_workspace_id_id_key unique (workspace_id, id),
  constraint apex_carrier_authorities_carrier_fk
    foreign key (workspace_id, carrier_id)
    references public.apex_carriers(workspace_id, id)
    on delete cascade,
  constraint apex_carrier_authorities_payload_check
    check (jsonb_typeof(raw_payload) = 'object')
);

create index if not exists apex_carrier_authorities_carrier_idx
  on public.apex_carrier_authorities(workspace_id, carrier_id, retrieved_at desc);
create index if not exists apex_carrier_authorities_docket_idx
  on public.apex_carrier_authorities(workspace_id, docket_number)
  where docket_number is not null;

-- -----------------------------------------------------------------------------
-- 4. Regulatory insurance filings. Commercial COI evidence is deliberately
-- separate and belongs in the later Credential Vault.
-- -----------------------------------------------------------------------------
create table if not exists public.apex_carrier_insurance_filings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  carrier_id uuid not null,
  filing_type text,
  insurer_name text,
  policy_number text,
  required_amount numeric(14,2),
  coverage_amount numeric(14,2),
  status text not null default 'unknown',
  effective_at date,
  cancellation_at date,
  source_name text not null,
  source_reference text,
  source_date timestamptz,
  retrieved_at timestamptz not null default now(),
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint apex_carrier_insurance_workspace_id_id_key unique (workspace_id, id),
  constraint apex_carrier_insurance_carrier_fk
    foreign key (workspace_id, carrier_id)
    references public.apex_carriers(workspace_id, id)
    on delete cascade,
  constraint apex_carrier_insurance_amount_check
    check (
      (required_amount is null or required_amount >= 0)
      and (coverage_amount is null or coverage_amount >= 0)
    ),
  constraint apex_carrier_insurance_payload_check
    check (jsonb_typeof(raw_payload) = 'object')
);

create index if not exists apex_carrier_insurance_carrier_idx
  on public.apex_carrier_insurance_filings(workspace_id, carrier_id, retrieved_at desc);
create index if not exists apex_carrier_insurance_status_idx
  on public.apex_carrier_insurance_filings(workspace_id, status, cancellation_at);

-- -----------------------------------------------------------------------------
-- 5. Point-in-time public safety snapshots. Keeping snapshots preserves the
-- difference between source facts and Apex's later interpretation.
-- -----------------------------------------------------------------------------
create table if not exists public.apex_carrier_safety_snapshots (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  carrier_id uuid not null,
  safety_rating text,
  allowed_to_operate boolean,
  total_inspections integer,
  vehicle_inspections integer,
  driver_inspections integer,
  hazmat_inspections integer,
  vehicle_oos_count integer,
  driver_oos_count integer,
  hazmat_oos_count integer,
  vehicle_oos_percent numeric(6,3),
  driver_oos_percent numeric(6,3),
  hazmat_oos_percent numeric(6,3),
  total_violations integer,
  total_crashes integer,
  fatal_crashes integer,
  injury_crashes integer,
  towaway_crashes integer,
  public_sms jsonb not null default '{}'::jsonb,
  source_name text not null,
  source_reference text,
  source_date timestamptz,
  retrieved_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint apex_carrier_safety_workspace_id_id_key unique (workspace_id, id),
  constraint apex_carrier_safety_carrier_fk
    foreign key (workspace_id, carrier_id)
    references public.apex_carriers(workspace_id, id)
    on delete cascade,
  constraint apex_carrier_safety_counts_check
    check (
      (total_inspections is null or total_inspections >= 0)
      and (vehicle_inspections is null or vehicle_inspections >= 0)
      and (driver_inspections is null or driver_inspections >= 0)
      and (hazmat_inspections is null or hazmat_inspections >= 0)
      and (vehicle_oos_count is null or vehicle_oos_count >= 0)
      and (driver_oos_count is null or driver_oos_count >= 0)
      and (hazmat_oos_count is null or hazmat_oos_count >= 0)
      and (total_violations is null or total_violations >= 0)
      and (total_crashes is null or total_crashes >= 0)
      and (fatal_crashes is null or fatal_crashes >= 0)
      and (injury_crashes is null or injury_crashes >= 0)
      and (towaway_crashes is null or towaway_crashes >= 0)
    ),
  constraint apex_carrier_safety_percent_check
    check (
      (vehicle_oos_percent is null or vehicle_oos_percent between 0 and 100)
      and (driver_oos_percent is null or driver_oos_percent between 0 and 100)
      and (hazmat_oos_percent is null or hazmat_oos_percent between 0 and 100)
    ),
  constraint apex_carrier_safety_sms_object_check
    check (jsonb_typeof(public_sms) = 'object')
);

create index if not exists apex_carrier_safety_carrier_idx
  on public.apex_carrier_safety_snapshots(workspace_id, carrier_id, source_date desc nulls last, retrieved_at desc);

-- -----------------------------------------------------------------------------
-- 6. Relevant raw source records only. This is a thin index/cache, not a mirror
-- of the complete national FMCSA history.
-- -----------------------------------------------------------------------------
create table if not exists public.apex_carrier_source_records (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  carrier_id uuid not null,
  source_key text not null,
  external_record_id text not null default '',
  payload_hash text not null,
  source_updated_at timestamptz,
  payload jsonb not null,
  retrieved_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint apex_carrier_source_records_workspace_id_id_key unique (workspace_id, id),
  constraint apex_carrier_source_records_carrier_fk
    foreign key (workspace_id, carrier_id)
    references public.apex_carriers(workspace_id, id)
    on delete cascade,
  constraint apex_carrier_source_records_payload_check
    check (jsonb_typeof(payload) in ('object', 'array')),
  constraint apex_carrier_source_records_idempotency_key
    unique (workspace_id, carrier_id, source_key, external_record_id, payload_hash)
);

create index if not exists apex_carrier_source_records_carrier_idx
  on public.apex_carrier_source_records(workspace_id, carrier_id, source_key, retrieved_at desc);

-- -----------------------------------------------------------------------------
-- 7. Field-level provenance. No lower-priority source should silently overwrite
-- a stronger fact; application merge rules use source_priority 1..7.
-- -----------------------------------------------------------------------------
create table if not exists public.apex_carrier_field_provenance (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  carrier_id uuid not null,
  field_key text not null,
  field_value jsonb,
  previous_value jsonb,
  source_type text not null,
  source_priority smallint not null,
  source_name text not null,
  source_reference text,
  source_date timestamptz,
  retrieved_at timestamptz not null default now(),
  confidence smallint not null default 100,
  verification_state text not null default 'unverified',
  created_at timestamptz not null default now(),
  constraint apex_carrier_provenance_workspace_id_id_key unique (workspace_id, id),
  constraint apex_carrier_provenance_carrier_fk
    foreign key (workspace_id, carrier_id)
    references public.apex_carriers(workspace_id, id)
    on delete cascade,
  constraint apex_carrier_provenance_source_type_check
    check (source_type in (
      'official_government',
      'verified_document',
      'carrier_verified',
      'apex_first_party',
      'company_website',
      'public_web',
      'inferred'
    )),
  constraint apex_carrier_provenance_priority_check check (source_priority between 1 and 7),
  constraint apex_carrier_provenance_confidence_check check (confidence between 0 and 100),
  constraint apex_carrier_provenance_state_check
    check (verification_state in ('verified', 'carrier_filed', 'carrier_confirmed', 'derived', 'inferred', 'unverified', 'unknown'))
);

create index if not exists apex_carrier_provenance_field_idx
  on public.apex_carrier_field_provenance(workspace_id, carrier_id, field_key, source_priority, retrieved_at desc);

-- -----------------------------------------------------------------------------
-- 8. Apex-derived risk assessments remain explicitly separate from official
-- safety/regulatory facts.
-- -----------------------------------------------------------------------------
create table if not exists public.apex_carrier_risk_assessments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  carrier_id uuid not null,
  score smallint not null,
  decision text not null,
  reasons jsonb not null default '[]'::jsonb,
  evidence_snapshot jsonb not null default '{}'::jsonb,
  scoring_version text not null,
  assessed_by uuid references auth.users(id) on delete set null,
  assessed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint apex_carrier_risk_workspace_id_id_key unique (workspace_id, id),
  constraint apex_carrier_risk_carrier_fk
    foreign key (workspace_id, carrier_id)
    references public.apex_carriers(workspace_id, id)
    on delete cascade,
  constraint apex_carrier_risk_score_check check (score between 0 and 100),
  constraint apex_carrier_risk_decision_check check (decision in ('approved', 'review', 'hold', 'reject')),
  constraint apex_carrier_risk_reasons_check check (jsonb_typeof(reasons) = 'array'),
  constraint apex_carrier_risk_evidence_check check (jsonb_typeof(evidence_snapshot) = 'object')
);

create index if not exists apex_carrier_risk_carrier_idx
  on public.apex_carrier_risk_assessments(workspace_id, carrier_id, assessed_at desc);
create index if not exists apex_carrier_risk_decision_idx
  on public.apex_carrier_risk_assessments(workspace_id, decision, score);

-- -----------------------------------------------------------------------------
-- 9. Server-only data boundary, consistent with existing Apex Control Center.
-- Trusted Orbit server actions/service-role code mediate access in Phase 1.
-- -----------------------------------------------------------------------------
alter table public.apex_carrier_authorities enable row level security;
alter table public.apex_carrier_insurance_filings enable row level security;
alter table public.apex_carrier_safety_snapshots enable row level security;
alter table public.apex_carrier_source_records enable row level security;
alter table public.apex_carrier_field_provenance enable row level security;
alter table public.apex_carrier_risk_assessments enable row level security;

revoke all on table public.apex_carrier_authorities from anon, authenticated;
revoke all on table public.apex_carrier_insurance_filings from anon, authenticated;
revoke all on table public.apex_carrier_safety_snapshots from anon, authenticated;
revoke all on table public.apex_carrier_source_records from anon, authenticated;
revoke all on table public.apex_carrier_field_provenance from anon, authenticated;
revoke all on table public.apex_carrier_risk_assessments from anon, authenticated;

grant select, insert, update, delete on table public.apex_carrier_authorities to service_role;
grant select, insert, update, delete on table public.apex_carrier_insurance_filings to service_role;
grant select, insert, update, delete on table public.apex_carrier_safety_snapshots to service_role;
grant select, insert, update, delete on table public.apex_carrier_source_records to service_role;
grant select, insert, update, delete on table public.apex_carrier_field_provenance to service_role;
grant select, insert, update, delete on table public.apex_carrier_risk_assessments to service_role;

comment on table public.apex_carrier_field_provenance is
  'Field-level evidence ledger for Carrier 360. Source priority v1: government, verified document, carrier verified, Apex first-party, company website, public web, inferred.';
comment on table public.apex_carrier_risk_assessments is
  'Apex operational vetting decisions. Never present this score as an FMCSA safety score or regulatory determination.';
comment on table public.apex_carrier_source_records is
  'Thin source cache for relevant carriers only; deliberately not a full national FMCSA mirror.';