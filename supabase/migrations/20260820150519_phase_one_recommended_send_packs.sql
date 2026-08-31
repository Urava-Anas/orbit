-- Phase One: reusable commercial content and one-click recommended send packs.
-- The pack freezes the selected price, message and content before the governed
-- Stage 4 sender is allowed to create an external action.

create table if not exists public.commercial_content_assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null,
  asset_type text not null default 'poster',
  asset_url text,
  thumbnail_url text,
  body text not null default '',
  audience_tags text[] not null default '{}'::text[],
  industry_tags text[] not null default '{}'::text[],
  service_categories text[] not null default '{}'::text[],
  lead_stages text[] not null default '{}'::text[],
  channels text[] not null default array['whatsapp']::text[],
  goal text not null default 'build_trust',
  language text not null default 'en',
  cta text not null default '',
  proof_id uuid,
  linked_pricing_plan_id uuid,
  status text not null default 'draft',
  sent_count integer not null default 0,
  reply_count integer not null default 0,
  meeting_count integer not null default 0,
  won_count integer not null default 0,
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commercial_content_assets_workspace_id_id_key unique (workspace_id, id),
  constraint commercial_content_assets_title_check check (char_length(title) between 2 and 180),
  constraint commercial_content_assets_type_check check (asset_type in ('poster','offer','service_explainer','case_study','testimonial','before_after','followup','seasonal','authority','proof')),
  constraint commercial_content_assets_url_check check (asset_url is null or char_length(asset_url) <= 1000),
  constraint commercial_content_assets_thumbnail_check check (thumbnail_url is null or char_length(thumbnail_url) <= 1000),
  constraint commercial_content_assets_body_check check (char_length(body) <= 8000),
  constraint commercial_content_assets_goal_check check (goal in ('start_conversation','build_trust','explain_offer','request_decision','follow_up','reactivate','broadcast')),
  constraint commercial_content_assets_language_check check (char_length(language) between 2 and 20),
  constraint commercial_content_assets_cta_check check (char_length(cta) <= 500),
  constraint commercial_content_assets_status_check check (status in ('draft','approved','expired','archived')),
  constraint commercial_content_assets_approved_payload_check check (
    status <> 'approved' or nullif(btrim(asset_url), '') is not null or char_length(body) >= 10
  ),
  constraint commercial_content_assets_channels_check check (
    cardinality(channels) between 1 and 6
    and channels <@ array['email','whatsapp','instagram','facebook','linkedin','website']::text[]
  ),
  constraint commercial_content_assets_counts_check check (
    sent_count >= 0 and reply_count >= 0 and meeting_count >= 0 and won_count >= 0
  ),
  constraint commercial_content_assets_proof_fk foreign key (workspace_id, proof_id)
    references public.proofs(workspace_id, id) on delete set null,
  constraint commercial_content_assets_pricing_fk foreign key (workspace_id, linked_pricing_plan_id)
    references public.pricing_plans(workspace_id, id) on delete restrict
);

create table if not exists public.orbit_recommended_send_packs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id uuid not null,
  opportunity_id uuid not null,
  pricing_plan_id uuid not null,
  content_asset_id uuid,
  action_request_id uuid,
  channel text not null,
  subject text,
  message_body text not null,
  proposal_title text not null,
  proposal_scope jsonb not null default '[]'::jsonb,
  pricing_snapshot jsonb not null,
  content_snapshot jsonb not null default '{}'::jsonb,
  recommendation_basis jsonb not null default '{}'::jsonb,
  confidence smallint not null,
  requires_approval boolean not null default false,
  status text not null default 'ready',
  blocked_reason text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  constraint orbit_recommended_send_packs_workspace_id_id_key unique (workspace_id, id),
  constraint orbit_recommended_send_packs_channel_check check (channel in ('email','whatsapp','manual')),
  constraint orbit_recommended_send_packs_subject_check check (subject is null or char_length(subject) <= 240),
  constraint orbit_recommended_send_packs_message_check check (char_length(message_body) between 10 and 10000),
  constraint orbit_recommended_send_packs_title_check check (char_length(proposal_title) between 2 and 240),
  constraint orbit_recommended_send_packs_scope_check check (jsonb_typeof(proposal_scope) = 'array'),
  constraint orbit_recommended_send_packs_pricing_check check (jsonb_typeof(pricing_snapshot) = 'object'),
  constraint orbit_recommended_send_packs_content_check check (jsonb_typeof(content_snapshot) = 'object'),
  constraint orbit_recommended_send_packs_basis_check check (jsonb_typeof(recommendation_basis) = 'object'),
  constraint orbit_recommended_send_packs_confidence_check check (confidence between 0 and 100),
  constraint orbit_recommended_send_packs_status_check check (status in ('ready','waiting_approval','queued','sent','blocked','superseded')),
  constraint orbit_recommended_send_packs_blocked_reason_check check (blocked_reason is null or char_length(blocked_reason) <= 2000),
  constraint orbit_recommended_send_packs_lead_fk foreign key (workspace_id, lead_id)
    references public.leads(workspace_id, id) on delete cascade,
  constraint orbit_recommended_send_packs_opportunity_fk foreign key (workspace_id, opportunity_id)
    references public.orbit_sales_opportunities(workspace_id, id) on delete cascade,
  constraint orbit_recommended_send_packs_pricing_fk foreign key (workspace_id, pricing_plan_id)
    references public.pricing_plans(workspace_id, id) on delete restrict,
  constraint orbit_recommended_send_packs_content_fk foreign key (workspace_id, content_asset_id)
    references public.commercial_content_assets(workspace_id, id) on delete restrict,
  constraint orbit_recommended_send_packs_action_fk foreign key (workspace_id, action_request_id)
    references public.orbit_external_action_requests(workspace_id, id) on delete restrict
);

