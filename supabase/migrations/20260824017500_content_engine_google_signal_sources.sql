-- Read-only Google measurement sources feed aggregate strategy signals into Content Engine learning.
-- They use a separate bearer identity from all publishing workers and never receive publish authority.

alter table public.content_learning_notes
  drop constraint if exists content_learning_notes_signal_type_check;

alter table public.content_learning_notes
  add constraint content_learning_notes_signal_type_check
  check (signal_type in (
    'performance',
    'audience',
    'format',
    'topic',
    'offer',
    'timing',
    'manual',
    'search',
    'traffic'
  ));

do $$
declare
  signal_secret text;
  signal_hash text;
begin
  select decrypted_secret
    into signal_secret
  from vault.decrypted_secrets
  where name = 'orbit_content_engine_signal_worker_secret'
  limit 1;

  if signal_secret is null then
    signal_secret := encode(extensions.gen_random_bytes(32), 'hex');
    perform vault.create_secret(
      signal_secret,
      'orbit_content_engine_signal_worker_secret',
      'Bearer secret for aggregate read-only Content Engine intelligence-source sync'
    );
  end if;

  signal_hash := encode(extensions.digest(convert_to(signal_secret, 'UTF8'), 'sha256'), 'hex');
  insert into public.content_worker_auth(id, secret_hash, rotated_at)
  values ('source_signals', signal_hash, now())
  on conflict (id) do update
    set secret_hash = excluded.secret_hash,
        rotated_at = excluded.rotated_at;
end
$$;

do $$
declare
  existing_job bigint;
begin
  select jobid into existing_job
  from cron.job
  where jobname = 'orbit-content-engine-source-signals'
  limit 1;

  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;
end
$$;

select cron.schedule(
  'orbit-content-engine-source-signals',
  '20 * * * *',
  $source_signal_worker$
  with target as (
    select private.content_engine_runtime_base_url() as base_url
  ), secret as (
    select decrypted_secret
    from vault.decrypted_secrets
    where name = 'orbit_content_engine_signal_worker_secret'
    limit 1
  )
  select net.http_post(
    url := target.base_url || '/api/internal/content-engine-source-signals',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || secret.decrypted_secret
    ),
    body := '{"source":"pg_cron","version":1,"authority":"read_only_intelligence"}'::jsonb,
    timeout_milliseconds := 180000
  )
  from target
  cross join secret
  where target.base_url is not null
    and secret.decrypted_secret is not null;
  $source_signal_worker$
);

comment on constraint content_learning_notes_signal_type_check on public.content_learning_notes is
  'Content learning signals include provider performance plus aggregate search and traffic intelligence. Search/traffic signals do not grant provider publishing authority.';
