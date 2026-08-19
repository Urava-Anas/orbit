-- Deterministic CI-only tenant used by legacy Stage 1-4 acceptance suites.
-- This file is loaded once into the isolated local Supabase instance before tests.

insert into auth.users (
  id,
  aud,
  role,
  email,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values (
  '81000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'ci-founder@urava.test',
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"CI Founder"}'::jsonb,
  now(),
  now()
)
on conflict (id) do nothing;

insert into public.workspaces (
  id,
  name,
  slug,
  owner_id
)
values (
  '82000000-0000-4000-8000-000000000001',
  'Urava',
  'urava-ci',
  '81000000-0000-4000-8000-000000000001'
)
on conflict (id) do nothing;

insert into public.workspace_members (
  workspace_id,
  user_id,
  role
)
values (
  '82000000-0000-4000-8000-000000000001',
  '81000000-0000-4000-8000-000000000001',
  'owner'
)
on conflict (workspace_id, user_id) do update set role = excluded.role;
