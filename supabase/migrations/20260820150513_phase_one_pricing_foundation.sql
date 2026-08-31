-- Phase One commercial source of truth.
-- Pricing is workspace-owned, versioned and policy-controlled. Proposal drafts
-- may reference a plan and preserve the exact pricing snapshot used at draft time.

create table if not exists public.pricing_plans (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  plan_key text not null,
  name text not null,
  service_category text not null,
  summary text not null default '',
  pricing_type text not null default 'fixed',
  base_price numeric(14,2),
  min_price numeric(14,2),
  max_price numeric(14,2),
  currency text not null default 'PKR',
  max_discount_percent numeric(5,2) not null default 0,
  installment_options jsonb not null default '[]'::jsonb,
  included_features jsonb not null default '[]'::jsonb,
  add_ons jsonb not null default '[]'::jsonb,
  offer_valid_days integer not null default 14,
  requires_approval boolean not null default false,
  status text not null default 'draft',
  version integer not null default 1,
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pricing_plans_workspace_id_id_key unique (workspace_id, id),
  constraint pricing_plans_workspace_key_key unique (workspace_id, plan_key),
  constraint pricing_plans_key_check check (plan_key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length(plan_key) between 2 and 80),
  constraint pricing_plans_name_check check (char_length(name) between 2 and 120),
  constraint pricing_plans_category_check check (char_length(service_category) between 2 and 80),
  constraint pricing_plans_summary_check check (char_length(summary) <= 2000),
  constraint pricing_plans_type_check check (pricing_type in ('fixed', 'range', 'custom')),
  constraint pricing_plans_currency_check check (currency in ('PKR','USD','GBP','EUR','AED','SAR')),
  constraint pricing_plans_discount_check check (max_discount_percent between 0 and 100),
  constraint pricing_plans_validity_check check (offer_valid_days between 1 and 365),
  constraint pricing_plans_version_check check (version >= 1),
  constraint pricing_plans_status_check check (status in ('draft', 'active', 'archived')),
  constraint pricing_plans_installments_array_check check (jsonb_typeof(installment_options) = 'array'),
  constraint pricing_plans_features_array_check check (jsonb_typeof(included_features) = 'array'),
  constraint pricing_plans_add_ons_array_check check (jsonb_typeof(add_ons) = 'array'),
  constraint pricing_plans_active_features_check check (
    status <> 'active' or jsonb_array_length(included_features) > 0
  ),
  constraint pricing_plans_price_shape_check check (
    (
      pricing_type = 'custom'
      and base_price is null
      and min_price is null
      and max_price is null
      and requires_approval = true
    )
    or
    (
      pricing_type = 'fixed'
      and base_price is not null
      and base_price >= 0
      and min_price = base_price
      and max_price = base_price
    )
    or
    (
      pricing_type = 'range'
      and min_price is not null
      and base_price is not null
      and max_price is not null
      and min_price >= 0
      and base_price between min_price and max_price
    )
  )
);

create table if not exists public.pricing_plan_versions (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  pricing_plan_id uuid not null,
  version integer not null,
  snapshot jsonb not null,
  changed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint pricing_plan_versions_plan_fk foreign key (workspace_id, pricing_plan_id)
    references public.pricing_plans(workspace_id, id) on delete restrict,
  constraint pricing_plan_versions_version_check check (version >= 1),
  constraint pricing_plan_versions_snapshot_check check (jsonb_typeof(snapshot) = 'object'),
  constraint pricing_plan_versions_plan_version_key unique (workspace_id, pricing_plan_id, version)
);

create index if not exists pricing_plans_workspace_status_idx
  on public.pricing_plans(workspace_id, status, updated_at desc);
create index if not exists pricing_plans_workspace_category_idx
  on public.pricing_plans(workspace_id, service_category, status);
create index if not exists pricing_plan_versions_plan_idx
  on public.pricing_plan_versions(workspace_id, pricing_plan_id, version desc);

