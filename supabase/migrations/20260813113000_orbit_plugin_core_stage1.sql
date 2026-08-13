-- Orbit Plugin Architecture v1 — Stage 1: Plugin Core
-- The registry is shared product metadata; installations and audit events are workspace-scoped.

create table if not exists public.plugin_catalog (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (char_length(name) between 2 and 80),
  short_description text not null check (char_length(short_description) between 8 and 240),
  developer_name text not null default 'Urava' check (char_length(developer_name) between 2 and 100),
  developer_url text,
  current_version text not null check (current_version ~ '^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][A-Za-z0-9.-]+)?$'),
  status text not null default 'draft' check (status in ('draft','published','deprecated')),
  verified boolean not null default false,
  first_party boolean not null default false,
  manifest jsonb not null check (jsonb_typeof(manifest) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.plugin_installations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  plugin_id uuid not null references public.plugin_catalog(id) on delete restrict,
  version text not null,
  status text not null default 'installed' check (status in ('installed','disabled','pending_connections','revoked')),
  granted_permissions text[] not null default '{}'::text[],
  configuration jsonb not null default '{}'::jsonb check (jsonb_typeof(configuration) = 'object'),
  installed_by uuid references auth.users(id) on delete set null,
  installed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, plugin_id)
);

create table if not exists public.plugin_installation_events (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  plugin_id uuid not null references public.plugin_catalog(id) on delete restrict,
  installation_id uuid references public.plugin_installations(id) on delete set null,
  event_type text not null check (event_type in (
    'installed','enabled','disabled','uninstalled','permissions_changed',
    'connection_bound','connection_unbound','tool_invoked','tool_denied','version_changed'
  )),
  actor_user_id uuid references auth.users(id) on delete set null,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  occurred_at timestamptz not null default now()
);

create index if not exists plugin_installations_workspace_status_idx
  on public.plugin_installations(workspace_id, status);
create index if not exists plugin_installations_plugin_idx
  on public.plugin_installations(plugin_id);
create index if not exists plugin_installation_events_workspace_time_idx
  on public.plugin_installation_events(workspace_id, occurred_at desc);
create index if not exists plugin_installation_events_plugin_idx
  on public.plugin_installation_events(plugin_id);
create index if not exists plugin_installation_events_installation_idx
  on public.plugin_installation_events(installation_id);

alter table public.plugin_catalog enable row level security;
alter table public.plugin_installations enable row level security;
alter table public.plugin_installation_events enable row level security;

revoke all on table public.plugin_catalog from anon, authenticated;
revoke all on table public.plugin_installations from anon, authenticated;
revoke all on table public.plugin_installation_events from anon, authenticated;

grant select on table public.plugin_catalog to authenticated;
grant select, insert, update, delete on table public.plugin_installations to authenticated;
grant select, insert on table public.plugin_installation_events to authenticated;
grant usage, select on sequence public.plugin_installation_events_id_seq to authenticated;

drop policy if exists plugin_catalog_select_published on public.plugin_catalog;
create policy plugin_catalog_select_published
  on public.plugin_catalog for select to authenticated
  using (status in ('published','deprecated'));

drop policy if exists plugin_installations_select_member on public.plugin_installations;
create policy plugin_installations_select_member
  on public.plugin_installations for select to authenticated
  using ((select private.is_workspace_member(plugin_installations.workspace_id)));

drop policy if exists plugin_installations_insert_admin on public.plugin_installations;
create policy plugin_installations_insert_admin
  on public.plugin_installations for insert to authenticated
  with check ((select private.is_workspace_admin(plugin_installations.workspace_id)));

drop policy if exists plugin_installations_update_admin on public.plugin_installations;
create policy plugin_installations_update_admin
  on public.plugin_installations for update to authenticated
  using ((select private.is_workspace_admin(plugin_installations.workspace_id)))
  with check ((select private.is_workspace_admin(plugin_installations.workspace_id)));

drop policy if exists plugin_installations_delete_admin on public.plugin_installations;
create policy plugin_installations_delete_admin
  on public.plugin_installations for delete to authenticated
  using ((select private.is_workspace_admin(plugin_installations.workspace_id)));

drop policy if exists plugin_events_select_member on public.plugin_installation_events;
create policy plugin_events_select_member
  on public.plugin_installation_events for select to authenticated
  using ((select private.is_workspace_member(plugin_installation_events.workspace_id)));

drop policy if exists plugin_events_insert_admin on public.plugin_installation_events;
create policy plugin_events_insert_admin
  on public.plugin_installation_events for insert to authenticated
  with check ((select private.is_workspace_admin(plugin_installation_events.workspace_id)));

create or replace function private.validate_plugin_installation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  catalog_version text;
  catalog_status text;
  catalog_manifest jsonb;
