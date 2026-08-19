-- Keep the Lead Engine dashboard O(1) in application memory as tenant lead volume grows.

create index if not exists leads_workspace_source_idx
  on public.leads(workspace_id, source);
create index if not exists leads_workspace_score_created_idx
  on public.leads(workspace_id, lead_score desc nulls last, created_at desc);
create index if not exists lead_activities_workspace_occurred_idx
  on public.lead_activities(workspace_id, occurred_at desc);
create index if not exists projects_workspace_status_idx
  on public.projects(workspace_id, status);
create index if not exists orbit_external_actions_workspace_created_idx
  on public.orbit_external_action_requests(workspace_id, created_at desc);

create or replace function public.get_lead_engine_summary(p_workspace_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  result jsonb;
begin
  if auth.uid() is null or not private.is_workspace_member(p_workspace_id) then
    raise exception 'workspace membership required' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'total', count(*),
    'sources', jsonb_build_object(
      'website', count(*) filter (where source = 'website'),
      'google', count(*) filter (where source in ('google','local_search')),
      'instagram', count(*) filter (where source = 'instagram'),
      'linkedin', count(*) filter (where source = 'linkedin'),
      'facebook', count(*) filter (where source = 'facebook'),
      'youtube', 0,
      'referrals', count(*) filter (where source = 'referral'),
      'cold-list', count(*) filter (where source = 'other')
    ),
    'flow', jsonb_build_array(
      count(*) filter (where stage <> 'lost'),
      count(*) filter (where stage <> 'lost' and (lead_score is not null or stage not in ('new','raw'))),
      count(*) filter (where stage <> 'lost' and (lead_score is not null or stage in ('scored','qualified','contacted','interested','demo_booked','proposal','won'))),
      count(*) filter (where stage <> 'lost' and stage in ('contacted','interested','demo_booked','proposal','won')),
      count(*) filter (where stage <> 'lost' and next_action is not null),
      count(*) filter (where stage <> 'lost' and stage in ('qualified','interested','demo_booked','proposal','won')),
      count(*) filter (where stage <> 'lost' and stage in ('proposal','won')),
      count(*) filter (where stage = 'won')
    )
  ) into result
  from public.leads
  where workspace_id = p_workspace_id;

  return coalesce(result, '{"total":0,"sources":{},"flow":[0,0,0,0,0,0,0,0]}'::jsonb);
end;
$$;

revoke all on function public.get_lead_engine_summary(uuid) from public, anon;
grant execute on function public.get_lead_engine_summary(uuid) to authenticated;

comment on function public.get_lead_engine_summary(uuid) is
  'Tenant-authorized aggregate metrics for the Lead Engine dashboard; avoids loading the full lead table into application memory.';
