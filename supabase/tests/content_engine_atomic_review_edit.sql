begin;

insert into public.content_drafts (
  id,
  workspace_id,
  proof_id,
  channel,
  title,
  body,
  status,
  created_by,
  source_type,
  format,
  goal
)
values
  (
    '87000000-0000-4000-8000-000000000001',
    '82000000-0000-4000-8000-000000000001',
    null,
    'instagram',
    'Atomic edit source',
    'Review-stage content that may be edited atomically.',
    'review',
    '81000000-0000-4000-8000-000000000001',
    'brand',
    'post',
    'authority'
  ),
  (
    '87000000-0000-4000-8000-000000000002',
    '82000000-0000-4000-8000-000000000001',
    null,
    'facebook',
    'Already approved',
    'Approved content must not be mutable through the review edit RPC.',
    'approved',
    '81000000-0000-4000-8000-000000000001',
    'brand',
    'post',
    'authority'
  );

update public.content_drafts
set approved_at = now(),
    approved_by = '81000000-0000-4000-8000-000000000001'
where id = '87000000-0000-4000-8000-000000000002';

insert into public.content_assets (
  id,
  workspace_id,
  content_id,
  asset_type,
  source,
  status,
  storage_bucket,
  storage_path,
  public_url,
  mime_type,
  created_by
)
values (
  '88000000-0000-4000-8000-000000000001',
  '82000000-0000-4000-8000-000000000001',
  '87000000-0000-4000-8000-000000000001',
  'image',
  'generated',
  'ready',
  'content-engine-drafts',
  'ci/atomic-edit.jpg',
  null,
  'image/jpeg',
  '81000000-0000-4000-8000-000000000001'
);

insert into public.content_publications (
  id,
  workspace_id,
  content_id,
  provider,
  status,
  idempotency_key,
  last_error
)
values (
  '89000000-0000-4000-8000-000000000001',
  '82000000-0000-4000-8000-000000000001',
  '87000000-0000-4000-8000-000000000001',
  'meta',
  'blocked',
  'ci-atomic-edit',
  'Waiting for approval.'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select *
from public.edit_content_review_item(
  '82000000-0000-4000-8000-000000000001'::uuid,
  '87000000-0000-4000-8000-000000000001'::uuid,
  'Atomic edit destination',
  'A safer hook',
  'The copy, media invalidation and stale publication cancellation commit together.',
  'Review the system',
  'Generate a new visual that matches the edited copy.'
);

reset role;

do $$
declare
  draft_title text;
  draft_status text;
  asset_status text;
  publication_status text;
  audit_count integer;
  approved_edit_blocked boolean := false;
begin
  select title, status into draft_title, draft_status
  from public.content_drafts
  where id = '87000000-0000-4000-8000-000000000001';

  select status into asset_status
  from public.content_assets
  where id = '88000000-0000-4000-8000-000000000001';

  select status into publication_status
  from public.content_publications
  where id = '89000000-0000-4000-8000-000000000001';

  select count(*) into audit_count
  from public.content_review_events
  where content_id = '87000000-0000-4000-8000-000000000001'
    and event_type = 'content_edited';

  if draft_title <> 'Atomic edit destination' or draft_status <> 'review' then
    raise exception 'Atomic edit failure: draft mutation was not committed correctly';
  end if;
  if asset_status <> 'archived' then
    raise exception 'Atomic edit failure: generated media was not invalidated';
  end if;
  if publication_status <> 'cancelled' then
    raise exception 'Atomic edit failure: stale publication was not cancelled';
  end if;
  if audit_count <> 1 then
    raise exception 'Atomic edit failure: expected exactly one audit event, got %', audit_count;
  end if;

  perform set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000001', true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  begin
    perform * from public.edit_content_review_item(
      '82000000-0000-4000-8000-000000000001'::uuid,
      '87000000-0000-4000-8000-000000000002'::uuid,
      'Forbidden rewrite',
      '',
      'This approved record must remain unchanged by review editing.',
      '',
      ''
    );
  exception
    when sqlstate '55000' then
      approved_edit_blocked := true;
  end;

  if not approved_edit_blocked then
    raise exception 'Atomic edit failure: approved content could be rewritten';
  end if;
end;
$$;

do $$
begin
  if not has_function_privilege('authenticated', 'public.edit_content_review_item(uuid,uuid,text,text,text,text,text)', 'EXECUTE') then
    raise exception 'Atomic edit failure: authenticated admins cannot invoke review edit RPC';
  end if;
  if has_function_privilege('anon', 'public.edit_content_review_item(uuid,uuid,text,text,text,text,text)', 'EXECUTE') then
    raise exception 'Atomic edit failure: anonymous role can invoke review edit RPC';
  end if;
end;
$$;

rollback;
select 'content engine atomic review edit passed' as result;
