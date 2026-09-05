create table if not exists public.content_review_events (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  batch_id uuid references public.content_batches(id) on delete set null,
  content_id uuid references public.content_drafts(id) on delete set null,
  event_type text not null check (event_type in (
    'batch_generated','batch_approved','content_edited','content_approved','content_rejected',
    'publication_blocked','publication_queued','publication_started','publication_published','publication_failed',
    'learning_recorded','brand_brain_updated'
  )),
  actor_id uuid references auth.users(id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists content_review_events_workspace_created_idx
  on public.content_review_events(workspace_id, created_at desc);
create index if not exists content_review_events_content_created_idx
  on public.content_review_events(content_id, created_at desc)
  where content_id is not null;

alter table public.content_review_events enable row level security;

drop policy if exists content_review_events_select_member on public.content_review_events;
create policy content_review_events_select_member
on public.content_review_events
for select
to authenticated
using ((select private.is_workspace_member(content_review_events.workspace_id)));

drop policy if exists content_review_events_insert_admin on public.content_review_events;
create policy content_review_events_insert_admin
on public.content_review_events
for insert
to authenticated
with check (
  (select private.is_workspace_admin(content_review_events.workspace_id))
  and (select private.orbit_workspace_can_write(content_review_events.workspace_id))
);

comment on table public.content_review_events is
  'Append-only Content Engine review and publishing audit trail. No authenticated update/delete policy is intentionally defined.';
