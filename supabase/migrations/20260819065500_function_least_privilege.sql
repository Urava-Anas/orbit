-- Functions are executable by PUBLIC by default in PostgreSQL. Make that an explicit exception, not a default.

revoke execute on function public.create_foundry_class_journey_command(
  uuid, uuid, text, text, text, timestamptz, timestamptz, text, text, text, smallint
) from public, anon;
grant execute on function public.create_foundry_class_journey_command(
  uuid, uuid, text, text, text, timestamptz, timestamptz, text, text, text, smallint
) to authenticated;

revoke execute on function public.create_foundry_task_assignment_journey_command(
  uuid, uuid, uuid, text, text, text, text, text, smallint, timestamptz, timestamptz, smallint
) from public, anon;
grant execute on function public.create_foundry_task_assignment_journey_command(
  uuid, uuid, uuid, text, text, text, text, text, smallint, timestamptz, timestamptz, smallint
) to authenticated;

-- Public certificate verification remains the deliberately reviewed anonymous RPC.
revoke execute on function public.verify_foundry_certificate(uuid) from public;
grant execute on function public.verify_foundry_certificate(uuid) to anon, authenticated;

alter default privileges in schema public revoke execute on functions from public;
