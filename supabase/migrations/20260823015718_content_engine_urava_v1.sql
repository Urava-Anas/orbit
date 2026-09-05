-- Orbit Content Engine v1
-- Adds the durable daily approval loop without requiring every content item to originate from proof.

create table if not exists public.content_brand_profiles (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  audience text not null default '',
  voice text not null default 'Clear, practical, evidence-led and concise.',
  pillars text[] not null default '{}',
  offers text[] not null default '{}',
  proof_rules text not null default 'Never invent results, clients, numbers, testimonials or scarcity. Use approved proof when making outcome claims.',
  default_cta text not null default 'Start a conversation.',
  timezone text not null default 'UTC',
  daily_target_count smallint not null default 5 check (daily_target_count between 1 and 20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.content_batches (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  batch_date date not null,
  status text not null default 'draft' check (status in ('draft','review','approved','scheduled','running','completed','blocked')),
  focus text not null default '',
  strategy_notes text not null default '',
  generated_at timestamptz,
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, batch_date),
  unique (workspace_id, id)
);

alter table public.content_drafts
  alter column proof_id drop not null;

alter table public.content_drafts
  add column if not exists batch_id uuid,
  add column if not exists source_type text not null default 'manual',
  add column if not exists format text not null default 'post',
  add column if not exists goal text not null default 'authority',
  add column if not exists hook text,
  add column if not exists cta text,
  add column if not exists media_brief text,
  add column if not exists scheduled_for timestamptz,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references auth.users(id) on delete set null,
  add column if not exists rejection_reason text,
  add column if not exists generation_metadata jsonb not null default '{}'::jsonb,
  add column if not exists sort_order smallint not null default 0;

alter table public.content_drafts
  drop constraint if exists content_drafts_channel_check,
  add constraint content_drafts_channel_check check (
    channel in ('website','linkedin','facebook','instagram','tiktok','youtube','whatsapp')
  );

alter table public.content_drafts
  drop constraint if exists content_drafts_status_check,
  add constraint content_drafts_status_check check (
    status in ('draft','review','approved','rejected','scheduled','published','failed','archived')
  );

alter table public.content_drafts
  drop constraint if exists content_drafts_source_type_check,
  add constraint content_drafts_source_type_check check (
    source_type in ('brand','proof','project','offer','insight','manual')
  );

alter table public.content_drafts
  drop constraint if exists content_batch_same_workspace,
  add constraint content_batch_same_workspace
    foreign key (workspace_id, batch_id)
    references public.content_batches(workspace_id, id)
    on delete set null (batch_id);

create table if not exists public.content_publications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  content_id uuid not null references public.content_drafts(id) on delete cascade,
  provider text not null,
  status text not null default 'blocked' check (status in ('blocked','queued','publishing','published','failed','cancelled')),
  scheduled_for timestamptz,
  provider_post_id text,
  provider_post_url text,
  attempts smallint not null default 0 check (attempts between 0 and 20),
  last_error text,
  idempotency_key text not null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint content_publications_provider_check check (provider in ('meta','linkedin','tiktok','website','manual')),
  unique (workspace_id, content_id),
  unique (workspace_id, idempotency_key),
  unique (workspace_id, id)
);

create table if not exists public.content_metric_snapshots (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  content_id uuid not null references public.content_drafts(id) on delete cascade,
  publication_id uuid references public.content_publications(id) on delete cascade,
  impressions bigint not null default 0 check (impressions >= 0),
  reach bigint not null default 0 check (reach >= 0),
  engagements bigint not null default 0 check (engagements >= 0),
  clicks bigint not null default 0 check (clicks >= 0),
  leads bigint not null default 0 check (leads >= 0),
  raw_metrics jsonb not null default '{}'::jsonb,
  captured_at timestamptz not null default now()
);

create table if not exists public.content_learning_notes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  learned_on date not null default current_date,
  signal_type text not null default 'performance' check (signal_type in ('performance','audience','format','topic','offer','timing','manual')),
  insight text not null check (char_length(insight) between 3 and 2000),
  action text not null default '' check (char_length(action) <= 2000),
  confidence numeric(4,3) not null default 0.5 check (confidence between 0 and 1),
  source_metrics jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists content_batches_workspace_date_idx on public.content_batches(workspace_id, batch_date desc);
create index if not exists content_drafts_workspace_batch_idx on public.content_drafts(workspace_id, batch_id, sort_order);
create index if not exists content_drafts_schedule_idx on public.content_drafts(workspace_id, scheduled_for) where scheduled_for is not null;
create index if not exists content_publications_queue_idx on public.content_publications(workspace_id, status, scheduled_for);
create index if not exists content_metric_snapshots_content_idx on public.content_metric_snapshots(content_id, captured_at desc);
create index if not exists content_learning_workspace_date_idx on public.content_learning_notes(workspace_id, learned_on desc, created_at desc);

alter table public.content_brand_profiles enable row level security;
alter table public.content_batches enable row level security;
alter table public.content_publications enable row level security;
alter table public.content_metric_snapshots enable row level security;
alter table public.content_learning_notes enable row level security;

