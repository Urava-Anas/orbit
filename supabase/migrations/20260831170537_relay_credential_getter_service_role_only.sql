-- Finalize the Relay credential boundary after the application moved secret
-- retrieval to the trusted server-only Supabase admin client.

create or replace function public.orbit_relay_get_credential(p_mailbox_id uuid)
returns table(username text, password text)
language plpgsql
security definer
set search_path = 'public', 'private', 'vault', 'pg_temp'
as $function$
declare
  v_workspace_id uuid;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Server-only function.' using errcode = '42501';
  end if;

  select workspace_id
    into v_workspace_id
  from public.orbit_mailboxes
  where id = p_mailbox_id;

  if v_workspace_id is null then
    raise exception 'Mailbox not found.' using errcode = 'P0002';
  end if;

  return query
  select c.username, v.decrypted_secret
  from public.orbit_mailbox_credentials c
  join vault.decrypted_secrets v on v.id = c.vault_secret_id
  where c.mailbox_id = p_mailbox_id
  limit 1;
end;
$function$;

revoke execute on function public.orbit_relay_get_credential(uuid) from public;
revoke execute on function public.orbit_relay_get_credential(uuid) from anon;
revoke execute on function public.orbit_relay_get_credential(uuid) from authenticated;
grant execute on function public.orbit_relay_get_credential(uuid) to service_role;
