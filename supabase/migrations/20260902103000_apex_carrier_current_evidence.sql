-- Carrier 360 needs both an append-only evidence history and an efficient current
-- strongest-value projection. This table is a derived cache; the provenance
-- ledger remains the audit history and source of reconstruction.

create table if not exists public.apex_carrier_field_current (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  carrier_id uuid not null,
  field_key text not null,
  field_value jsonb,
  source_type text not null,
  source_priority smallint not null,
  source_name text not null,
  source_reference text,
  source_date timestamptz,
  retrieved_at timestamptz not null,
  confidence smallint not null,
  verification_state text not null,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, carrier_id, field_key),
  constraint apex_carrier_field_current_carrier_fk
    foreign key (workspace_id, carrier_id)
    references public.apex_carriers(workspace_id, id)
    on delete cascade,
  constraint apex_carrier_field_current_source_type_check
    check (source_type in (
      'official_government',
      'verified_document',
      'carrier_verified',
      'apex_first_party',
      'company_website',
      'public_web',
      'inferred'
    )),
  constraint apex_carrier_field_current_priority_check
    check (source_priority between 1 and 7),
  constraint apex_carrier_field_current_confidence_check
    check (confidence between 0 and 100),
  constraint apex_carrier_field_current_state_check
    check (verification_state in (
      'verified',
      'carrier_filed',
      'carrier_confirmed',
      'derived',
      'inferred',
      'unverified',
      'unknown'
    ))
);

create index if not exists apex_carrier_field_current_carrier_idx
  on public.apex_carrier_field_current(workspace_id, carrier_id);

alter table public.apex_carrier_field_current enable row level security;
revoke all on table public.apex_carrier_field_current from anon, authenticated;
grant select, insert, update, delete on table public.apex_carrier_field_current to service_role;

comment on table public.apex_carrier_field_current is
  'Derived current strongest Carrier 360 field evidence. The append-only apex_carrier_field_provenance table remains the audit ledger.';
