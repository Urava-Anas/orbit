create table if not exists public.lead_finder_place_memory (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null default 'google_places' check (provider = 'google_places'),
  provider_place_id text not null check (char_length(provider_place_id) between 3 and 300),
  decision text not null check (decision in ('approved','rejected','duplicate')),
  lead_id uuid,
  decided_by uuid not null references auth.users(id),
  decided_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lead_finder_memory_lead_same_workspace
    foreign key (workspace_id, lead_id)
    references public.leads(workspace_id, id)
    on delete set null,
  unique (workspace_id, provider, provider_place_id)
);

create index if not exists lead_finder_place_memory_workspace_decision_idx
  on public.lead_finder_place_memory (workspace_id, decision, decided_at desc);

alter table public.lead_finder_place_memory enable row level security;

create policy lead_finder_place_memory_select_member
  on public.lead_finder_place_memory for select to authenticated
  using ((select private.is_workspace_member(workspace_id)));
create policy lead_finder_place_memory_insert_member
  on public.lead_finder_place_memory for insert to authenticated
  with check ((select private.is_workspace_member(workspace_id)));
create policy lead_finder_place_memory_update_member
  on public.lead_finder_place_memory for update to authenticated
  using ((select private.is_workspace_member(workspace_id)))
  with check ((select private.is_workspace_member(workspace_id)));
create policy lead_finder_place_memory_delete_admin
  on public.lead_finder_place_memory for delete to authenticated
  using ((select private.is_workspace_admin(workspace_id)));

create trigger lead_finder_place_memory_set_updated_at
  before update on public.lead_finder_place_memory
  for each row execute function private.set_updated_at();

comment on table public.lead_finder_place_memory is
  'Durable founder decisions keyed only by provider Place ID. Temporary Google content remains in lead_finder_results and expires separately.';
