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
  goal,
  approved_at,
  approved_by
)
values (
  '86000000-0000-4000-8000-000000000001',
  '82000000-0000-4000-8000-000000000001',
  null,
  'facebook',
  'Published immutable content',
  'This record represents content already confirmed by the provider.',
  'published',
  '81000000-0000-4000-8000-000000000001',
  'brand',
  'post',
  'authority',
  now(),
  '81000000-0000-4000-8000-000000000001'
);

do $$
declare
  rewrite_blocked boolean := false;
begin
  begin
    update public.content_drafts
    set title = 'Rewritten after publication',
        status = 'review',
        approved_at = null,
        approved_by = null
    where id = '86000000-0000-4000-8000-000000000001';
  exception
    when sqlstate '55000' then
      rewrite_blocked := true;
  end;

  if not rewrite_blocked then
    raise exception 'Content Engine integrity failure: published content was rewritable';
  end if;
end;
$$;

rollback;
select 'published Content Engine history is immutable' as result;