create function private.capture_pricing_plan_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.pricing_plan_versions (
    workspace_id,
    pricing_plan_id,
    version,
    snapshot,
    changed_by
  ) values (
    new.workspace_id,
    new.id,
    new.version,
    jsonb_build_object(
      'planKey', new.plan_key,
      'name', new.name,
      'serviceCategory', new.service_category,
      'summary', new.summary,
      'pricingType', new.pricing_type,
      'basePrice', new.base_price,
      'minPrice', new.min_price,
      'maxPrice', new.max_price,
      'currency', new.currency,
      'maxDiscountPercent', new.max_discount_percent,
      'installmentOptions', new.installment_options,
      'includedFeatures', new.included_features,
      'addOns', new.add_ons,
      'offerValidDays', new.offer_valid_days,
      'requiresApproval', new.requires_approval,
      'status', new.status,
      'capturedAt', now()
    ),
    new.updated_by
  );
  return new;
end;
$$;

revoke execute on function private.capture_pricing_plan_version() from public, anon, authenticated;

create trigger pricing_plans_set_updated_at
before update on public.pricing_plans
for each row execute function private.set_updated_at();

create trigger pricing_plans_capture_audit
after insert or update or delete on public.pricing_plans
for each row execute function private.capture_audit_event();

create trigger pricing_plans_capture_version
after insert or update on public.pricing_plans
for each row execute function private.capture_pricing_plan_version();

alter table public.pricing_plans enable row level security;
alter table public.pricing_plan_versions enable row level security;

create policy pricing_plans_select_member on public.pricing_plans
for select to authenticated
using ((select private.is_workspace_member(workspace_id)));

create policy pricing_plans_insert_admin on public.pricing_plans
for insert to authenticated
with check ((select private.is_workspace_admin(workspace_id)));

create policy pricing_plans_update_admin on public.pricing_plans
for update to authenticated
using ((select private.is_workspace_admin(workspace_id)))
with check ((select private.is_workspace_admin(workspace_id)));

create policy pricing_plan_versions_select_member on public.pricing_plan_versions
for select to authenticated
using ((select private.is_workspace_member(workspace_id)));

revoke all on table public.pricing_plans from anon, authenticated;
grant select, insert, update on table public.pricing_plans to authenticated;
revoke all on table public.pricing_plan_versions from anon, authenticated;
grant select on table public.pricing_plan_versions to authenticated;

alter table public.orbit_proposal_drafts
  add column if not exists pricing_plan_id uuid,
  add column if not exists selected_price numeric(14,2),
  add column if not exists pricing_snapshot jsonb not null default '{}'::jsonb;

alter table public.orbit_proposal_drafts
  add constraint orbit_proposal_drafts_selected_price_check
    check (selected_price is null or selected_price between price_min and price_max),
  add constraint orbit_proposal_drafts_pricing_snapshot_check
    check (jsonb_typeof(pricing_snapshot) = 'object'),
  add constraint orbit_proposal_drafts_pricing_plan_fk
    foreign key (workspace_id, pricing_plan_id)
    references public.pricing_plans(workspace_id, id) on delete restrict;

create index if not exists orbit_proposal_drafts_pricing_plan_idx
  on public.orbit_proposal_drafts(workspace_id, pricing_plan_id)
  where pricing_plan_id is not null;

create function private.preserve_proposal_pricing_snapshot()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.pricing_plan_id is not null and new.pricing_plan_id is distinct from old.pricing_plan_id then
    raise exception 'Proposal pricing plan cannot change after selection.';
  end if;
  if old.selected_price is not null and new.selected_price is distinct from old.selected_price then
    raise exception 'Proposal selected price cannot change after selection.';
  end if;
  if old.pricing_snapshot <> '{}'::jsonb and new.pricing_snapshot is distinct from old.pricing_snapshot then
    raise exception 'Proposal pricing snapshot is immutable.';
  end if;
  return new;
end;
$$;

revoke execute on function private.preserve_proposal_pricing_snapshot() from public, anon, authenticated;

create trigger orbit_proposal_drafts_preserve_pricing_snapshot
before update on public.orbit_proposal_drafts
for each row execute function private.preserve_proposal_pricing_snapshot();

comment on table public.pricing_plans is
  'Workspace commercial truth used by proposals, messages and controlled sales automation.';
comment on table public.pricing_plan_versions is
  'Append-only commercial history for every pricing plan version.';
comment on column public.orbit_proposal_drafts.pricing_snapshot is
  'Immutable commercial snapshot captured when a proposal draft selects a pricing plan.';
