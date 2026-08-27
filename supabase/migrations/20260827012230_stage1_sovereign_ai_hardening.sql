drop policy if exists ai_provider_catalog_deny_user_jwts on public.ai_provider_catalog;
create policy ai_provider_catalog_deny_user_jwts
on public.ai_provider_catalog for all to anon, authenticated
using (false) with check (false);

drop policy if exists ai_model_catalog_deny_user_jwts on public.ai_model_catalog;
create policy ai_model_catalog_deny_user_jwts
on public.ai_model_catalog for all to anon, authenticated
using (false) with check (false);

create index if not exists ai_model_catalog_provider_idx on public.ai_model_catalog(provider_key);
create index if not exists ai_workspace_policies_preferred_model_idx on public.ai_workspace_policies(preferred_model_id);
create index if not exists ai_workspace_policies_updated_by_idx on public.ai_workspace_policies(updated_by);
create index if not exists ai_request_runs_actor_idx on public.ai_request_runs(actor_id);
create index if not exists company_events_actor_idx on public.company_events(actor_id);
create index if not exists company_memory_source_event_idx on public.company_memory_entries(source_event_id);
create index if not exists company_memory_created_by_idx on public.company_memory_entries(created_by);
