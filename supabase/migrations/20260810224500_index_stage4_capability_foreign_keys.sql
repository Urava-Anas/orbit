-- Cover single-column foreign keys to public.capabilities for Stage 4.
create index if not exists orbit_autopilot_policy_capability_fk_idx
  on public.orbit_autopilot_policy_grants(capability_key);

create index if not exists orbit_external_action_capability_fk_idx
  on public.orbit_external_action_requests(capability_key);
