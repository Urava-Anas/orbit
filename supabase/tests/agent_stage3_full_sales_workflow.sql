-- Orbit Stage 3 acceptance test.
-- Runs entirely inside a transaction and rolls back all synthetic state.

begin;

do $$
declare
  w uuid; u uuid;
  director uuid; ai uuid; ar uuid; aq uuid; ao uuid; af uuid; asales uuid; ap uuid; apay uuid; ah uuid; aproof uuid;
  lead_id uuid; search_id uuid; finder_id uuid; opp_id uuid;
  r uuid; t uuid; intel_id uuid; research_id uuid; qual_id uuid; outreach_id uuid; followup_id uuid;
  guidance_id uuid; proposal_id uuid; onboarding_id uuid; handoff_id uuid; plan_id uuid;
  calls_before bigint; calls_after bigint; c bigint;
begin
  select id, owner_id into w,u from public.workspaces where name='Urava' order by created_at asc limit 1;
  if w is null or u is null then raise exception 'Urava workspace/owner missing'; end if;
  select count(*) into calls_before from public.orbit_action_calls;

  insert into public.orbit_agents(workspace_id,agent_key,name,kind,status,mission,instructions,config,created_by)
  values(w,'sales_director','Sales Director','manager','active','Stage 3 manager','Internal only',jsonb_build_object('externalActionsEnabled',false),u)
  on conflict(workspace_id,agent_key) do update set status='active'
  returning id into director;

  insert into public.orbit_agents(workspace_id,supervisor_agent_id,agent_key,name,kind,status,mission,instructions,config,created_by)
  values
    (w,director,'lead_intelligence','Lead Intelligence','specialist','active','Intel','Internal only','{}',u),
    (w,director,'research','Research','specialist','active','Research','Internal only','{}',u),
    (w,director,'qualification','Qualification','specialist','active','Qualify','Internal only','{}',u),
    (w,director,'outreach','Outreach','specialist','active','Outreach','Never send','{}',u),
    (w,director,'follow_up','Follow-up','specialist','active','Follow-up','Never send','{}',u),
    (w,director,'sales','Sales','specialist','active','Sales','Internal only','{}',u),
    (w,director,'proposal','Proposal','specialist','active','Proposal','Never send','{}',u),
    (w,director,'payment_onboarding','Payment & Onboarding','specialist','active','Payment','Never move money','{}',u),
    (w,director,'delivery_handoff','Delivery Handoff','specialist','active','Handoff','Never activate delivery','{}',u),
    (w,director,'proof_referral','Proof & Referral','specialist','active','Proof','Never publish/send referral','{}',u)
  on conflict(workspace_id,agent_key) do update set status='active',supervisor_agent_id=excluded.supervisor_agent_id;

  select id into ai from public.orbit_agents where workspace_id=w and agent_key='lead_intelligence';
  select id into ar from public.orbit_agents where workspace_id=w and agent_key='research';
  select id into aq from public.orbit_agents where workspace_id=w and agent_key='qualification';
  select id into ao from public.orbit_agents where workspace_id=w and agent_key='outreach';
  select id into af from public.orbit_agents where workspace_id=w and agent_key='follow_up';
  select id into asales from public.orbit_agents where workspace_id=w and agent_key='sales';
  select id into ap from public.orbit_agents where workspace_id=w and agent_key='proposal';
  select id into apay from public.orbit_agents where workspace_id=w and agent_key='payment_onboarding';
  select id into ah from public.orbit_agents where workspace_id=w and agent_key='delivery_handoff';
  select id into aproof from public.orbit_agents where workspace_id=w and agent_key='proof_referral';

  select count(*) into c from public.orbit_agents where workspace_id=w and status='active' and agent_key in
    ('sales_director','lead_intelligence','research','qualification','outreach','follow_up','sales','proposal','payment_onboarding','delivery_handoff','proof_referral');
  if c<>11 then raise exception 'Expected 11 active Stage 3 agents, got %',c; end if;

  insert into public.orbit_agent_permissions(workspace_id,agent_id,capability_key,effect,authority_level,conditions,created_by)
  values
    (w,director,'agents.delegate','allow','green','{}',u),
    (w,ai,'growth.lead_intelligence','allow','green','{}',u),
    (w,ar,'growth.research','allow','green','{}',u),
    (w,aq,'growth.qualify','allow','green','{}',u),
    (w,ao,'growth.outreach_draft','allow','green','{}',u),
    (w,ao,'growth.outreach_send','allow','red',jsonb_build_object('disabledInStage3',true),u),
    (w,af,'growth.followup_plan','allow','green','{}',u),
    (w,af,'growth.followup_send','allow','red',jsonb_build_object('disabledInStage3',true),u),
    (w,asales,'growth.sales_reason','allow','green','{}',u),
    (w,ap,'growth.proposal_draft','allow','green',jsonb_build_object('explicitPriceBoundsRequired',true),u),
    (w,ap,'growth.proposal_send','allow','red',jsonb_build_object('disabledInStage3',true),u),
    (w,apay,'cash.payment_prepare','allow','green','{}',u),
    (w,apay,'cash.payment_collect','allow','red',jsonb_build_object('disabledInStage3',true),u),
    (w,ah,'delivery.handoff_prepare','allow','green','{}',u),
    (w,ah,'delivery.project_activate','allow','red',jsonb_build_object('disabledInStage3',true),u),
    (w,aproof,'proof.prepare','allow','green','{}',u),
    (w,aproof,'growth.referral_prepare','allow','green','{}',u),
    (w,aproof,'proof.publish','allow','red',jsonb_build_object('disabledInStage3',true),u),
    (w,aproof,'growth.referral_send','allow','red',jsonb_build_object('disabledInStage3',true),u)
  on conflict(workspace_id,agent_id,capability_key) do update
  set effect=excluded.effect,authority_level=excluded.authority_level,conditions=excluded.conditions;

  select count(*) into c from public.orbit_agent_permissions where workspace_id=w and authority_level='red' and capability_key in
    ('growth.outreach_send','growth.followup_send','growth.proposal_send','cash.payment_collect','delivery.project_activate','proof.publish','growth.referral_send');
  if c<>7 then raise exception 'Expected seven Stage 3 red gates, got %',c; end if;

  insert into public.leads(workspace_id,name,company,email,phone,whatsapp,source,stage,estimated_value,currency,niche,pain_point,google_place_id,created_by)
  values(w,'Stage Three Prospect','Stage Three Prospect Co','stage3@example.test','+920000000003','+920000000003','google','new',75000,'PKR','immigration consultancy','Prospects cannot clearly understand the next action.','stage3-test-place',u)
  returning id into lead_id;

  insert into public.lead_finder_searches(workspace_id,query_text,niche,location,target_problem,offer_key,requested_count,result_count,status,created_by,completed_at)
  values(w,'stage three acceptance','immigration consultancy','Lahore','Conversion clarity','website-growth',1,1,'completed',u,now()) returning id into search_id;

  insert into public.lead_finder_results(workspace_id,search_id,provider_place_id,business_name,formatted_address,website_url,phone,rating,review_count,niche,target_problem,fit_score,problem_score,contactability_score,commercial_score,total_score,score_reason,detected_weakness,recommended_offer,suggested_next_action,status,lead_id,analyzed_at,decided_at,created_by)
  values(w,search_id,'stage3-test-place','Stage Three Prospect Co','Lahore, Pakistan','https://stage3.example.test','+920000000003',4.5,100,'immigration consultancy','Conversion clarity',27,25,18,16,86,'Strong evidence','CTA clarity needs improvement','Conversion-focused website improvements','Prepare outreach','approved',lead_id,now(),now(),u)
  returning id into finder_id;

  insert into public.orbit_sales_opportunities(workspace_id,lead_id,current_state,status,next_agent_key,context,created_by)
  values(w,lead_id,'intelligence_pending','active','lead_intelligence',jsonb_build_object('externalActionsEnabled',false),u)
  returning id into opp_id;

  -- Lead Intelligence
  insert into public.orbit_agent_runs(workspace_id,agent_id,trigger_type,status,input,idempotency_key,created_by,started_at)
  values(w,ai,'agent','running',jsonb_build_object('leadId',lead_id),'stage3:test:intel',u,now()) returning id into r;
  begin
    insert into public.orbit_agent_runs(workspace_id,agent_id,trigger_type,status,input,idempotency_key,created_by)
    values(w,ai,'agent','queued','{}','stage3:test:intel',u);
    raise exception 'Duplicate Stage 3 idempotency key accepted';
  exception when unique_violation then null;
  end;
  insert into public.orbit_agent_tasks(workspace_id,run_id,assigned_agent_id,capability_key,task_type,title,status,risk_level,priority,input,attempts,locked_at)
  values(w,r,ai,'growth.lead_intelligence','lead_intelligence','Stage 3 intel','running','green',90,'{}',1,now()) returning id into t;
  insert into public.orbit_lead_intelligence(workspace_id,lead_id,finder_result_id,run_id,task_id,agent_id,fit_score,problem_score,contactability_score,commercial_score,total_score,qualification,pain_point,detected_weakness,recommended_offer,recommended_channel,suggested_next_action,evidence,scoring_basis,created_by)
  values(w,lead_id,finder_id,r,t,ai,27,25,18,16,86,'qualified','Prospects cannot clearly understand the next action.','CTA clarity needs improvement','Conversion-focused website improvements','email','Research before final qualification',jsonb_build_array(jsonb_build_object('key','rating','value',4.5,'source','lead_finder')),jsonb_build_object('stage',3),u)
  returning id into intel_id;
  update public.orbit_sales_opportunities set current_state='intelligence_ready',next_agent_key='research',last_agent_id=ai,version=version+1 where id=opp_id;

  -- Research
  insert into public.orbit_agent_runs(workspace_id,agent_id,trigger_type,status,input,created_by,started_at) values(w,ar,'agent','running','{}',u,now()) returning id into r;
  insert into public.orbit_agent_tasks(workspace_id,run_id,assigned_agent_id,capability_key,task_type,title,status,risk_level,priority,input,attempts,locked_at) values(w,r,ar,'growth.research','lead_research','Stage 3 research','running','green',88,'{}',1,now()) returning id into t;
  insert into public.orbit_lead_research(workspace_id,opportunity_id,lead_id,intelligence_id,run_id,task_id,agent_id,company_summary,verified_facts,risk_flags,opportunities,contact_routes,confidence,status,created_by)
  values(w,opp_id,lead_id,intel_id,r,t,ar,'Verified internal Stage 3 research packet.',jsonb_build_array(jsonb_build_object('key','lead','source','orbit')), '[]',jsonb_build_array(jsonb_build_object('type','problem','value','CTA clarity')),jsonb_build_array(jsonb_build_object('channel','email','value','stage3@example.test')),86,'complete',u)
  returning id into research_id;
  update public.orbit_sales_opportunities set current_state='research_ready',next_agent_key='qualification',last_agent_id=ar,version=version+1 where id=opp_id;

  -- Qualification
  insert into public.orbit_agent_runs(workspace_id,agent_id,trigger_type,status,input,created_by,started_at) values(w,aq,'agent','running','{}',u,now()) returning id into r;
  insert into public.orbit_agent_tasks(workspace_id,run_id,assigned_agent_id,capability_key,task_type,title,status,risk_level,priority,input,attempts,locked_at) values(w,r,aq,'growth.qualify','final_qualification','Stage 3 qualify','running','green',86,'{}',1,now()) returning id into t;
  insert into public.orbit_qualifications(workspace_id,opportunity_id,lead_id,intelligence_id,research_id,run_id,task_id,agent_id,total_score,decision,reason,recommended_offer,recommended_channel,next_state,created_by)
  values(w,opp_id,lead_id,intel_id,research_id,r,t,aq,86,'qualified','Score and research meet threshold.','Conversion-focused website improvements','email','qualified',u) returning id into qual_id;
  update public.orbit_sales_opportunities set current_state='qualified',next_agent_key='outreach',last_agent_id=aq,context=jsonb_build_object('qualificationId',qual_id,'recommendedOffer','Conversion-focused website improvements'),version=version+1 where id=opp_id;

  -- Outreach + Follow-up
  insert into public.orbit_agent_runs(workspace_id,agent_id,trigger_type,status,input,created_by,started_at) values(w,ao,'agent','running','{}',u,now()) returning id into r;
  insert into public.orbit_agent_tasks(workspace_id,run_id,assigned_agent_id,capability_key,task_type,title,status,risk_level,priority,input,attempts,locked_at) values(w,r,ao,'growth.outreach_draft','outreach_draft','Stage 3 outreach','running','green',82,'{}',1,now()) returning id into t;
  insert into public.orbit_outreach_drafts(workspace_id,lead_id,intelligence_id,run_id,task_id,agent_id,channel,subject,body,status,personalization_basis,generation_mode,external_send_enabled,created_by)
  values(w,lead_id,intel_id,r,t,ao,'email','A specific idea for Stage Three Prospect Co','Hi Stage Three Prospect, I noticed a specific conversion clarity opportunity. Would you like a short breakdown?','draft','[]','deterministic_fallback',false,u) returning id into outreach_id;
  insert into public.orbit_agent_runs(workspace_id,agent_id,trigger_type,status,input,created_by,started_at) values(w,af,'agent','running','{}',u,now()) returning id into r;
  insert into public.orbit_agent_tasks(workspace_id,run_id,assigned_agent_id,capability_key,task_type,title,status,risk_level,priority,input,attempts,locked_at) values(w,r,af,'growth.followup_plan','followup_plan','Stage 3 follow-up','running','green',78,'{}',1,now()) returning id into t;
  insert into public.orbit_followup_plans(workspace_id,opportunity_id,lead_id,outreach_draft_id,run_id,task_id,agent_id,channel,sequence,status,external_send_enabled,created_by)
  values(w,opp_id,lead_id,outreach_id,r,t,af,'email',jsonb_build_array(jsonb_build_object('touch',1,'delayHours',24),jsonb_build_object('touch',2,'delayHours',72)),'ready',false,u) returning id into followup_id;
  update public.orbit_sales_opportunities set current_state='waiting_reply',next_agent_key='sales',last_agent_id=af,version=version+1 where id=opp_id;

  -- Real interested signal represented internally; no outbound action is executed.
  insert into public.orbit_agent_runs(workspace_id,agent_id,trigger_type,status,input,created_by,started_at) values(w,asales,'agent','running','{}',u,now()) returning id into r;
  insert into public.orbit_agent_tasks(workspace_id,run_id,assigned_agent_id,capability_key,task_type,title,status,risk_level,priority,input,attempts,locked_at) values(w,r,asales,'growth.sales_reason','sales_signal','Stage 3 sales','running','green',90,'{}',1,now()) returning id into t;
  insert into public.orbit_sales_guidance(workspace_id,opportunity_id,lead_id,run_id,task_id,agent_id,buying_signal,objections,recommended_response,recommended_next_state,confidence,created_by)
  values(w,opp_id,lead_id,r,t,asales,'Interested in a proposal','[]','Clarify outcome and prepare only an approved proposal.','engaged',90,u) returning id into guidance_id;
  update public.orbit_sales_opportunities set current_state='engaged',next_agent_key='proposal',last_agent_id=asales,version=version+1 where id=opp_id;

  -- Proposal with explicit approved price bounds.
  insert into public.orbit_agent_runs(workspace_id,agent_id,trigger_type,status,input,created_by,started_at) values(w,ap,'agent','running','{}',u,now()) returning id into r;
  insert into public.orbit_agent_tasks(workspace_id,run_id,assigned_agent_id,capability_key,task_type,title,status,risk_level,priority,input,attempts,locked_at) values(w,r,ap,'growth.proposal_draft','proposal_draft','Stage 3 proposal','running','green',92,'{}',1,now()) returning id into t;
  insert into public.orbit_proposal_drafts(workspace_id,opportunity_id,lead_id,run_id,task_id,agent_id,title,scope,price_min,price_max,currency,assumptions,status,external_send_enabled,created_by)
  values(w,opp_id,lead_id,r,t,ap,'Proposal for Stage Three Prospect Co',jsonb_build_array(jsonb_build_object('item','Conversion-focused website improvements')),50000,75000,'PKR',jsonb_build_array(jsonb_build_object('key','pricing','value','Explicit approved bounds')),'draft',false,u) returning id into proposal_id;
  update public.orbit_sales_opportunities set current_state='proposal_drafted',next_agent_key='payment_onboarding',last_agent_id=ap,version=version+1 where id=opp_id;

  -- Proposal accepted externally -> internal payment/onboarding case.
  insert into public.orbit_agent_runs(workspace_id,agent_id,trigger_type,status,input,created_by,started_at) values(w,apay,'agent','running','{}',u,now()) returning id into r;
  insert into public.orbit_agent_tasks(workspace_id,run_id,assigned_agent_id,capability_key,task_type,title,status,risk_level,priority,input,attempts,locked_at) values(w,r,apay,'cash.payment_prepare','payment_onboarding_prepare','Stage 3 payment','running','green',94,'{}',1,now()) returning id into t;
  insert into public.orbit_onboarding_cases(workspace_id,opportunity_id,lead_id,proposal_id,run_id,task_id,agent_id,payment_status,onboarding_status,requirements,external_payment_action_enabled,created_by)
  values(w,opp_id,lead_id,proposal_id,r,t,apay,'pending','draft',jsonb_build_array(jsonb_build_object('key','billing_identity','status','needed')),false,u) returning id into onboarding_id;
  update public.orbit_sales_opportunities set current_state='payment_pending',next_agent_key='payment_onboarding',last_agent_id=apay,version=version+1 where id=opp_id;
  update public.orbit_onboarding_cases set payment_status='confirmed_external',onboarding_status='ready',payment_reference='stage3-test-payment' where id=onboarding_id;

  -- Payment confirmed externally -> handoff only, no project activation.
  insert into public.orbit_agent_runs(workspace_id,agent_id,trigger_type,status,input,created_by,started_at) values(w,ah,'agent','running','{}',u,now()) returning id into r;
  insert into public.orbit_agent_tasks(workspace_id,run_id,assigned_agent_id,capability_key,task_type,title,status,risk_level,priority,input,attempts,locked_at) values(w,r,ah,'delivery.handoff_prepare','delivery_handoff','Stage 3 handoff','running','green',96,'{}',1,now()) returning id into t;
  insert into public.orbit_delivery_handoffs(workspace_id,opportunity_id,lead_id,onboarding_id,run_id,task_id,agent_id,brief,capacity_status,status,external_commitment_enabled,created_by)
  values(w,opp_id,lead_id,onboarding_id,r,t,ah,jsonb_build_object('summary','Internal Studio review required'),'available','ready',false,u) returning id into handoff_id;
  update public.orbit_sales_opportunities set current_state='handoff_ready',status='won',next_agent_key='proof_referral',last_agent_id=ah,version=version+1 where id=opp_id;

  -- Delivery completed externally -> private proof/referral plan only.
  insert into public.orbit_agent_runs(workspace_id,agent_id,trigger_type,status,input,created_by,started_at) values(w,aproof,'agent','running','{}',u,now()) returning id into r;
  insert into public.orbit_agent_tasks(workspace_id,run_id,assigned_agent_id,capability_key,task_type,title,status,risk_level,priority,input,attempts,locked_at) values(w,r,aproof,'proof.prepare','proof_referral_plan','Stage 3 proof','running','green',88,'{}',1,now()) returning id into t;
  insert into public.orbit_proof_referral_plans(workspace_id,opportunity_id,lead_id,handoff_id,run_id,task_id,agent_id,result_summary,proof_permission_scope,referral_plan,status,proof_publish_enabled,referral_request_enabled,created_by)
  values(w,opp_id,lead_id,handoff_id,r,t,aproof,'The Stage 3 acceptance scenario completed the scoped delivery successfully.','private',jsonb_build_object('status','not_requested'),'draft',false,false,u) returning id into plan_id;
  update public.orbit_sales_opportunities set current_state='proof_ready',next_agent_key='proof_referral',last_agent_id=aproof,version=version+1 where id=opp_id;
  update public.orbit_proof_referral_plans set proof_permission_scope='anonymous',status='ready',proof_publish_enabled=false,referral_request_enabled=false where id=plan_id;
  update public.orbit_sales_opportunities set current_state='referral_ready',status='completed',next_agent_key=null,version=version+1 where id=opp_id;

  if exists(select 1 from public.orbit_outreach_drafts where id=outreach_id and external_send_enabled) then raise exception 'Outreach safety invariant failed'; end if;
  if exists(select 1 from public.orbit_followup_plans where id=followup_id and external_send_enabled) then raise exception 'Follow-up safety invariant failed'; end if;
  if exists(select 1 from public.orbit_proposal_drafts where id=proposal_id and external_send_enabled) then raise exception 'Proposal safety invariant failed'; end if;
  if exists(select 1 from public.orbit_onboarding_cases where id=onboarding_id and external_payment_action_enabled) then raise exception 'Payment safety invariant failed'; end if;
  if exists(select 1 from public.orbit_delivery_handoffs where id=handoff_id and external_commitment_enabled) then raise exception 'Delivery safety invariant failed'; end if;
  if exists(select 1 from public.orbit_proof_referral_plans where id=plan_id and (proof_publish_enabled or referral_request_enabled)) then raise exception 'Proof/referral safety invariant failed'; end if;
  if not exists(select 1 from public.orbit_sales_opportunities where id=opp_id and current_state='referral_ready' and status='completed') then raise exception 'Final Stage 3 internal state failed'; end if;

  select count(*) into calls_after from public.orbit_action_calls;
  if calls_after<>calls_before then raise exception 'Stage 3 created a real Orbit action call'; end if;
end
$$;

rollback;