create index if not exists commercial_content_assets_recommendation_idx
  on public.commercial_content_assets(workspace_id, status, asset_type, updated_at desc);
create index if not exists commercial_content_assets_pricing_idx
  on public.commercial_content_assets(workspace_id, linked_pricing_plan_id)
  where linked_pricing_plan_id is not null;
create index if not exists orbit_recommended_send_packs_lead_idx
  on public.orbit_recommended_send_packs(workspace_id, lead_id, created_at desc);
create index if not exists orbit_recommended_send_packs_status_idx
  on public.orbit_recommended_send_packs(workspace_id, status, created_at desc);
create unique index if not exists orbit_recommended_send_packs_one_open_per_lead_idx
  on public.orbit_recommended_send_packs(workspace_id, lead_id)
  where status in ('ready','waiting_approval','queued');

create function private.preserve_recommended_send_pack()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.workspace_id is distinct from old.workspace_id
    or new.lead_id is distinct from old.lead_id
    or new.opportunity_id is distinct from old.opportunity_id
    or new.pricing_plan_id is distinct from old.pricing_plan_id
    or new.content_asset_id is distinct from old.content_asset_id
    or new.channel is distinct from old.channel
    or new.subject is distinct from old.subject
    or new.message_body is distinct from old.message_body
    or new.proposal_title is distinct from old.proposal_title
    or new.proposal_scope is distinct from old.proposal_scope
    or new.pricing_snapshot is distinct from old.pricing_snapshot
    or new.content_snapshot is distinct from old.content_snapshot
    or new.recommendation_basis is distinct from old.recommendation_basis
    or new.confidence is distinct from old.confidence
    or new.requires_approval is distinct from old.requires_approval
    or new.created_by is distinct from old.created_by then
    raise exception 'Recommended send-pack commercial contents are immutable; create a replacement pack.';
  end if;

  if old.action_request_id is not null and new.action_request_id is distinct from old.action_request_id then
    raise exception 'Recommended send-pack action request cannot change after linkage.';
  end if;

  if old.status in ('sent','superseded') and new.status is distinct from old.status then
    raise exception 'Terminal recommended send-pack status cannot change.';
  end if;

  if old.status = 'blocked' and new.status not in ('blocked','superseded') then
    raise exception 'Blocked recommended send pack must be replaced before retry.';
  end if;

  if new.status = 'sent' and new.sent_at is null then
    raise exception 'Sent recommended send pack requires sent_at.';
  end if;

  return new;
end;
$$;

revoke execute on function private.preserve_recommended_send_pack() from public, anon, authenticated;

create function private.increment_send_pack_asset_usage()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status <> 'sent' and new.status = 'sent' and new.content_asset_id is not null then
    update public.commercial_content_assets
    set sent_count = sent_count + 1,
        updated_at = now()
    where workspace_id = new.workspace_id
      and id = new.content_asset_id;
  end if;
  return new;
end;
$$;

revoke execute on function private.increment_send_pack_asset_usage() from public, anon, authenticated;

create trigger commercial_content_assets_set_updated_at
before update on public.commercial_content_assets
for each row execute function private.set_updated_at();

create trigger commercial_content_assets_capture_audit
after insert or update or delete on public.commercial_content_assets
for each row execute function private.capture_audit_event();

create trigger orbit_recommended_send_packs_set_updated_at
before update on public.orbit_recommended_send_packs
for each row execute function private.set_updated_at();

create trigger orbit_recommended_send_packs_preserve_snapshot
before update on public.orbit_recommended_send_packs
for each row execute function private.preserve_recommended_send_pack();

create trigger orbit_recommended_send_packs_capture_audit
after insert or update or delete on public.orbit_recommended_send_packs
for each row execute function private.capture_audit_event();

create trigger orbit_recommended_send_packs_increment_asset_usage
after update on public.orbit_recommended_send_packs
for each row execute function private.increment_send_pack_asset_usage();

alter table public.commercial_content_assets enable row level security;
alter table public.orbit_recommended_send_packs enable row level security;

create policy commercial_content_assets_select_member on public.commercial_content_assets
for select to authenticated using ((select private.is_workspace_member(workspace_id)));
create policy commercial_content_assets_insert_admin on public.commercial_content_assets
for insert to authenticated with check ((select private.is_workspace_admin(workspace_id)));
create policy commercial_content_assets_update_admin on public.commercial_content_assets
for update to authenticated using ((select private.is_workspace_admin(workspace_id)))
with check ((select private.is_workspace_admin(workspace_id)));

create policy orbit_recommended_send_packs_select_member on public.orbit_recommended_send_packs
for select to authenticated using ((select private.is_workspace_member(workspace_id)));
create policy orbit_recommended_send_packs_insert_admin on public.orbit_recommended_send_packs
for insert to authenticated with check ((select private.is_workspace_admin(workspace_id)));
create policy orbit_recommended_send_packs_update_admin on public.orbit_recommended_send_packs
for update to authenticated using ((select private.is_workspace_admin(workspace_id)))
with check ((select private.is_workspace_admin(workspace_id)));

revoke all on table public.commercial_content_assets, public.orbit_recommended_send_packs from anon, authenticated;
grant select, insert, update on table public.commercial_content_assets, public.orbit_recommended_send_packs to authenticated;

comment on table public.commercial_content_assets is
  'Approved reusable posters, proof, offers and follow-up visuals used by Orbit commercial recommendations.';
comment on table public.orbit_recommended_send_packs is
  'Immutable-at-send recommended bundle of approved price, message, proposal scope and optional content asset.';
