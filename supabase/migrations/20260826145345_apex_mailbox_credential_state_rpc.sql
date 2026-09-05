create or replace function public.apex_mailbox_credential_state()
returns table(mailbox_id uuid, stored boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_workspace_id uuid;
  v_email text;
begin
  v_email := lower(trim(coalesce(auth.jwt() ->> 'email', '')));

  select workspace_id
    into v_workspace_id
  from public.apex_authorized_users
  where email = v_email
    and active = true
  order by case role when 'founder' then 1 when 'admin' then 2 when 'dispatcher' then 3 else 4 end
  limit 1;

  if v_workspace_id is null then
    raise exception 'Apex access required.' using errcode = '42501';
  end if;

  return query
  select m.id, (c.mailbox_id is not null)
  from public.orbit_mailboxes m
  left join public.orbit_mailbox_credentials c on c.mailbox_id = m.id
  where m.workspace_id = v_workspace_id
  order by m.address;
end;
$$;

revoke all on function public.apex_mailbox_credential_state() from public, anon;
grant execute on function public.apex_mailbox_credential_state() to authenticated, service_role;
