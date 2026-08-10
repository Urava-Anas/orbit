-- Orbit Stage 4 scheduler.
-- The JWT value is stored separately in Supabase Vault under
-- orbit_stage4_scheduler_anon_key; no secret value is committed here.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

do $$
declare
  existing_job bigint;
begin
  select jobid into existing_job
  from cron.job
  where jobname = 'orbit-stage4-autopilot-worker'
  limit 1;

  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;
end
$$;

select cron.schedule(
  'orbit-stage4-autopilot-worker',
  '*/5 * * * *',
  $stage4$
  select net.http_post(
    url := 'https://sjtgydpwsnjwxlwbtpgf.supabase.co/functions/v1/orbit-stage4-scheduler',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'orbit_stage4_scheduler_anon_key'
        limit 1
      )
    ),
    body := '{"source":"pg_cron","version":1}'::jsonb,
    timeout_milliseconds := 60000
  );
  $stage4$
);
