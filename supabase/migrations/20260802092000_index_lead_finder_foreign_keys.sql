create index if not exists lead_finder_searches_created_by_idx
  on public.lead_finder_searches (created_by);
create index if not exists lead_finder_results_search_workspace_idx
  on public.lead_finder_results (workspace_id, search_id);
create index if not exists lead_finder_results_lead_workspace_idx
  on public.lead_finder_results (workspace_id, lead_id)
  where lead_id is not null;
create index if not exists lead_finder_results_created_by_idx
  on public.lead_finder_results (created_by);
create index if not exists lead_finder_memory_lead_workspace_idx
  on public.lead_finder_place_memory (workspace_id, lead_id)
  where lead_id is not null;
create index if not exists lead_finder_memory_decided_by_idx
  on public.lead_finder_place_memory (decided_by);