begin
  select current_version, status, manifest
    into catalog_version, catalog_status, catalog_manifest
  from public.plugin_catalog
  where id = new.plugin_id;

  if catalog_version is null then
    raise exception 'Plugin does not exist';
  end if;
  if catalog_status <> 'published' then
    raise exception 'Plugin is not installable';
  end if;
  if new.version <> catalog_version then
    raise exception 'Plugin version is not current';
  end if;
  if exists (
    select 1
    from unnest(new.granted_permissions) as granted(permission)
    where not ((catalog_manifest -> 'permissions') ? granted.permission)
  ) then
    raise exception 'Plugin permission is not declared by the manifest';
  end if;
  return new;
end;
$$;

revoke all on function private.validate_plugin_installation() from public;

create or replace trigger validate_plugin_installation_before_write
before insert or update of plugin_id, version, granted_permissions
on public.plugin_installations
for each row execute function private.validate_plugin_installation();

create or replace trigger plugin_catalog_set_updated_at
before update on public.plugin_catalog
for each row execute function private.set_updated_at();

create or replace trigger plugin_installations_set_updated_at
before update on public.plugin_installations
for each row execute function private.set_updated_at();

insert into public.plugin_catalog (
  slug, name, short_description, developer_name, developer_url,
  current_version, status, verified, first_party, manifest
) values
(
  'developer-control',
  'Developer Control',
  'GitHub and Vercel controls for repositories, releases, deployments and website operations.',
  'Urava',
  'https://orbit-two-delta.vercel.app',
  '1.0.0','published',true,true,
  '{"schema_version":"1","id":"developer-control","name":"Developer Control","version":"1.0.0","category":"Development","developer":{"name":"Urava"},"skills":[{"id":"release-control","name":"Release Control","description":"Inspect and control approved repository and deployment workflows."}],"apps":[{"provider":"github","required":true},{"provider":"vercel","required":true}],"workflows":[{"id":"ship-change","name":"Ship a change","description":"Move an approved code change from repository to deployment."}],"permissions":["workspace.read","integrations.read","github.repositories.read","github.repositories.write","vercel.deployments.read","vercel.deployments.write"],"orbit_modules":["website_manager","delivery","automation"]}'::jsonb
),
(
  'website-growth',
  'Website Growth',
  'Search visibility, traffic intelligence and conversion signals for websites managed by Orbit.',
  'Urava',
  'https://orbit-two-delta.vercel.app',
  '1.0.0','published',true,true,
  '{"schema_version":"1","id":"website-growth","name":"Website Growth","version":"1.0.0","category":"Growth","developer":{"name":"Urava"},"skills":[{"id":"seo-audit","name":"SEO Audit","description":"Review indexing, search visibility and traffic signals."}],"apps":[{"provider":"search_console","required":true},{"provider":"google_analytics","required":false}],"workflows":[{"id":"growth-review","name":"Growth Review","description":"Turn website search and traffic signals into next actions."}],"permissions":["workspace.read","integrations.read","search_console.read","analytics.read"],"orbit_modules":["website_manager","growth","evidence"]}'::jsonb
),
(
  'social-growth',
  'Social Growth',
  'A permissioned social publishing and lead-attribution layer for Meta channels.',
  'Urava',
  'https://orbit-two-delta.vercel.app',
  '1.0.0','published',true,true,
  '{"schema_version":"1","id":"social-growth","name":"Social Growth","version":"1.0.0","category":"Marketing","developer":{"name":"Urava"},"skills":[{"id":"social-ops","name":"Social Operations","description":"Coordinate approved social publishing and attribution."}],"apps":[{"provider":"meta","required":true}],"workflows":[{"id":"publish-measure","name":"Publish and measure","description":"Publish approved content and preserve campaign attribution."}],"permissions":["workspace.read","integrations.read","meta.assets.read","meta.content.write"],"orbit_modules":["publishing","growth","evidence"]}'::jsonb
),
(
  'professional-outreach',
  'Professional Outreach',
  'LinkedIn-oriented account connection, approved outreach workflows and lead attribution.',
  'Urava',
  'https://orbit-two-delta.vercel.app',
  '1.0.0','published',true,true,
  '{"schema_version":"1","id":"professional-outreach","name":"Professional Outreach","version":"1.0.0","category":"Sales","developer":{"name":"Urava"},"skills":[{"id":"professional-prospecting","name":"Professional Prospecting","description":"Use approved professional-network assets in sales workflows."}],"apps":[{"provider":"linkedin","required":true}],"workflows":[{"id":"prospect-to-lead","name":"Prospect to lead","description":"Preserve permissioned source attribution from prospecting to Lead Engine."}],"permissions":["workspace.read","integrations.read","linkedin.profile.read","linkedin.outreach.write"],"orbit_modules":["growth","sales_desk"]}'::jsonb
)
on conflict (slug) do update set
  name = excluded.name,
  short_description = excluded.short_description,
  developer_name = excluded.developer_name,
  developer_url = excluded.developer_url,
  current_version = excluded.current_version,
  status = excluded.status,
  verified = excluded.verified,
  first_party = excluded.first_party,
  manifest = excluded.manifest,
  updated_at = now();
