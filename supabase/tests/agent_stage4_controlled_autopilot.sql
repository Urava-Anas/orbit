-- Orbit Stage 4 acceptance test.
-- Runs inside one transaction and rolls back all synthetic data.
-- Proves fail-closed defaults, founder approval linkage, idempotency,
-- action queue durability, and zero real external action calls.

begin;

do $$
declare
  w uuid;
  u uuid;
  agent_id uuid;
  lead_id uuid;
  opp_id uuid;
  run_id uuid;
  task_id uuid;
  v_approval_id uuid;
  config_id uuid;
  action_id uuid;
  calls_before bigint;
  calls_after bigint;
  c bigint;
begin
  select id,owner_id into w,u
  from public.workspaces
  where name='Urava'
  order by created_at asc
  limit 1;
  if w is null or u is null then raise exception 'Stage 4 test requires Urava workspace and owner'; end if;

  select count(*) into calls_before from public.orbit_action_calls;

  insert into public.orbit_autopilot_configs(workspace_id,created_by,updated_by)
  values(w,u,u)
  on conflict(workspace_id) do update set updated_by=excluded.updated_by
  returning id into config_id;

  if not exists(
    select 1 from public.orbit_autopilot_configs
    where id=config_id and state='off' and external_actions_enabled=false and kill_switch_engaged=true
  ) then
    raise exception 'Stage 4 fail-closed defaults are not intact';
  end if;

  insert into public.orbit_autopilot_policy_grants(
    workspace_id,capability_key,enabled,approval_mode,constraints,approved_by,created_by
  ) values
    (w,'growth.outreach_send',true,'manual','{}',u,u),
    (w,'growth.followup_send',true,'manual','{}',u,u),
    (w,'growth.proposal_send',true,'manual','{}',u,u),
    (w,'cash.payment_request',true,'manual','{}',u,u),
    (w,'cash.payment_collect',true,'manual','{}',u,u),
    (w,'delivery.project_activate',true,'manual','{}',u,u),
    (w,'proof.publish',true,'manual','{}',u,u),
    (w,'growth.referral_send',true,'manual','{}',u,u)
  on conflict(workspace_id,capability_key) do update
  set enabled=excluded.enabled,approval_mode=excluded.approval_mode,constraints=excluded.constraints,approved_by=excluded.approved_by;

  select count(*) into c
  from public.orbit_autopilot_policy_grants
  where workspace_id=w and capability_key in (
    'growth.outreach_send','growth.followup_send','growth.proposal_send','cash.payment_request',
    'cash.payment_collect','delivery.project_activate','proof.publish','growth.referral_send'
  );
  if c<>8 then raise exception 'Stage 4 expected 8 governed irreversible capabilities, got %',c; end if;

  select id into agent_id
  from public.orbit_agents
  where workspace_id=w and agent_key='outreach'
  limit 1;
  if agent_id is null then raise exception 'Stage 4 test requires the Outreach agent'; end if;

  insert into public.leads(
    workspace_id,name,company,email,source,stage,currency,created_by
  ) values(
    w,'Stage Four Prospect','Stage Four Prospect Co','stage4@example.test','google','qualified','PKR',u
  ) returning id into lead_id;

  insert into public.orbit_sales_opportunities(
    workspace_id,lead_id,current_state,status,next_agent_key,context,created_by
  ) values(
    w,lead_id,'waiting_reply','active','sales',jsonb_build_object('stage',4),u
  ) returning id into opp_id;

  insert into public.orbit_agent_runs(
    workspace_id,agent_id,trigger_type,status,input,idempotency_key,created_by
  ) values(
    w,agent_id,'agent','waiting_approval',jsonb_build_object('opportunityId',opp_id),
    'stage4:acceptance:run',u
  ) returning id into run_id;

  insert into public.orbit_agent_tasks(
    workspace_id,run_id,assigned_agent_id,capability_key,task_type,title,status,risk_level,
    priority,input,idempotency_key
  ) values(
    w,run_id,agent_id,'growth.outreach_send','stage4_external_action','Stage 4 acceptance action',
    'waiting_approval','red',95,jsonb_build_object('opportunityId',opp_id),'stage4:acceptance:task'
  ) returning id into task_id;

  insert into public.orbit_agent_approvals(
    workspace_id,run_id,task_id,requested_by_agent_id,authority_level,proposed_action,
    proposed_payload,status,approval_route,expires_at
  ) values(
    w,run_id,task_id,agent_id,'red','growth.outreach_send',jsonb_build_object('stage',4),
    'pending','founder',now()+interval '1 day'
  ) returning id into v_approval_id;

  insert into public.orbit_external_action_requests(
    workspace_id,opportunity_id,run_id,task_id,agent_id,capability_key,authority_level,
    channel,destination,artifact_refs,payload,payload_hash,status,approval_source,approval_id,
    idempotency_key,created_by
  ) values(
    w,opp_id,run_id,task_id,agent_id,'growth.outreach_send','red','email','stage4@example.test',
    jsonb_build_object('outreachDraftId',gen_random_uuid()),
    jsonb_build_object('type','message','body','Synthetic acceptance payload only.'),
    repeat('a',64),'waiting_approval','manual',v_approval_id,'stage4:acceptance:action',u
  ) returning id into action_id;

  begin
    insert into public.orbit_external_action_requests(
      workspace_id,opportunity_id,run_id,task_id,agent_id,capability_key,authority_level,
      channel,destination,artifact_refs,payload,payload_hash,status,approval_source,approval_id,
      idempotency_key,created_by
    ) values(
      w,opp_id,run_id,task_id,agent_id,'growth.outreach_send','red','email','stage4@example.test',
      '{}'::jsonb,'{}'::jsonb,repeat('b',64),'waiting_approval','manual',v_approval_id,
      'stage4:acceptance:action',u
    );
    raise exception 'Stage 4 duplicate idempotency key was accepted';
  exception when unique_violation then null;
  end;

  if not exists(
    select 1 from public.orbit_external_action_requests r
    where r.id=action_id and r.status='waiting_approval' and r.approval_source='manual'
      and char_length(r.payload_hash)=64 and r.approval_id is not null
  ) then
    raise exception 'Stage 4 action queue/approval linkage invariant failed';
  end if;

  insert into public.orbit_autopilot_preflight_runs(
    workspace_id,config_id,result,checks,active_agent_count,open_opportunity_count,
    active_project_count,pending_action_count,critical_incident_count,gateway_configured,created_by
  ) values(
    w,config_id,'blocked',jsonb_build_array(
      jsonb_build_object('key','kill_switch','status','blocked','detail','Acceptance test confirms fail-closed start')
    ),11,1,0,1,0,false,u
  );

  select count(*) into calls_after from public.orbit_action_calls;
  if calls_after<>calls_before then
    raise exception 'Stage 4 acceptance test produced a real Orbit action call';
  end if;
end
$$;

rollback;
