create table if not exists public.lead_source_assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  source_slug text not null check (source_slug = any (array['website','google','instagram','linkedin','facebook','youtube','referrals','cold-list']::text[])),
  asset_type text not null default 'account' check (asset_type = any (array['website','account','profile','page','business_profile','list','referral_program','link']::text[])),
  name text not null check (char_length(name) between 2 and 160),
  url text check (url is null or char_length(url) <= 1000),
  handle text check (handle is null or char_length(handle) <= 160),
  external_id text check (external_id is null or char_length(external_id) <= 300),
  status text not null default 'active' check (status = any (array['active','paused','disconnected']::text[])),
  tracking_status text not null default 'manual' check (tracking_status = any (array['connected','manual','unverified','error']::text[])),
  is_primary boolean not null default false,
  notes text check (notes is null or char_length(notes) <= 2000),
  last_synced_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id)
);

create unique index if not exists lead_source_assets_unique_url
  on public.lead_source_assets(workspace_id, source_slug, url)
  where url is not null;

create index if not exists lead_source_assets_workspace_source_idx
  on public.lead_source_assets(workspace_id, source_slug, status);

alter table public.lead_source_assets enable row level security;

drop policy if exists lead_source_assets_select_member on public.lead_source_assets;
create policy lead_source_assets_select_member on public.lead_source_assets
for select using ((select private.is_workspace_member(lead_source_assets.workspace_id)));

drop policy if exists lead_source_assets_insert_member on public.lead_source_assets;
create policy lead_source_assets_insert_member on public.lead_source_assets
for insert with check ((select private.is_workspace_member(lead_source_assets.workspace_id)));

drop policy if exists lead_source_assets_update_member on public.lead_source_assets;
create policy lead_source_assets_update_member on public.lead_source_assets
for update using ((select private.is_workspace_member(lead_source_assets.workspace_id)))
with check ((select private.is_workspace_member(lead_source_assets.workspace_id)));

drop policy if exists lead_source_assets_delete_admin on public.lead_source_assets;
create policy lead_source_assets_delete_admin on public.lead_source_assets
for delete using ((select private.is_workspace_admin(lead_source_assets.workspace_id)));

drop trigger if exists lead_source_assets_set_updated_at on public.lead_source_assets;
create trigger lead_source_assets_set_updated_at
before update on public.lead_source_assets
for each row execute function private.set_updated_at();

alter table public.leads add column if not exists source_asset_id uuid;

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'leads_source_asset_same_workspace'
  ) then
    alter table public.leads
      add constraint leads_source_asset_same_workspace
      foreign key (workspace_id, source_asset_id)
      references public.lead_source_assets(workspace_id, id)
      on delete set null;
  end if;
end $$;

comment on table public.lead_source_assets is 'Business-facing Lead Engine source assets such as websites, social accounts, Google profiles, lists and referral links.';
comment on column public.leads.source_asset_id is 'Optional managed source asset that produced this lead.';
