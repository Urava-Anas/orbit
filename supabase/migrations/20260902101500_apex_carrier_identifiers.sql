-- Carrier identifiers must not assume one MC docket per USDOT entity.
-- Modern Motus can assign a distinct docket number to each new operating
-- authority, while legacy entities may retain multiple authorities on one docket.
-- Keep apex_carriers.dot_number/mc_number for compatibility/convenience, but use
-- this registry as the canonical many-to-one identifier mapping.

create table if not exists public.apex_carrier_identifiers (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  carrier_id uuid not null,
  identifier_type text not null,
  identifier_value text not null,
  is_primary boolean not null default false,
  status text not null default 'observed',
  source_name text not null,
  source_reference text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint apex_carrier_identifiers_workspace_id_id_key unique (workspace_id, id),
  constraint apex_carrier_identifiers_carrier_fk
    foreign key (workspace_id, carrier_id)
    references public.apex_carriers(workspace_id, id)
    on delete cascade,
  constraint apex_carrier_identifiers_type_check
    check (identifier_type in ('usdot', 'mc', 'ff', 'mx')),
  constraint apex_carrier_identifiers_value_check
    check (identifier_value ~ '^[0-9]{1,10}$'),
  constraint apex_carrier_identifiers_status_check
    check (status in ('observed', 'active', 'inactive', 'historical', 'unknown')),
  constraint apex_carrier_identifiers_identity_key
    unique (workspace_id, identifier_type, identifier_value)
);

create index if not exists apex_carrier_identifiers_carrier_idx
  on public.apex_carrier_identifiers(workspace_id, carrier_id, identifier_type, last_seen_at desc);

create unique index if not exists apex_carrier_identifiers_primary_type_uq
  on public.apex_carrier_identifiers(workspace_id, carrier_id, identifier_type)
  where is_primary = true;

-- Backfill existing convenience identifiers. DOT is canonical for the carrier
-- entity and is therefore primary. Existing MC is only marked primary as a
-- compatibility hint; later Motus ingestion may establish additional dockets.
insert into public.apex_carrier_identifiers (
  workspace_id,
  carrier_id,
  identifier_type,
  identifier_value,
  is_primary,
  status,
  source_name,
  source_reference
)
select
  workspace_id,
  id,
  'usdot',
  dot_number,
  true,
  'observed',
  'Apex carrier backfill',
  'apex_carriers.dot_number'
from public.apex_carriers
where dot_number is not null and dot_number ~ '^[0-9]{1,10}$'
on conflict (workspace_id, identifier_type, identifier_value) do nothing;

insert into public.apex_carrier_identifiers (
  workspace_id,
  carrier_id,
  identifier_type,
  identifier_value,
  is_primary,
  status,
  source_name,
  source_reference
)
select
  workspace_id,
  id,
  'mc',
  mc_number,
  true,
  'observed',
  'Apex carrier backfill',
  'apex_carriers.mc_number'
from public.apex_carriers
where mc_number is not null and mc_number ~ '^[0-9]{1,10}$'
on conflict (workspace_id, identifier_type, identifier_value) do nothing;

alter table public.apex_carrier_identifiers enable row level security;
revoke all on table public.apex_carrier_identifiers from anon, authenticated;
grant select, insert, update, delete on table public.apex_carrier_identifiers to service_role;

comment on table public.apex_carrier_identifiers is
  'Canonical many-to-one carrier identifier registry. Supports multiple MC/FF/MX dockets per USDOT entity under modern Motus while preserving legacy convenience columns.';
comment on column public.apex_carrier_identifiers.is_primary is
  'Display/convenience preference only; never assume non-primary dockets are invalid or inactive.';
