-- Secure intra-day Content Engine scheduler.
-- A random bearer token lives only in Supabase Vault; Orbit stores and verifies only its SHA-256 hash.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.content_worker_auth (
  id text primary key,
  secret_hash text not null check (char_length(secret_hash) = 64),
  created_at timestamptz not null default now(),
  rotated_at timestamptz not null default now()
);

alter table public.content_worker_auth enable row level security;
revoke all on table public.content_worker_auth from anon, authenticated;

alter table public.content_brand_profiles
  add column if not exists publishing_enabled boolean not null default false;

do $$
declare
  worker_secret text;
  worker_hash text;
begin
  select decrypted_secret
    into worker_secret
  from vault.decrypted_secrets
  where name = 'orbit_content_engine_worker_secret'
  limit 1;

  if worker_secret is null then
    worker_secret := encode(extensions.gen_random_bytes(32), 'hex');
    perform vault.create_secret(
      worker_secret,
      'orbit_content_engine_worker_secret',
      'Bearer secret for Supabase pg_cron -> Orbit Content Engine worker'
    );
  end if;

  worker_hash := encode(extensions.digest(convert_to(worker_secret, 'UTF8'), 'sha256'), 'hex');
  insert into public.content_worker_auth(id, secret_hash, rotated_at)
  values ('publisher', worker_hash, now())
  on conflict (id) do update
    set secret_hash = excluded.secret_hash,
        rotated_at = excluded.rotated_at;
end
$$;

create or replace function public.claim_content_publications(max_jobs integer default 5)
returns setof public.content_publications
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if max_jobs < 1 or max_jobs > 20 then
    raise exception 'max_jobs must be between 1 and 20';
  end if;

  return query
  with claimable as (
    select p.id
    from public.content_publications p
    join public.content_brand_profiles profile on profile.workspace_id = p.workspace_id
    where p.provider = 'meta'
      and profile.publishing_enabled = true
      and p.status in ('queued','failed')
      and p.attempts < 6
      and coalesce(p.next_attempt_at, p.scheduled_for, p.created_at) <= now()
      and (p.locked_at is null or p.locked_at < now() - interval '10 minutes')
    order by coalesce(p.scheduled_for, p.created_at), p.created_at
    for update of p skip locked
    limit max_jobs
  ), claimed as (
    update public.content_publications p
    set status = 'publishing',
        attempts = p.attempts + 1,
        last_attempt_at = now(),
        locked_at = now(),
        lock_token = gen_random_uuid(),
        last_error = null
    from claimable c
    where p.id = c.id
    returning p.*
  )
  select * from claimed;
end;
$$;

revoke all on function public.claim_content_publications(integer) from public, anon, authenticated;
grant execute on function public.claim_content_publications(integer) to service_role;

do $$
declare
  existing_job bigint;
begin
  select jobid into existing_job
  from cron.job
  where jobname = 'orbit-content-engine-worker'
  limit 1;

  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;
end
$$;

select cron.schedule(
  'orbit-content-engine-worker',
  '*/5 * * * *',
  $content_worker$
  select net.http_post(
    url := 'https://orbit-two-delta.vercel.app/api/internal/content-engine-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'orbit_content_engine_worker_secret'
        limit 1
      )
    ),
    body := '{"source":"pg_cron","version":1}'::jsonb,
    timeout_milliseconds := 240000
  );
  $content_worker$
);

comment on column public.content_brand_profiles.publishing_enabled is
  'Founder-controlled kill switch. Approved content is eligible for automatic provider delivery only when true.';
