-- Allow the trusted service-role Relay runtime to read mailbox credentials
-- without requiring an end-user auth.uid(), while preserving the existing
-- workspace-admin path during the staged production cutover.

create or replace function public.orbit_relay_get_credential(p_mailbox_id uuid)
returns table(username text, password text)
language plpgsql
security definer
set search_path = 'public', 'private', 'vault', 'pg_temp'
as $function$
declare
  v_workspace_id uuid;
begin
  select workspace_id
    into v_workspace_id
  from public.orbit_mailboxes
  where id = p_mailbox_id;

  if v_workspace_id is null then
    raise exception 'Mailbox not found.' using errcode = 'P0002';
  end if;

  if coalesce((select auth.role()), '') <> 'service_role'
     and not private.is_workspace_admin(v_workspace_id) then
    raise exception 'Workspace admin access required.' using errcode = '42501';
  end if;

  return query
  select c.username, v.decrypted_secret
  from public.orbit_mailbox_credentials c
  join vault.decrypted_secrets v on v.id = c.vault_secret_id
  where c.mailbox_id = p_mailbox_id
  limit 1;
end;
$function$;
