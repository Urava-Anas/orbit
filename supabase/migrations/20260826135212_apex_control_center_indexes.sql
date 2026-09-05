create unique index if not exists apex_carriers_workspace_mc_uq
  on public.apex_carriers(workspace_id, mc_number)
  where mc_number is not null and mc_number <> '';

create unique index if not exists apex_carriers_workspace_dot_uq
  on public.apex_carriers(workspace_id, dot_number)
  where dot_number is not null and dot_number <> '';

create index if not exists apex_carriers_workspace_status_idx
  on public.apex_carriers(workspace_id, status);

create index if not exists apex_carrier_checks_carrier_idx
  on public.apex_carrier_checks(carrier_id, checked_at desc);
create index if not exists apex_carrier_checks_workspace_idx
  on public.apex_carrier_checks(workspace_id);

create index if not exists apex_loads_carrier_idx
  on public.apex_loads(carrier_id);
create index if not exists apex_loads_workspace_status_idx
  on public.apex_loads(workspace_id, status);

create index if not exists apex_interactions_carrier_idx
  on public.apex_interactions(carrier_id, happened_at desc);
create index if not exists apex_interactions_workspace_idx
  on public.apex_interactions(workspace_id);

create index if not exists apex_tasks_workspace_status_idx
  on public.apex_tasks(workspace_id, status, priority);

create index if not exists apex_dispatch_events_workspace_idx
  on public.apex_dispatch_events(workspace_id, created_at desc);