drop policy if exists content_brand_profiles_select_member on public.content_brand_profiles;
create policy content_brand_profiles_select_member on public.content_brand_profiles for select to authenticated
using ((select private.is_workspace_member(content_brand_profiles.workspace_id)));
drop policy if exists content_brand_profiles_manage_admin on public.content_brand_profiles;
create policy content_brand_profiles_manage_admin on public.content_brand_profiles for all to authenticated
using ((select private.is_workspace_admin(content_brand_profiles.workspace_id)) and (select private.orbit_workspace_can_write(content_brand_profiles.workspace_id)))
with check ((select private.is_workspace_admin(content_brand_profiles.workspace_id)) and (select private.orbit_workspace_can_write(content_brand_profiles.workspace_id)));

drop policy if exists content_batches_select_member on public.content_batches;
create policy content_batches_select_member on public.content_batches for select to authenticated
using ((select private.is_workspace_member(content_batches.workspace_id)));
drop policy if exists content_batches_manage_admin on public.content_batches;
create policy content_batches_manage_admin on public.content_batches for all to authenticated
using ((select private.is_workspace_admin(content_batches.workspace_id)) and (select private.orbit_workspace_can_write(content_batches.workspace_id)))
with check ((select private.is_workspace_admin(content_batches.workspace_id)) and (select private.orbit_workspace_can_write(content_batches.workspace_id)));

drop policy if exists content_publications_select_member on public.content_publications;
create policy content_publications_select_member on public.content_publications for select to authenticated
using ((select private.is_workspace_member(content_publications.workspace_id)));
drop policy if exists content_publications_manage_admin on public.content_publications;
create policy content_publications_manage_admin on public.content_publications for all to authenticated
using ((select private.is_workspace_admin(content_publications.workspace_id)) and (select private.orbit_workspace_can_write(content_publications.workspace_id)))
with check ((select private.is_workspace_admin(content_publications.workspace_id)) and (select private.orbit_workspace_can_write(content_publications.workspace_id)));

drop policy if exists content_metric_snapshots_select_member on public.content_metric_snapshots;
create policy content_metric_snapshots_select_member on public.content_metric_snapshots for select to authenticated
using ((select private.is_workspace_member(content_metric_snapshots.workspace_id)));
drop policy if exists content_metric_snapshots_manage_admin on public.content_metric_snapshots;
create policy content_metric_snapshots_manage_admin on public.content_metric_snapshots for all to authenticated
using ((select private.is_workspace_admin(content_metric_snapshots.workspace_id)) and (select private.orbit_workspace_can_write(content_metric_snapshots.workspace_id)))
with check ((select private.is_workspace_admin(content_metric_snapshots.workspace_id)) and (select private.orbit_workspace_can_write(content_metric_snapshots.workspace_id)));

drop policy if exists content_learning_notes_select_member on public.content_learning_notes;
create policy content_learning_notes_select_member on public.content_learning_notes for select to authenticated
using ((select private.is_workspace_member(content_learning_notes.workspace_id)));
drop policy if exists content_learning_notes_manage_admin on public.content_learning_notes;
create policy content_learning_notes_manage_admin on public.content_learning_notes for all to authenticated
using ((select private.is_workspace_admin(content_learning_notes.workspace_id)) and (select private.orbit_workspace_can_write(content_learning_notes.workspace_id)))
with check ((select private.is_workspace_admin(content_learning_notes.workspace_id)) and (select private.orbit_workspace_can_write(content_learning_notes.workspace_id)));

-- Support TikTok as a first-class social provider while keeping existing providers intact.
alter table public.integration_connections drop constraint if exists integration_connections_provider_check;
alter table public.integration_connections add constraint integration_connections_provider_check check (
  provider in ('github','vercel','google_search_console','google_analytics','meta','instagram','linkedin','geoapify','tiktok')
);

-- Reuse Orbit's existing updated_at trigger function.
drop trigger if exists content_brand_profiles_set_updated_at on public.content_brand_profiles;
create trigger content_brand_profiles_set_updated_at before update on public.content_brand_profiles
for each row execute function private.set_updated_at();
drop trigger if exists content_batches_set_updated_at on public.content_batches;
create trigger content_batches_set_updated_at before update on public.content_batches
for each row execute function private.set_updated_at();
drop trigger if exists content_publications_set_updated_at on public.content_publications;
create trigger content_publications_set_updated_at before update on public.content_publications
for each row execute function private.set_updated_at();

comment on table public.content_brand_profiles is 'Workspace-specific Content Engine brand brain and publishing guardrails.';
comment on table public.content_batches is 'One daily content strategy and founder approval envelope per workspace.';
comment on table public.content_publications is 'Durable, idempotent publishing queue. A row being queued never implies provider delivery succeeded.';
comment on table public.content_metric_snapshots is 'Provider performance snapshots used by the Content Engine learning loop.';
comment on table public.content_learning_notes is 'Human- or system-derived content learnings that inform future daily batches.';
