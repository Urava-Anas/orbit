-- Phase One recommended send-pack acceptance test.
-- Verifies reusable content metadata, frozen commercial snapshots and archive-only retention.

begin;

do $$
declare
  w uuid;
  u uuid;
  lead_id uuid;
  plan_id uuid;
  opportunity_id uuid;
  asset_id uuid;
  pack_id uuid;
  mutation_blocked boolean := false;
begin
  select id, owner_id into w, u
  from public.workspaces
  where name = 'Urava'
  order by created_at asc
  limit 1;

  if w is null or u is null then
    raise exception 'Urava workspace/owner missing';
  end if;

  insert into public.leads (workspace_id,name,company,source,stage,currency,created_by)
  values (w,'Phase One Contact','Phase One Send Pack Co','direct','qualified','PKR',u)
  returning id into lead_id;

  insert into public.pricing_plans (
    workspace_id,plan_key,name,service_category,summary,pricing_type,
    base_price,min_price,max_price,currency,included_features,status,created_by,updated_by
  ) values (
    w,'phase-one-send-pack-plan','Phase One Send Pack Plan','Websites','Acceptance-only plan.',
    'fixed',60000,60000,60000,'PKR','["Website","WhatsApp enquiry"]'::jsonb,'active',u,u
  ) returning id into plan_id;

  insert into public.orbit_sales_opportunities (
    workspace_id,lead_id,current_state,status,next_agent_key,context,created_by
  ) values (
    w,lead_id,'proposal_drafted','active','payment_onboarding','{"phaseOneSendPack":true}'::jsonb,u
  ) returning id into opportunity_id;

  insert into public.commercial_content_assets (
    workspace_id,title,asset_type,asset_url,industry_tags,service_categories,
    lead_stages,channels,goal,cta,linked_pricing_plan_id,status,created_by,updated_by
  ) values (
    w,'Phase One Restaurant Poster','poster','https://example.test/poster.png',
    array['restaurant'],array['Websites'],array['qualified'],array['whatsapp','email'],
    'request_decision','Reply yes.',plan_id,'approved',u,u
  ) returning id into asset_id;

  insert into public.orbit_recommended_send_packs (
    workspace_id,lead_id,opportunity_id,pricing_plan_id,content_asset_id,channel,
    message_body,proposal_title,proposal_scope,pricing_snapshot,content_snapshot,
    recommendation_basis,confidence,created_by
  ) values (
    w,lead_id,opportunity_id,plan_id,asset_id,'whatsapp',
    'Acceptance-only approved commercial message.','Phase One Proposal',
    '[{"item":"Website","source":"pricing_plan"}]'::jsonb,
    jsonb_build_object('pricingPlanId',plan_id,'basePrice',60000,'currency','PKR','version',1),
    jsonb_build_object('contentAssetId',asset_id,'assetUrl','https://example.test/poster.png'),
    '{"cashvertisingGate":["buyer_clarity","proof","easy_next_action"]}'::jsonb,
    88,u
  ) returning id into pack_id;

  if not exists (
    select 1 from public.orbit_recommended_send_packs
    where id = pack_id
      and pricing_snapshot->>'currency' = 'PKR'
      and content_snapshot->>'contentAssetId' = asset_id::text
  ) then
    raise exception 'Recommended send-pack snapshots were not preserved';
  end if;

  begin
    update public.orbit_recommended_send_packs
    set message_body = 'Mutated after preview.'
    where id = pack_id;
  exception when others then
    mutation_blocked := true;
  end;
  if not mutation_blocked then
    raise exception 'Frozen send-pack contents could be mutated';
  end if;

  if not (select relrowsecurity from pg_class where oid = 'public.commercial_content_assets'::regclass) then
    raise exception 'Commercial content RLS is disabled';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.orbit_recommended_send_packs'::regclass) then
    raise exception 'Recommended send-pack RLS is disabled';
  end if;
  if has_table_privilege('authenticated','public.commercial_content_assets','DELETE') then
    raise exception 'Authenticated role received content delete permission';
  end if;
  if has_table_privilege('authenticated','public.orbit_recommended_send_packs','DELETE') then
    raise exception 'Authenticated role received send-pack delete permission';
  end if;
end;
$$;

rollback;
select 'recommended send packs passed' as result;
