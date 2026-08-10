do $$
declare
  existing_job bigint;
begin
  select jobid into existing_job
  from cron.job
  where jobname = 'orbit-stage4-scheduler-cleanup'
  limit 1;
  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;
end
$$;

select cron.schedule(
  'orbit-stage4-scheduler-cleanup',
  '17 3 * * *',
  $cleanup$
    delete from public.orbit_scheduler_invocations
    where created_at < now() - interval '1 day';
  $cleanup$
);
