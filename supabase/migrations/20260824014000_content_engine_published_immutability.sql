-- Published Content Engine records are immutable snapshots of what was actually delivered.
-- Future edits must create/review a new content item rather than rewriting provider-confirmed history.

create or replace function private.guard_published_content_immutability()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if old.status = 'published' and (
    new.status is distinct from old.status
    or new.channel is distinct from old.channel
    or new.title is distinct from old.title
    or new.hook is distinct from old.hook
    or new.body is distinct from old.body
    or new.cta is distinct from old.cta
    or new.media_brief is distinct from old.media_brief
    or new.scheduled_for is distinct from old.scheduled_for
    or new.proof_id is distinct from old.proof_id
    or new.source_type is distinct from old.source_type
    or new.format is distinct from old.format
    or new.goal is distinct from old.goal
    or new.approved_at is distinct from old.approved_at
    or new.approved_by is distinct from old.approved_by
    or new.rejection_reason is distinct from old.rejection_reason
  ) then
    raise exception 'Published content is immutable; create a new revision instead.' using errcode = '55000';
  end if;

  return new;
end;
$$;

revoke all on function private.guard_published_content_immutability() from public, anon, authenticated;

drop trigger if exists content_drafts_published_immutability on public.content_drafts;
create trigger content_drafts_published_immutability
before update on public.content_drafts
for each row execute function private.guard_published_content_immutability();

comment on function private.guard_published_content_immutability() is
  'Protects provider-confirmed Content Engine history from being rewritten after publication.';
