begin;

-- The server-only OAuth state ledger must accept every reviewed content provider while
-- remaining completely inaccessible to authenticated browser sessions.
insert into public.integration_oauth_states (state_hash, workspace_id, user_id, provider, expires_at)
values
  (repeat('a', 64), '82000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001', 'google_search_console', now() + interval '10 minutes'),
  (repeat('b', 64), '82000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001', 'google_analytics', now() + interval '10 minutes'),
  (repeat('c', 64), '82000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001', 'meta', now() + interval '10 minutes'),
  (repeat('d', 64), '82000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001', 'linkedin', now() + interval '10 minutes'),
  (repeat('e', 64), '82000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001', 'tiktok', now() + interval '10 minutes');

do $$
declare
  provider_count integer;
begin
  select count(*) into provider_count
  from public.integration_oauth_states
  where workspace_id = '82000000-0000-4000-8000-000000000001'
    and provider in ('google_search_console','google_analytics','meta','linkedin','tiktok');

  if provider_count <> 5 then
    raise exception 'Content provider OAuth ledger failure: expected 5 reviewed providers, got %', provider_count;
  end if;

  if has_table_privilege('authenticated', 'public.integration_oauth_states', 'SELECT')
     or has_table_privilege('authenticated', 'public.integration_oauth_states', 'INSERT')
     or has_table_privilege('authenticated', 'public.integration_oauth_states', 'UPDATE')
     or has_table_privilege('authenticated', 'public.integration_oauth_states', 'DELETE') then
    raise exception 'OAuth ledger security failure: authenticated browser role has direct table privileges';
  end if;

  if has_table_privilege('authenticated', 'public.content_worker_auth', 'SELECT') then
    raise exception 'Content worker identity security failure: authenticated can read worker secret hashes';
  end if;
end;
$$;

rollback;
select 'content provider OAuth ledger boundaries passed' as result;
