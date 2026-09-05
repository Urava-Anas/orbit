-- Capture real provider performance before the daily learning pass.
-- Reuse the Content Engine worker bearer secret stored in Supabase Vault.

do $$
declare
  existing_job bigint;
begin
  select jobid into existing_job
  from cron.job
  where jobname = 'orbit-content-engine-metrics'
  limit 1;

  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;
end
$$;

select cron.schedule(
  'orbit-content-engine-metrics',
  '15 */6 * * *',
  $content_metrics$
  select net.http_post(
    url := 'https://orbit-two-delta.vercel.app/api/internal/content-engine-metrics',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'orbit_content_engine_worker_secret'
        limit 1
      )
    ),
    body := '{"source":"pg_cron","version":1}'::jsonb,
    timeout_milliseconds := 120000
  );
  $content_metrics$
);

comment on table public.content_metric_snapshots is
  'Provider-confirmed performance snapshots. A secure scheduler refreshes published Meta content before learning runs.';
