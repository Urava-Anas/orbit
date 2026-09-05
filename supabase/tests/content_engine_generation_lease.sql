begin;

set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $$
declare
  first_claim record;
  second_claim record;
  reused_claim record;
begin
  select * into first_claim
  from public.claim_content_batch_generation(
    '82000000-0000-4000-8000-000000000001'::uuid,
    '2099-01-01'::date
  );

  if first_claim.claimed is not true or first_claim.reused is not false or first_claim.lock_token is null then
    raise exception 'Content generation lease failure: first claim was not exclusive';
  end if;

  select * into second_claim
  from public.claim_content_batch_generation(
    '82000000-0000-4000-8000-000000000001'::uuid,
    '2099-01-01'::date
  );

  if second_claim.claimed is not false or second_claim.reused is not false then
    raise exception 'Content generation lease failure: concurrent claim was allowed';
  end if;
  if second_claim.batch_id <> first_claim.batch_id then
    raise exception 'Content generation lease failure: concurrent claim changed the daily batch';
  end if;

  insert into public.content_drafts (
    workspace_id,
    batch_id,
    proof_id,
    channel,
    title,
    body,
    status,
    created_by,
    source_type,
    format,
    goal,
    sort_order
  ) values (
    '82000000-0000-4000-8000-000000000001'::uuid,
    first_claim.batch_id,
    null,
    'facebook',
    'Lease test draft',
    'A saved draft makes future generation requests reuse the daily batch.',
    'review',
    '81000000-0000-4000-8000-000000000001'::uuid,
    'brand',
    'post',
    'authority',
    0
  );

  select * into reused_claim
  from public.claim_content_batch_generation(
    '82000000-0000-4000-8000-000000000001'::uuid,
    '2099-01-01'::date
  );

  if reused_claim.claimed is not false or reused_claim.reused is not true then
    raise exception 'Content generation lease failure: existing daily drafts were not reused';
  end if;
end;
$$;

reset role;

do $$
begin
  if not has_function_privilege('authenticated', 'public.claim_content_batch_generation(uuid,date)', 'EXECUTE') then
    raise exception 'Content generation lease failure: authenticated admins cannot invoke lease RPC';
  end if;
  if not has_function_privilege('service_role', 'public.claim_content_batch_generation(uuid,date)', 'EXECUTE') then
    raise exception 'Content generation lease failure: service worker cannot invoke lease RPC';
  end if;
  if has_function_privilege('anon', 'public.claim_content_batch_generation(uuid,date)', 'EXECUTE') then
    raise exception 'Content generation lease failure: anonymous role can invoke lease RPC';
  end if;
end;
$$;

rollback;
select 'content engine generation lease passed' as result;
