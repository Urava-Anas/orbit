do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'orbit_action_keys'
      and policyname = 'orbit_action_keys_deny_direct_access'
  ) then
    create policy orbit_action_keys_deny_direct_access
      on public.orbit_action_keys
      for all
      to authenticated
      using (false)
      with check (false);
  end if;
end;
$$;

revoke all on function public.orbit_gpt_health(text, uuid)
  from public, anon, authenticated;
revoke all on function public.orbit_gpt_summary(text, uuid)
  from public, anon, authenticated;
revoke all on function public.orbit_gpt_students(text, uuid, text, text, integer)
  from public, anon, authenticated;
revoke all on function public.orbit_gpt_audit(text, uuid, integer)
  from public, anon, authenticated;
revoke all on function public.orbit_gpt_assign_task(text, uuid, uuid, text, text, text, text, text, smallint, timestamptz)
  from public, anon, authenticated;
revoke all on function public.orbit_gpt_update_student(text, uuid, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.orbit_gpt_review_submission(text, uuid, uuid, text, text, smallint)
  from public, anon, authenticated;
revoke all on function public.orbit_gpt_queue_sync(text, uuid)
  from public, anon, authenticated;

grant execute on function public.orbit_gpt_health(text, uuid)
  to service_role;
grant execute on function public.orbit_gpt_summary(text, uuid)
  to service_role;
grant execute on function public.orbit_gpt_students(text, uuid, text, text, integer)
  to service_role;
grant execute on function public.orbit_gpt_audit(text, uuid, integer)
  to service_role;
grant execute on function public.orbit_gpt_assign_task(text, uuid, uuid, text, text, text, text, text, smallint, timestamptz)
  to service_role;
grant execute on function public.orbit_gpt_update_student(text, uuid, uuid, text, text)
  to service_role;
grant execute on function public.orbit_gpt_review_submission(text, uuid, uuid, text, text, smallint)
  to service_role;
grant execute on function public.orbit_gpt_queue_sync(text, uuid)
  to service_role;

notify pgrst, 'reload schema';