-- All high-risk Foundry writes now flow through the validated, idempotent
-- command RPCs introduced in the preceding migration. Trigger-driven system
-- work runs as the function owner and remains available.

create or replace function private.require_foundry_insert_command()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  command_name text := current_setting('app.foundry_command', true);
  expected_command text;
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  expected_command := case tg_table_name
    when 'foundry_classes' then 'create_class'
    when 'foundry_tasks' then 'create_task_assignment'
    when 'foundry_task_assignments' then 'create_task_assignment'
    when 'foundry_submissions' then 'submit_assignment'
    when 'foundry_command_receipts'
      then to_jsonb(new) ->> 'command_type'
    else null
  end;

  if expected_command is null or command_name is distinct from expected_command then
    raise exception 'Use the validated Foundry command for % inserts',
      tg_table_name
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create or replace function private.require_foundry_update_command()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  command_name text := current_setting('app.foundry_command', true);
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  if tg_table_name = 'foundry_submissions'
    and command_name is distinct from 'review_submission'
  then
    raise exception 'Use the validated Foundry review command'
      using errcode = '42501';
  end if;

  if tg_table_name = 'foundry_task_assignments'
    and (
      command_name is null
      or command_name not in (
        'submit_assignment',
        'review_submission',
        'deadline_sweep'
      )
    )
  then
    raise exception 'Use a validated Foundry assignment command'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function private.require_foundry_insert_command()
  from public, anon, authenticated;
revoke all on function private.require_foundry_update_command()
  from public, anon, authenticated;

create trigger foundry_classes_require_command
  before insert on public.foundry_classes
  for each row execute function private.require_foundry_insert_command();
create trigger foundry_tasks_require_command
  before insert on public.foundry_tasks
  for each row execute function private.require_foundry_insert_command();
create trigger foundry_assignments_require_insert_command
  before insert on public.foundry_task_assignments
  for each row execute function private.require_foundry_insert_command();
create trigger foundry_submissions_require_insert_command
  before insert on public.foundry_submissions
  for each row execute function private.require_foundry_insert_command();
create trigger foundry_command_receipts_require_command
  before insert on public.foundry_command_receipts
  for each row execute function private.require_foundry_insert_command();

create trigger foundry_assignments_require_update_command
  before update on public.foundry_task_assignments
  for each row execute function private.require_foundry_update_command();
create trigger foundry_submissions_require_update_command
  before update on public.foundry_submissions
  for each row execute function private.require_foundry_update_command();
