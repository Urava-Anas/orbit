-- Stage 3 scale hardening: cover plugin foreign keys used by audit and lifecycle queries.
create index if not exists plugin_installations_installed_by_idx
  on public.plugin_installations(installed_by)
  where installed_by is not null;

create index if not exists plugin_installation_events_actor_idx
  on public.plugin_installation_events(actor_user_id)
  where actor_user_id is not null;

create index if not exists plugin_tool_invocations_plugin_idx
  on public.plugin_tool_invocations(plugin_id);
