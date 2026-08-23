revoke all on function public.orbit_start_workspace_trial() from public;
revoke all on function public.orbit_start_workspace_trial() from anon;
revoke all on function public.orbit_start_workspace_trial() from authenticated;
grant execute on function public.orbit_start_workspace_trial() to service_role;
