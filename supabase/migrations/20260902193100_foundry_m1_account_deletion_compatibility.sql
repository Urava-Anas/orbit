-- Foundry M1 account-deletion compatibility
--
-- Orbit's platform contract requires public tables (other than workspaces) not
-- to retain RESTRICT/NO ACTION foreign keys to auth.users, because that can
-- make user deletion fail after workspace cleanup.
--
-- An enrolment is an identity-bound access record. If the authenticated user
-- is deleted, the enrolment must be removed rather than block account deletion.
-- Lifecycle/application evidence keeps its own workspace-scoped history and
-- nullable actor references independently.

alter table public.foundry_enrolments
  drop constraint if exists foundry_enrolments_auth_user_id_fkey;

alter table public.foundry_enrolments
  add constraint foundry_enrolments_auth_user_id_fkey
  foreign key (auth_user_id)
  references auth.users(id)
  on delete cascade;
