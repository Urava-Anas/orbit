alter table public.orbit_plan_change_requests
  alter column requested_by drop not null;

alter table public.orbit_plan_change_requests
  drop constraint if exists orbit_plan_change_requests_requested_by_fkey;

alter table public.orbit_plan_change_requests
  add constraint orbit_plan_change_requests_requested_by_fkey
  foreign key (requested_by)
  references auth.users(id)
  on delete set null;

comment on column public.orbit_plan_change_requests.requested_by is
  'Audit actor for the plan-change request. Set null when the auth identity is deleted so account deletion cannot be blocked.';
