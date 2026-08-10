alter table public.orbit_autopilot_configs
  add column if not exists payment_instructions text null;

alter table public.orbit_autopilot_configs
  drop constraint if exists orbit_autopilot_configs_payment_instructions_length;

alter table public.orbit_autopilot_configs
  add constraint orbit_autopilot_configs_payment_instructions_length
  check (payment_instructions is null or char_length(payment_instructions) <= 2000);
