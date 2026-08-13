-- Orbit Plugin Architecture v1 — Stage 3: Secure MCP Runtime
-- Runtime metadata is workspace-scoped. Raw tool inputs/outputs and provider secrets are never persisted.

create table if not exists public.plugin_runtime_tools (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  installation_id uuid not null references public.plugin_installations(id) on delete cascade,
  plugin_id uuid not null references public.plugin_catalog(id) on delete restrict,
  tool_name text not null check (tool_name ~ '^[A-Za-z0-9_.:-]{1,128}$'),
  title text,
  description text,
  input_schema jsonb not null default '{}'::jsonb check (jsonb_typeof(input_schema) = 'object'),
  annotations jsonb not null default '{}'::jsonb check (jsonb_typeof(annotations) = 'object'),
  source_hash text not null check (source_hash ~ '^[a-f0-9]{64}$'),
  enabled boolean not null default true,
  discovered_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  unique (installation_id, tool_name)
);

create table if not exists public.plugin_tool_invocations (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  installation_id uuid not null references public.plugin_installations(id) on delete cascade,
  plugin_id uuid not null references public.plugin_catalog(id) on delete restrict,
  action_key_id uuid references public.orbit_action_keys(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  tool_name text not null check (tool_name ~ '^[A-Za-z0-9_.:-]{1,128}$'),
  status text not null default 'requested' check (status in ('requested','succeeded','failed','denied')),
  input_digest text not null check (input_digest ~ '^[a-f0-9]{64}$'),
  output_digest text check (output_digest is null or output_digest ~ '^[a-f0-9]{64}$'),
  duration_ms integer check (duration_ms is null or duration_ms between 0 and 120000),
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (workspace_id, request_id)
);

create index if not exists plugin_runtime_tools_workspace_idx on public.plugin_runtime_tools(workspace_id, enabled, expires_at);
create index if not exists plugin_runtime_tools_plugin_idx on public.plugin_runtime_tools(plugin_id);
create index if not exists plugin_tool_invocations_workspace_time_idx on public.plugin_tool_invocations(workspace_id, created_at desc);
create index if not exists plugin_tool_invocations_installation_time_idx on public.plugin_tool_invocations(installation_id, created_at desc);
create index if not exists plugin_tool_invocations_action_key_idx on public.plugin_tool_invocations(action_key_id);
create index if not exists plugin_tool_invocations_actor_idx on public.plugin_tool_invocations(actor_user_id);

alter table public.plugin_runtime_tools enable row level security;
alter table public.plugin_tool_invocations enable row level security;
revoke all on table public.plugin_runtime_tools from anon, authenticated;
revoke all on table public.plugin_tool_invocations from anon, authenticated;
grant select on table public.plugin_runtime_tools to authenticated;
grant select on table public.plugin_tool_invocations to authenticated;

drop policy if exists plugin_runtime_tools_select_member on public.plugin_runtime_tools;
create policy plugin_runtime_tools_select_member
  on public.plugin_runtime_tools for select to authenticated
  using ((select private.is_workspace_member(plugin_runtime_tools.workspace_id)));

drop policy if exists plugin_tool_invocations_select_member on public.plugin_tool_invocations;
create policy plugin_tool_invocations_select_member
  on public.plugin_tool_invocations for select to authenticated
  using ((select private.is_workspace_member(plugin_tool_invocations.workspace_id)));

-- Service-role-only bridge for Orbit Operator. The bearer key must contain a plugin-specific scope.
create or replace function public.orbit_plugin_operator_authorize(
  action_token text,
  required_scope text
)
returns table(action_key_id uuid, workspace_id uuid, actor_id uuid)
language plpgsql
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
begin
  if required_scope not in ('plugins.read','plugins.invoke') then
    raise exception 'Invalid plugin operator scope' using errcode = '22023';
  end if;

  return query
  select context.action_key_id, context.workspace_id, context.actor_id
  from private.require_orbit_action_key(action_token, required_scope) context;
end;
$$;

revoke all on function public.orbit_plugin_operator_authorize(text,text) from public, anon, authenticated;
grant execute on function public.orbit_plugin_operator_authorize(text,text) to service_role;

comment on table public.plugin_tool_invocations is
  'Security audit metadata only. Raw tool arguments, raw tool outputs, OAuth tokens and plugin secrets must never be stored here.';
