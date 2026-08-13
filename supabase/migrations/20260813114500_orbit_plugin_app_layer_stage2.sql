-- Orbit Plugin Architecture v1 — Stage 2: Universal App Layer
-- Plugins inherit provider authorization from Orbit Connect; no plugin stores provider secrets.

create table if not exists public.plugin_app_bindings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  installation_id uuid not null references public.plugin_installations(id) on delete cascade,
  plugin_id uuid not null references public.plugin_catalog(id) on delete restrict,
  provider text not null check (provider in ('github','vercel','google_search_console','google_analytics','meta','instagram','linkedin')),
  connection_id uuid not null references public.integration_connections(id) on delete cascade,
  asset_scope jsonb not null default '[]'::jsonb check (jsonb_typeof(asset_scope) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (installation_id, provider)
);

create index if not exists plugin_app_bindings_workspace_idx on public.plugin_app_bindings(workspace_id);
create index if not exists plugin_app_bindings_plugin_idx on public.plugin_app_bindings(plugin_id);
create index if not exists plugin_app_bindings_connection_idx on public.plugin_app_bindings(connection_id);

alter table public.plugin_app_bindings enable row level security;
revoke all on table public.plugin_app_bindings from anon, authenticated;
grant select on table public.plugin_app_bindings to authenticated;

drop policy if exists plugin_app_bindings_select_member on public.plugin_app_bindings;
create policy plugin_app_bindings_select_member
  on public.plugin_app_bindings for select to authenticated
  using ((select private.is_workspace_member(plugin_app_bindings.workspace_id)));

create or replace trigger plugin_app_bindings_set_updated_at
before update on public.plugin_app_bindings
for each row execute function private.set_updated_at();

-- Stage 1 used a short provider alias before the universal provider IDs were locked.
update public.plugin_catalog
set manifest = jsonb_set(manifest, '{apps,0,provider}', '"google_search_console"'::jsonb, false),
    updated_at = now()
where slug = 'website-growth'
  and manifest #>> '{apps,0,provider}' = 'search_console';

create or replace function private.refresh_plugin_connection_state(target_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Drop bindings that are no longer valid, approved, connected or installed.
  delete from public.plugin_app_bindings binding
  where binding.workspace_id = target_workspace_id
    and not exists (
      select 1
      from public.plugin_installations installation
      join public.plugin_catalog catalog on catalog.id = installation.plugin_id
      join public.integration_connections connection
        on connection.id = binding.connection_id
       and connection.workspace_id = installation.workspace_id
       and connection.provider = binding.provider
       and connection.status = 'connected'
      where installation.id = binding.installation_id
        and installation.workspace_id = target_workspace_id
        and installation.plugin_id = binding.plugin_id
        and installation.status <> 'revoked'
        and exists (
          select 1
          from jsonb_array_elements(coalesce(catalog.manifest -> 'apps', '[]'::jsonb)) app(value)
          where app.value ->> 'provider' = binding.provider
        )
    );

  -- Bind every installed plugin to the organisation-level connection it is allowed to use.
  insert into public.plugin_app_bindings (
    workspace_id, installation_id, plugin_id, provider, connection_id, asset_scope
  )
  select
    installation.workspace_id,
    installation.id,
    installation.plugin_id,
    app.value ->> 'provider',
    connection.id,
    coalesce(connection.selected_assets, '[]'::jsonb)
  from public.plugin_installations installation
  join public.plugin_catalog catalog on catalog.id = installation.plugin_id
  cross join lateral jsonb_array_elements(coalesce(catalog.manifest -> 'apps', '[]'::jsonb)) app(value)
  join public.integration_connections connection
    on connection.workspace_id = installation.workspace_id
   and connection.provider = app.value ->> 'provider'
   and connection.status = 'connected'
  where installation.workspace_id = target_workspace_id
    and installation.status <> 'revoked'
  on conflict (installation_id, provider) do update set
    connection_id = excluded.connection_id,
    plugin_id = excluded.plugin_id,
    workspace_id = excluded.workspace_id,
    asset_scope = excluded.asset_scope,
    updated_at = now();

  -- Required app availability drives only the ready/pending states. Disabled and revoked stay explicit.
  update public.plugin_installations installation
  set status = case
    when exists (
      select 1
      from public.plugin_catalog catalog
      cross join lateral jsonb_array_elements(coalesce(catalog.manifest -> 'apps', '[]'::jsonb)) app(value)
      where catalog.id = installation.plugin_id
        and coalesce((app.value ->> 'required')::boolean, true)
        and not exists (
          select 1
          from public.integration_connections connection
          where connection.workspace_id = installation.workspace_id
            and connection.provider = app.value ->> 'provider'
            and connection.status = 'connected'
        )
    ) then 'pending_connections'
    else 'installed'
  end,
  updated_at = now()
  where installation.workspace_id = target_workspace_id
    and installation.status in ('installed','pending_connections');
end;
$$;

revoke all on function private.refresh_plugin_connection_state(uuid) from public;

create or replace function private.refresh_plugin_connections_from_integration()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.refresh_plugin_connection_state(coalesce(new.workspace_id, old.workspace_id));
  return coalesce(new, old);
end;
$$;
revoke all on function private.refresh_plugin_connections_from_integration() from public;

drop trigger if exists integration_connections_refresh_plugins on public.integration_connections;
create trigger integration_connections_refresh_plugins
after insert or update of status, selected_assets, provider or delete
on public.integration_connections
for each row execute function private.refresh_plugin_connections_from_integration();

create or replace function private.refresh_plugin_connections_from_installation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if pg_trigger_depth() > 1 then
    return coalesce(new, old);
  end if;
  perform private.refresh_plugin_connection_state(coalesce(new.workspace_id, old.workspace_id));
  return coalesce(new, old);
end;
$$;
revoke all on function private.refresh_plugin_connections_from_installation() from public;

drop trigger if exists plugin_installations_refresh_connections on public.plugin_installations;
create trigger plugin_installations_refresh_connections
after insert or update of plugin_id, version, status
on public.plugin_installations
for each row execute function private.refresh_plugin_connections_from_installation();

-- Reconcile any installations created during Stage 1.
do $$
declare workspace_row record;
begin
  for workspace_row in select distinct workspace_id from public.plugin_installations loop
    perform private.refresh_plugin_connection_state(workspace_row.workspace_id);
  end loop;
end;
$$;
