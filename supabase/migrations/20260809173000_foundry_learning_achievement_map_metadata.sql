alter table public.foundry_class_learning_notes
  add column if not exists impact_title text,
  add column if not exists impact_statement text,
  add column if not exists achievement_title text,
  add column if not exists achievement_description text,
  add column if not exists evidence_requirement text,
  add column if not exists xp_reward smallint not null default 0;

alter table public.foundry_class_learning_notes
  drop constraint if exists foundry_class_learning_notes_xp_reward_check;

alter table public.foundry_class_learning_notes
  add constraint foundry_class_learning_notes_xp_reward_check
  check (xp_reward >= 0 and xp_reward <= 5000);
