-- Provider-confirmed Content Engine evidence must be written only by trusted workers.
-- Workspace admins still control drafts, approvals, queueing and kill switches, but they
-- cannot manufacture a successful provider delivery or provider metric snapshot directly.

create or replace function private.guard_content_provider_evidence()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  caller_role text := coalesce(auth.role(), '');
begin
  if caller_role = 'service_role' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status in ('publishing', 'published')
       or new.provider_post_id is not null
       or new.provider_post_url is not null
       or new.provider_container_id is not null
       or new.published_at is not null
       or coalesce(new.provider_response, '{}'::jsonb) <> '{}'::jsonb then
      raise exception 'Provider delivery evidence is worker-only' using errcode = '42501';
    end if;
    return new;
  end if;

  if new.status = 'publishing' and old.status is distinct from 'publishing' then
    raise exception 'Only the publishing worker may claim a delivery job' using errcode = '42501';
  end if;

  if new.status = 'published' and old.status is distinct from 'published' then
    raise exception 'Only the publishing worker may confirm provider delivery' using errcode = '42501';
  end if;

  if new.provider_post_id is distinct from old.provider_post_id
     or new.provider_post_url is distinct from old.provider_post_url
     or new.provider_container_id is distinct from old.provider_container_id
     or new.published_at is distinct from old.published_at
     or new.provider_response is distinct from old.provider_response then
    raise exception 'Provider delivery evidence is worker-only' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function private.guard_content_provider_evidence() from public, anon, authenticated;

drop trigger if exists content_publications_provider_evidence_guard on public.content_publications;
create trigger content_publications_provider_evidence_guard
before insert or update
on public.content_publications
for each row
execute function private.guard_content_provider_evidence();

create or replace function private.guard_content_draft_provider_confirmation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if new.status = 'published'
     and old.status is distinct from 'published'
     and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only a provider-confirmed worker may mark content published' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function private.guard_content_draft_provider_confirmation() from public, anon, authenticated;

drop trigger if exists content_drafts_provider_confirmation_guard on public.content_drafts;
create trigger content_drafts_provider_confirmation_guard
before update of status
on public.content_drafts
for each row
execute function private.guard_content_draft_provider_confirmation();

-- Metrics are read by workspace members but written only by the service-role provider worker.
drop policy if exists content_metric_snapshots_manage_admin on public.content_metric_snapshots;
revoke insert, update, delete, truncate on table public.content_metric_snapshots from anon, authenticated;
grant select on table public.content_metric_snapshots to authenticated;
grant select, insert, update, delete on table public.content_metric_snapshots to service_role;

-- Authenticated audit events must identify the real caller and cannot impersonate worker-only events.
drop policy if exists content_review_events_insert_admin on public.content_review_events;
create policy content_review_events_insert_admin
on public.content_review_events
for insert
to authenticated
with check (
  (select private.is_workspace_admin(content_review_events.workspace_id))
  and (select private.orbit_workspace_can_write(content_review_events.workspace_id))
  and content_review_events.actor_id = (select auth.uid())
  and content_review_events.event_type not in (
    'publication_started',
    'publication_published',
    'publication_failed',
    'learning_recorded'
  )
);

comment on function private.guard_content_provider_evidence() is
  'Prevents user sessions from fabricating provider delivery state, IDs, URLs, timestamps or provider responses.';
comment on function private.guard_content_draft_provider_confirmation() is
  'Reserves the published draft transition for the trusted provider worker.';
comment on table public.content_metric_snapshots is
  'Provider-confirmed performance snapshots. Authenticated workspace members may read them; only trusted service workers may write them.';
