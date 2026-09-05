-- Local-time-safe Content Engine schedulers.
-- Durable pg_cron calls the application hourly, while each route executes only
-- for workspaces whose configured local hour is due. Generator, learner and
-- publisher use separate Vault bearer secrets to reduce credential blast radius.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create extension if not exists pgcrypto with schema extensions;

do $$
declare
  daily_secret text;
  learning_secret text;
begin
  select decrypted_secret into daily_secret
  from vault.decrypted_secrets
  where name = 'orbit_content_engine_daily_secret'
  limit 1;

  if daily_secret is null then
    daily_secret := encode(extensions.gen_random_bytes(32), 'hex');
    perform vault.create_secret(
      daily_secret,
      'orbit_content_engine_daily_secret',
      'Bearer secret for Supabase pg_cron -> Orbit Content Engine daily generator'
    );
  end if;

  insert into public.content_worker_auth(id, secret_hash, rotated_at)
  values (
    'daily',
    encode(extensions.digest(convert_to(daily_secret, 'UTF8'), 'sha256'), 'hex'),
    now()
  )
  on conflict (id) do update
  set secret_hash = excluded.secret_hash,
      rotated_at = excluded.rotated_at;

  select decrypted_secret into learning_secret
  from vault.decrypted_secrets
  where name = 'orbit_content_engine_learning_secret'
  limit 1;

  if learning_secret is null then
    learning_secret := encode(extensions.gen_random_bytes(32), 'hex');
    perform vault.create_secret(
      learning_secret,
      'orbit_content_engine_learning_secret',
      'Bearer secret for Supabase pg_cron -> Orbit Content Engine learning worker'
    );
  end if;

  insert into public.content_worker_auth(id, secret_hash, rotated_at)
  values (
    'learning',
    encode(extensions.digest(convert_to(learning_secret, 'UTF8'), 'sha256'), 'hex'),
    now()
  )
  on conflict (id) do update
  set secret_hash = excluded.secret_hash,
      rotated_at = excluded.rotated_at;
end
$$;

do $$
declare
  job record;
begin
  for job in
    select jobid
    from cron.job
    where jobname in ('orbit-content-engine-daily', 'orbit-content-engine-learning')
  loop
    perform cron.unschedule(job.jobid);
  end loop;
end
$$;

select cron.schedule(
  'orbit-content-engine-daily',
  '5 * * * *',
  $content_daily$
  with target as (
    select private.content_engine_runtime_base_url() as base_url
  ), secret as (
    select decrypted_secret
    from vault.decrypted_secrets
    where name = 'orbit_content_engine_daily_secret'
    limit 1
  )
  select net.http_post(
    url := target.base_url || '/api/internal/content-engine-daily',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || secret.decrypted_secret
    ),
    body := '{"source":"pg_cron","version":2}'::jsonb,
    timeout_milliseconds := 180000
  )
  from target
  cross join secret
  where target.base_url is not null
    and secret.decrypted_secret is not null;
  $content_daily$
);

select cron.schedule(
  'orbit-content-engine-learning',
  '35 * * * *',
  $content_learning$
  with target as (
    select private.content_engine_runtime_base_url() as base_url
  ), secret as (
    select decrypted_secret
    from vault.decrypted_secrets
    where name = 'orbit_content_engine_learning_secret'
    limit 1
  )
  select net.http_post(
    url := target.base_url || '/api/internal/content-engine-learn',
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
  $content_learning$
);

comment on table public.content_worker_auth is
  'Hashed bearer identities for separated Content Engine internal workers. Raw secrets remain only in Supabase Vault.';
