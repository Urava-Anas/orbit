create or replace function private.capture_audit_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  record_workspace_id uuid;
  record_id uuid;
begin
  if tg_op = 'DELETE' then
    record_workspace_id := old.workspace_id;
    record_id := old.id;
  else
    record_workspace_id := new.workspace_id;
    record_id := new.id;
  end if;

  if tg_op = 'DELETE'
    and not exists (
      select 1
      from public.workspaces
      where id = record_workspace_id
    )
  then
    return old;
  end if;

  insert into public.audit_events (
    workspace_id,
    actor_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    record_workspace_id,
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    record_id,
    jsonb_build_object('occurred_at', now())
  );

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

revoke execute on function private.capture_audit_event() from public, anon, authenticated;
