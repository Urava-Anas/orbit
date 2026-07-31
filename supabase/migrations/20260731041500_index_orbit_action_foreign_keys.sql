create index if not exists orbit_action_calls_action_key_idx
  on public.orbit_action_calls (action_key_id);

create index if not exists orbit_action_calls_actor_idx
  on public.orbit_action_calls (actor_id);

create index if not exists orbit_action_keys_actor_idx
  on public.orbit_action_keys (actor_id);

create index if not exists orbit_action_keys_created_by_idx
  on public.orbit_action_keys (created_by);