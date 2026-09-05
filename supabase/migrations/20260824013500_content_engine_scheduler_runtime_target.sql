-- Content Engine scheduler target hardening.
-- Never bind durable pg_cron jobs to one Vercel deployment hostname.
-- A service-role-only runtime config row controls the HTTPS base URL and the jobs fail closed when it is absent/invalid.

create or replace function private.content_engine_runtime_base_url()
returns text
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select case
    when value ~ '^https://[A-Za-z0-9.-]+(:[0-9]+)?$' then value
    else null
  end
  from public.orbit_runtime_config
  where key = 'content_engine_base_url'
  limit 1;
$$;

revoke all on function private.content_engine_runtime_base_url() from public, anon, authenticated;
grant execute on function private.content_engine_runtime_base_url() to service_role;

do $$
declare
  job record;
begin
  for job in
    select jobid
    from cron.job
    where jobname in ('orbit-content-engine-worker', 'orbit-content-engine-metrics')
  loop
    perform cron.unschedule(job.jobid);
  end loop;
end
$$;

select cron.schedule(
  'orbit-content-engine-worker',
  '*/5 * * * *',
  $content_worker$
  with target as (
    select private.content_engine_runtime_base_url() as base_url
  ), secret as (
    select decrypted_secret
    from vault.decrypted_secrets
    where name = 'orbit_content_engine_worker_secret'
    limit 1
  )
  select net.http_post(
    url := target.base_url || '/api/internal/content-engine-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || secret.decrypted_secret
    ),
    body := '{"source":"pg_cron","version":2}'::jsonb,
    timeout_milliseconds := 240000
  )
  from target
  cross join secret
  where target.base_url is not null
    and secret.decrypted_secret is not null;
  $content_worker$
);

select cron.schedule(
  'orbit-content-engine-metrics',
  '15 */6 * * *',
  $content_metrics$
  with target as (
    select private.content_engine_runtime_base_url() as base_url
  ), secret as (
    select decrypted_secret
    from vault.decrypted_secrets
    where name = 'orbit_content_engine_worker_secret'
    limit 1
  )
  select net.http_post(
    url := target.base_url || '/api/internal/content-engine-metrics',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || secret.decrypted_secret
    ),
    body := '{"source":"pg_cron","version":2}'::jsonb,
    timeout_milliseconds := 120000
  )
  from target
  cross join secret
  where target.base_url is not null
    and secret.decrypted_secret is not null;
  $content_metrics$
);

comment on function private.content_engine_runtime_base_url() is
  'Returns the validated HTTPS Content Engine application base URL from service-role-only Orbit runtime config. Missing/invalid values fail closed.';
