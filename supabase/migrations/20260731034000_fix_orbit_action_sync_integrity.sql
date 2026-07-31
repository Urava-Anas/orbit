alter table public.foundry_command_receipts
  drop constraint if exists foundry_command_receipts_command_type_check;

alter table public.foundry_command_receipts
  add constraint foundry_command_receipts_command_type_check
  check (
    command_type in (
      'create_class',
      'create_task_assignment',
      'submit_assignment',
      'review_submission',
      'orbit_action_update_student',
      'orbit_action_queue_sync'
    )
  );

create or replace function public.complete_orbit_sync_action(
  target_call_id uuid,
  worker_result jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  affected_count integer;
  sync_success boolean;
  configured boolean;
  failed_deliveries integer;
  error_count integer;
begin
  configured := coalesce(worker_result ->> 'configured', 'false') = 'true';
  failed_deliveries := coalesce((worker_result ->> 'deliveriesFailed')::integer, 0);
  error_count := jsonb_array_length(coalesce(worker_result -> 'errors', '[]'::jsonb));
  sync_success := configured and failed_deliveries = 0 and error_count = 0;

  update public.orbit_action_calls
  set status = case when sync_success then 'succeeded' else 'failed' end,
      response_summary = coalesce(response_summary, '{}'::jsonb)
        || jsonb_build_object(
          'worker', coalesce(worker_result, '{}'::jsonb),
          'syncComplete', sync_success
        ),
      error_code = case when sync_success then null else 'worker_delivery_failed' end,
      completed_at = now()
  where id = target_call_id
    and operation = 'queue-sync';

  get diagnostics affected_count = row_count;
  return affected_count = 1;
end;
$$;

revoke all on function public.complete_orbit_sync_action(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.complete_orbit_sync_action(uuid, jsonb)
  to service_role;

update public.foundry_external_records
set remote_url = 'https://airtable.com/appgvElGxaKEYU7Hr/tblrJ8uzgxGIUOPAD/' || remote_record_id,
    updated_at = now()
where provider = 'airtable'
  and remote_url is null;

notify pgrst, 'reload schema';