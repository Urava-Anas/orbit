alter table public.leads
  add column if not exists google_place_id text;

alter table public.leads
  add constraint leads_google_place_id_check
  check (google_place_id is null or char_length(google_place_id) between 3 and 300);

create unique index if not exists leads_workspace_google_place_id_unique
  on public.leads (workspace_id, google_place_id)
  where google_place_id is not null;

comment on column public.leads.google_place_id is
  'Durable Google Places identifier used for duplicate prevention. Place IDs may be stored under Google Places policy.';

create table if not exists public.lead_finder_searches (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  query_text text not null check (char_length(query_text) between 3 and 240),
  niche text not null check (char_length(niche) between 2 and 100),
  location text not null check (char_length(location) between 2 and 160),
  target_problem text check (target_problem is null or char_length(target_problem) <= 500),
  offer_key text check (offer_key is null or char_length(offer_key) <= 100),
  provider text not null default 'google_places' check (provider = 'google_places'),
  requested_count smallint not null default 10 check (requested_count between 1 and 20),
  result_count smallint not null default 0 check (result_count between 0 and 60),
  status text not null default 'running' check (status in ('running','completed','failed')),
  error_summary text check (error_summary is null or char_length(error_summary) <= 1000),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (workspace_id, id)
);

create table if not exists public.lead_finder_results (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  search_id uuid not null,
  provider text not null default 'google_places' check (provider = 'google_places'),
  provider_place_id text not null check (char_length(provider_place_id) between 3 and 300),
  business_name text not null check (char_length(business_name) between 2 and 200),
  formatted_address text check (formatted_address is null or char_length(formatted_address) <= 500),
  primary_type text check (primary_type is null or char_length(primary_type) <= 120),
  business_status text check (business_status is null or char_length(business_status) <= 80),
  google_maps_url text check (google_maps_url is null or char_length(google_maps_url) <= 1000),
  website_url text check (website_url is null or char_length(website_url) <= 1000),
  phone text check (phone is null or char_length(phone) <= 60),
  rating numeric(2,1) check (rating is null or rating between 0 and 5),
  review_count integer check (review_count is null or review_count >= 0),
  niche text not null check (char_length(niche) between 2 and 100),
  target_problem text check (target_problem is null or char_length(target_problem) <= 500),
  fit_score smallint check (fit_score is null or fit_score between 0 and 30),
  problem_score smallint check (problem_score is null or problem_score between 0 and 30),
  contactability_score smallint check (contactability_score is null or contactability_score between 0 and 20),
  commercial_score smallint check (commercial_score is null or commercial_score between 0 and 20),
  total_score smallint check (total_score is null or total_score between 0 and 100),
  score_reason text check (score_reason is null or char_length(score_reason) <= 2000),
  detected_weakness text check (detected_weakness is null or char_length(detected_weakness) <= 1000),
  recommended_offer text check (recommended_offer is null or char_length(recommended_offer) <= 1000),
  suggested_next_action text check (suggested_next_action is null or char_length(suggested_next_action) <= 500),
  status text not null default 'new' check (status in ('new','analyzed','saved','approved','rejected','duplicate')),
  lead_id uuid,
  analyzed_at timestamptz,
  decided_at timestamptz,
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lead_finder_results_search_same_workspace
    foreign key (workspace_id, search_id)
    references public.lead_finder_searches(workspace_id, id)
    on delete cascade,
  constraint lead_finder_results_lead_same_workspace
    foreign key (workspace_id, lead_id)
    references public.leads(workspace_id, id)
    on delete set null,
  unique (workspace_id, provider, provider_place_id)
);

create index if not exists lead_finder_searches_workspace_created_idx
  on public.lead_finder_searches (workspace_id, created_at desc);
create index if not exists lead_finder_results_workspace_status_score_idx
  on public.lead_finder_results (workspace_id, status, total_score desc nulls last);
create index if not exists lead_finder_results_workspace_expiry_idx
  on public.lead_finder_results (workspace_id, expires_at);

alter table public.lead_finder_searches enable row level security;
alter table public.lead_finder_results enable row level security;

create policy lead_finder_searches_select_member
  on public.lead_finder_searches for select to authenticated
  using ((select private.is_workspace_member(workspace_id)));
create policy lead_finder_searches_insert_member
  on public.lead_finder_searches for insert to authenticated
  with check ((select private.is_workspace_member(workspace_id)));
create policy lead_finder_searches_update_member
  on public.lead_finder_searches for update to authenticated
  using ((select private.is_workspace_member(workspace_id)))
  with check ((select private.is_workspace_member(workspace_id)));
create policy lead_finder_searches_delete_admin
  on public.lead_finder_searches for delete to authenticated
  using ((select private.is_workspace_admin(workspace_id)));

create policy lead_finder_results_select_member
  on public.lead_finder_results for select to authenticated
  using ((select private.is_workspace_member(workspace_id)));
create policy lead_finder_results_insert_member
  on public.lead_finder_results for insert to authenticated
  with check ((select private.is_workspace_member(workspace_id)));
create policy lead_finder_results_update_member
  on public.lead_finder_results for update to authenticated
  using ((select private.is_workspace_member(workspace_id)))
  with check ((select private.is_workspace_member(workspace_id)));
create policy lead_finder_results_delete_admin
  on public.lead_finder_results for delete to authenticated
  using ((select private.is_workspace_admin(workspace_id)));

create trigger lead_finder_results_set_updated_at
  before update on public.lead_finder_results
  for each row execute function private.set_updated_at();

comment on table public.lead_finder_searches is
  'Workspace-scoped discovery briefs submitted to approved lead data providers.';
comment on table public.lead_finder_results is
  'Temporary discovery queue. Provider content expires after 30 days; approved prospects become controlled lead records.';
comment on column public.lead_finder_results.provider_place_id is
  'Google Place ID used as the durable duplicate key.';
comment on column public.lead_finder_results.expires_at is
  'Expiry boundary for cached provider content. Search results older than this are removed from active views.';
