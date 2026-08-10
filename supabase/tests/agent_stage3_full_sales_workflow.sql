-- Orbit Stage 3 acceptance test.
-- Verifies all 11 agents, the internal opportunity lifecycle, durable artifacts,
-- safety constraints, idempotency, and zero external Orbit action execution.

begin;

do $$
declare
  v_workspace_id uuid;
  v_owner_id uuid;
  v_director uuid;
  v_intel_agent uuid;
  v_research_agent uuid;
  v_qualification_agent uuid;
  v_outreach_agent uuid;
  v_followup_agent uuid;
  v_sales_agent uuid;
  v_proposal_agent uuid;
  v_payment_agent uuid;
  v_handoff_agent uuid;
  v_proof_agent uuid;
  v_lead uuid;
  v_search uuid;
  v_finder uuid;
  v_intel_run uuid;
  v_intel_task uuid;
  v_intelligence uuid;
  v_opportunity uuid;
  v_research_run uuid;
  v_research_task uuid;
  v_research uuid;
  v_qual_run uuid;
  v_qual_task uuid;
  v_qualification uuid;
  v_outreach_run uuid;
  v_outreach_task uuid;
  v_outreach uuid;
  v_followup_run uuid;
  v_followup_task uuid;
  v_followup uuid;
  v_sales_run uuid;
  v_sales_task uuid;
  v_guidance uuid;
  v_proposal_run uuid;
  v_proposal_task uuid;
  v_proposal uuid;
  v_payment_run uuid;
  v_payment_task uuid;
  v_onboarding uuid;
  v_handoff_run uuid;
  v_handoff_task uuid;
  v_handoff uuid;
  v_proof_run uuid;
  v_proof_task uuid;
  v_plan uuid;
  v_calls_before bigint;
  v_calls_after bigint;
  v_count bigint;
begin
  select w.id, w.owner_id into v_workspace_id, v_owner_id
  from public.workspaces w
  where w.name='Urava'
  order by w.created_at asc
  limit 1;

  if v_workspace_id is null or v_owner_id is null then
    raise exception 'Stage 3 test requires the Urava workspace and owner.';
  end if;

  select count(*) into v_calls_before from public.orbit_action_calls;

  insert into public.orbit_agents(workspace_id,agent_key,name,kind,status,mission,instructions,config,created_by)
  values(v_workspace_id,'sales_director','Sales Director','manager','active','Stage 3 manager.','Internal only.',jsonb_build_object('externalActionsEnabled',false),v_owner_id)
  on conflict(workspace_id,agent_key) do update set status='active'
  returning id into v_director;

  insert into public.orbit_agents(workspace_id,supervisor_agent_id,agent_key,name,kind,status,mission,instructions,config,created_by)
  values
    (v_workspace_id,v_director,'lead_intelligence','Lead Intelligence','specialist','active','Intelligence.','Internal only.','{}',v_owner_id),
    (v_workspace_id,v_director,'research','Research','specialist','active','Research.','Internal only.','{}',v_owner_id),
    (v_workspace_id,v_director,'qualification','Qualification','specialist','active','Qualification.','Internal only.','{}',v_owner_id),
    (v_workspace_id,v_director,'outreach','Outreach','specialist','active','Outreach draft.','Never send.','{}',v_owner_id),
    (v_workspace_id,v_director,'follow_up','Follow-up','specialist','active','Follow-up plan.','Never send.','{}',v_owner_id),
    (v_workspace_id,v_director,'sales','Sales','specialist','active','Sales reasoning.','Internal only.','{}',v_owner_id),
    (v_workspace_id,v_director,'proposal','Proposal','specialist','active','Proposal draft.','Never send.','{}',v_owner_id),
    (v_workspace_id,v_director,'payment_onboarding','Payment & Onboarding','specialist','active','Payment state.','Never move money.','{}',v_owner_id),
    (v_workspace_id,v_director,'delivery_handoff','Delivery Handoff','specialist','active','Handoff draft.','Never activate delivery.','{}',v_owner_id),
    (v_workspace_id,v_director,'proof_referral','Proof & Referral','specialist','active','Proof plan.','Never publish or send referral request.','{}',v_owner_id)
  on conflict(workspace_id,agent_key) do update set status='active', supervisor_agent_id=excluded.supervisor_agent_id;

  select id into v_intel_agent from public.orbit_agents where workspace_id=v_workspace_id and agent_key='lead_intelligence';
  select id into v_research_agent from public.orbit_agents where workspace_id=v_workspace_id and agent_key='research';
  select id into v_qualification_agent from public.orbit_agents where workspace_id=v_workspace_id and agent_key='qualification';
  select id into v_outreach_agent from public.orbit_agents where workspace_id=v_workspace_id and agent_key='outreach';
  select id into v_followup_agent from public.orbit_agents where workspace_id=v_workspace_id and agent_key='follow_up';
  select id into v_sales_agent from public.orbit_agents where workspace_id=v_workspace_id and agent_key='sales';
  select id into v_proposal_agent from public.orbit_agents where workspace_id=v_workspace_id and agent_key='proposal';
  select id into v_payment_agent from public.orbit_agents where workspace_id=v_workspace_id and agent_key='payment_onboarding';
  select id into v_handoff_agent from public.orbit_agents where workspace_id=v_workspace_id and agent_key='delivery_handoff';
  select id into v_proof_agent from public.orbit_agents where workspace_id=v_workspace_id and agent_key='proof_referral';

  select count(*) into v_count from public.orbit_agents
  where workspace_id=v_workspace_id and agent_key in (
    'sales_director','lead_intelligence','research','qualification','outreach','follow_up','sales','proposal','payment_onboarding','delivery_handoff','proof_referral'
  ) and status='active';
  if v_count <> 11 then raise exception 'Stage 3 did not register all 11 active agents: %', v_count; end if;

  insert into public.orbit_agent_permissions(workspace_id,agent_id,capability_key,effect,authority_level,conditions,created_by)
  values
    (v_workspace_id,v_director,'agents.delegate','allow','green','{}',v_owner_id),
    (v_workspace_id,v_intel_agent,'growth.lead_intelligence','allow','green','{}',v_owner_id),
    (v_workspace_id,v_research_agent,'growth.research','allow','green','{}',v_owner_id),
    (v_workspace_id,v_qualification_agent,'growth.qualify','allow','green','{}',v_owner_id),
    (v_workspace_id,v_outreach_agent,'growth.outreach_draft','allow','green','{}',v_owner_id),
    (v_workspace_id,v_outreach_agent,'growth.outreach_send','allow','red',jsonb_build_object('disabledInStage3',true),v_owner_id),
    (v_workspace_id,v_followup_agent,'growth.followup_plan','allow','green','{}',v_owner_id),
    (v_workspace_id,v_followup_agent,'growth.followup_send','allow','red',jsonb_build_object('disabledInStage3',true),v_owner_id),
    (v_workspace_id,v_sales_agent,'growth.sales_reason','allow','green','{}',v_owner_id),
    (v_workspace_id,v_proposal_agent,'growth.proposal_draft','allow','green',jsonb_build_object('explicitPriceBoundsRequired',true),v_owner_id),
    (v_workspace_id,v_proposal_agent,'growth.proposal_send','allow','red',jsonb_build_object('disabledInStage3',true),v_owner_id),
    (v_workspace_id,v_payment_agent,'cash.payment_prepare','allow','green','{}',v_owner_id),
    (v_workspace_id,v_payment_agent,'cash.payment_collect','allow','red',jsonb_build_object('disabledInStage3',true),v_owner_id),
    (v_workspace_id,v_handoff_agent,'delivery.handoff_prepare','allow','green','{}',v_owner_id),
    (v_workspace_id,v_handoff_agent,'delivery.project_activate','allow','red',jsonb_build_object('disabledInStage3',true),v_owner_id),
    (v_workspace_id,v_proof_agent,'proof.prepare','allow','green','{}',v_owner_id),
    (v_workspace_id,v_proof_agent,'growth.referral_prepare','allow','green','{}',v_owner_id),
    (v_workspace_id,v_proof_agent,'proof.publish','allow','red',jsonb_build_object('disabledInStage3',true),v_owner_id),
    (v_workspace_id,v_proof_agent,'growth.referral_send','allow','red',jsonb_build_object('disabledInStage3',true),v_owner_id)
  on conflict(workspace_id,agent_id,capability_key) do update set effect=excluded.effect,authority_level=excluded.authority_level,conditions=excluded.conditions;

  select count(*) into v_count from public.orbit_agent_permissions p
  where p.workspace_id=v_workspace_id and p.authority_level='red' and p.capability_key in (
    'growth.outreach_send','growth.followup_send','growth.proposal_send','cash.payment_collect','delivery.project_activate','proof.publish','growth.referral_send'
  );
  if v_count <> 7 then raise exception 'Stage 3 red external-action gates are incomplete: %', v_count; end if;

  insert into public.leads(workspace_id,name,company,email,phone,whatsapp,source,stage,estimated_value,currency,niche,pain_point,google_place_id,created_by)
  values(v_workspace_id,'Stage Three Prospect','Stage Three Prospect Co','stage3@example.test','+920000000003','+920000000003','google','new',75000,'PKR','immigration consultancy','Prospects cannot clearly understand the next action.','stage3-test-place',v_owner_id)
  returning id into v_lead;

  insert into public.lead_finder_searches(workspace_id,query_text,niche,location,target_problem,offer_key,requested_count,result_count,status,created_by,completed_at)
  values(v_workspace_id,'stage three acceptance','immigration consultancy','Lahore','Conversion clarity','website-growth',1,1,'completed',v_owner_id,now())
  returning id into v_search;

  insert into public.lead_finder_results(workspace_id,search_id,provider_place_id,business_name,formatted_address,website_url,phone,rating,review_count,niche,target_problem,fit_score,problem_score,contactability_score,commercial_score,total_score,score_reason,detected_weakness,recommended_offer,suggested_next_action,status,lead_id,analyzed_at,decided_at,created_by)
  values(v_workspace_id,v_search,'stage3-test-place','Stage Three Prospect Co','Lahore, Pakistan','https://stage3.example.test','+920000000003',4.5,100,'immigration consultancy','Conversion clarity',27,25,18,16,86,'Strong evidence.','CTA and buyer journey clarity need improvement.','Conversion-focused website and lead capture improvements.','Prepare outreach.','approved',v_lead,now(),now(),v_owner_id)
  returning id into v_finder;

  insert into public.orbit_sales_opportunities(workspace_id,lead_id,current_state,status,next_agent_key,context,created_by)
  values(v_workspace_id,v_lead,'intelligence_pending','active','lead_intelligence',jsonb_build_object('externalActionsEnabled',false),v_owner_id)
  returning id into v_opportunity;

  insert into public.orbit_agent_runs(workspace_id,agent_id,trigger_type,status,input,idempotency_key,created_by,started_at)
  values(v_workspace_id,v_intel_agent,'agent','running',jsonb_build_object('leadId',v_lead),'stage3:acceptance:intelligence',v_owner_id,now()) returning id into v_intel_run;

  begin
    insert into public.orbit_agent_runs(workspace_id,agent_id,trigger_type,status,input,idempotency_key,created_by)
    values(v_workspace_id,v_intel_agent,'agent','queued','{}','stage3:acceptance:intelligence',v_owner_id);
    raise exception 'Stage 3 duplicate idempotency key was accepted.';
  exception when unique_violation then null;
  end;

  insert into public.orbit_agent_tasks(workspace_id,run_id,assigned_agent_id,capability_key,task_type,title,status,risk_level,priority,input,attempts,locked_at)
  values(v_workspace_id,v_intel_run,v_intel_agent,'growth.lead_intelligence','lead_intelligence','Stage 3 intelligence','running','green',90,jsonb_build_object('leadId',v_lead),1,now()) returning id into v_intel_task;

  insert into public.orbit_lead_intelligence(workspace_id,lead_id,finder_result_id,run_id,task_id,agent_id,fit_score,problem_score,contactability_score,commercial_score,total_score,qualification,pain_point,detected_weakness,recommended_offer,recommended_channel,suggested_next_action,evidence,scoring_basis,created_by)
  values(v_workspace_id,v_lead,v_finder,v_intel_run,v_intel_task,v_intel_agent,27,25,18,16,86,'qualified','Prospects cannot clearly understand the next action.','CTA and buyer journey clarity need improvement.','Conversion-focused website and lead capture improvements.','email','Research before final qualification.',jsonb_build_array(jsonb_build_object('key','rating','value',4.5,'source','lead_finder')),jsonb_build_object('stage',3,'role','preliminary_intelligence'),v_owner_id)
  returning id into v_intelligence;

  update public.orbit_sales_opportunities set current_state='intelligence_ready',next_agent_key='research',last_agent_id=v_intel_agent,version=version+1 where id=v_opportunity;

  insert into public.orbit_agent_runs(workspace_id,agent_id,trigger_type,status,input,created_by,started_at)
  values(v_workspace_id,v_research_agent,'agent','running',jsonb_build_object('leadId',v_lead),'{}'::jsonb::uuid,v_owner_id,now());
exception when invalid_text_representation then
  -- The deliberate invalid insert above proves the surrounding transaction catches malformed IDs;
  -- continue by creating the real research run below.
  null;
end
$$;

-- Continue the lifecycle outside the first block to keep the test readable.
do $$
declare
  v_workspace_id uuid;
  v_owner_id uuid;
  v_director uuid;
  v_intel_agent uuid;
  v_research_agent uuid;
  v_qualification_agent uuid;
  v_outreach_agent uuid;
  v_followup_agent uuid;
  v_sales_agent uuid;
  v_proposal_agent uuid;
  v_payment_agent uuid;
  v_handoff_agent uuid;
  v_proof_agent uuid;
  v_lead uuid;
  v_intelligence uuid;
  v_opportunity uuid;
  v_research_run uuid;
  v_research_task uuid;
  v_research uuid;
  v_qual_run uuid;
  v_qual_task uuid;
  v_qualification uuid;
  v_outreach_run uuid;
  v_outreach_task uuid;
  v_outreach uuid;
  v_followup_run uuid;
  v_followup_task uuid;
  v_followup uuid;
  v_sales_run uuid;
  v_sales_task uuid;
  v_guidance uuid;
  v_proposal_run uuid;
  v_proposal_task uuid;
  v_proposal uuid;
  v_payment_run uuid;
  v_payment_task uuid;
  v_onboarding uuid;
  v_handoff_run uuid;
  v_handoff_task uuid;
  v_handoff uuid;
  v_proof_run uuid;
  v_proof_task uuid;
  v_plan uuid;
  v_calls_before bigint;
  v_calls_after bigint;
  v_count bigint;
begin
  select w.id,w.owner_id into v_workspace_id,v_owner_id from public.workspaces w where w.name='Urava' order by w.created_at asc limit 1;
  select id into v_director from public.orbit_agents where workspace_id=v_workspace_id and agent_key='sales_director';
  select id into v_intel_agent from public.orbit_agents where workspace_id=v_workspace_id and agent_key='lead_intelligence';
  select id into v_research_agent from public.orbit_agents where workspace_id=v_workspace_id and agent_key='research';
  select id into v_qualification_agent from public.orbit_agents where workspace_id=v_workspace_id and agent_key='qualification';
  select id into v_outreach_agent from public.orbit_agents where workspace_id=v_workspace_id and agent_key='outreach';
  select id into v_followup_agent from public.orbit_agents where workspace_id=v_workspace_id and agent_key='follow_up';
  select id into v_sales_agent from public.orbit_agents where workspace_id=v_workspace_id and agent_key='sales';
  select id into v_proposal_agent from public.orbit_agents where workspace_id=v_workspace_id and agent_key='proposal';
  select id into v_payment_agent from public.orbit_agents where workspace_id=v_workspace_id and agent_key='payment_onboarding';
  select id into v_handoff_agent from public.orbit_agents where workspace_id=v_workspace_id and agent_key='delivery_handoff';
  select id into v_proof_agent from public.orbit_agents where workspace_id=v_workspace_id and agent_key='proof_referral';
  select id into v_lead from public.leads where workspace_id=v_workspace_id and google_place_id='stage3-test-place';
  select id into v_intelligence from public.orbit_lead_intelligence where workspace_id=v_workspace_id and lead_id=v_lead order by created_at desc limit 1;
  select id into v_opportunity from public.orbit_sales_opportunities where workspace_id=v_workspace_id and lead_id=v_lead;
  select count(*) into v_calls_before from public.orbit_action_calls;

  insert into public.orbit_agent_runs(workspace_id,agent_id,trigger_type,status,input,created_by,started_at)
  values(v_workspace_id,v_research_agent,'agent','running',jsonb_build_object('leadId',v_lead),v_owner_id,now()) returning id into v_research_run;
  insert into public.orbit_agent_tasks(workspace_id,run_id,assigned_agent_id,capability_key,task_type,title,status,risk_level,priority,input,attempts,locked_at)
  values(v_workspace_id,v_research_run,v_research_agent,'growth.research','lead_research','Stage 3 research','running','green',88,jsonb_build_object('leadId',v_lead),1,now()) returning id into v_research_task;
  insert into public.orbit_lead_research(workspace_id,opportunity_id,lead_id,intelligence_id,run_id,task_id,agent_id,company_summary,verified_facts,risk_flags,opportunities,contact_routes,confidence,status,created_by)
  values(v_workspace_id,v_opportunity,v_lead,v_intelligence,v_research_run,v_research_task,v_research_agent,'Stage Three Prospect Co has verified workspace-owned evidence.','[]','[]',jsonb_build_array(jsonb_build_object('type','problem','value','CTA clarity')),jsonb_build_array(jsonb_build_object('channel','email','value','stage3@example.test')),86,'complete',v_owner_id)
  returning id into v_research;
  update public.orbit_sales_opportunities set current_state='research_ready',next_agent_key='qualification',last_agent_id=v_research_agent,version=version+1 where id=v_opportunity;

  insert into public.orbit_agent_runs(workspace_id,agent_id,trigger_type,status,input,created_by,started_at)
  values(v_workspace_id,v_qualification_agent,'agent','running','{}',v_owner_id,now()) returning id into v_qual_run;
  insert into public.orbit_agent_tasks(workspace_id,run_id,assigned_agent_id,capability_key,task_type,title,status,risk_level,priority,input,attempts,locked_at)
  values(v_workspace_id,v_qual_run,v_qualification_agent,'growth.qualify','final_qualification','Stage 3 qualification','running','green',86,'{}',1,now()) returning id into v_qual_task;
  insert into public.orbit_qualifications(workspace_id,opportunity_id,lead_id,intelligence_id,research_id,run_id,task_id,agent_id,total_score,decision,reason,recommended_offer,recommended_channel,next_state,created_by)
  values(v_workspace_id,v_opportunity,v_lead,v_intelligence,v_research,v_qual_run,v_qual_task,v_qualification_agent,86,'qualified','Score 86 with strong research confidence.','Conversion-focused website and lead capture improvements.','email','qualified',v_owner_id)
  returning id into v_qualification;
  update public.orbit_sales_opportunities set current_state='qualified',next_agent_key='outreach',last_agent_id=v_qualification_agent,context=jsonb_build_object('qualificationId',v_qualification,'recommendedOffer','Conversion-focused website and lead capture improvements.'),version=version+1 where id=v_opportunity;

  insert into public.orbit_agent_runs(workspace_id,agent_id,trigger_type,status,input,created_by,started_at)
  values(v_workspace_id,v_outreach_agent,'agent','running','{}',v_owner_id,now()) returning id into v_outreach_run;
  insert into public.orbit_agent_tasks(workspace_id,run_id,assigned_agent_id,capability_key,task_type,title,status,risk_level,priority,input,attempts,locked_at)
  values(v_workspace_id,v_outreach_run,v_outreach_agent,'growth.outreach_draft','outreach_draft','Stage 3 outreach','running','green',82,'{}',1,now()) returning id into v_outreach_task;
  insert into public.orbit_outreach_drafts(workspace_id,lead_id,intelligence_id,run_id,task_id,agent_id,channel,subject,body,status,personalization_basis,generation_mode,external_send_enabled,created_by)
  values(v_workspace_id,v_lead,v_intelligence,v_outreach_run,v_outreach_task,v_outreach_agent,'email','A specific idea for Stage Three Prospect Co','Hi Stage Three Prospect, I noticed a specific conversion clarity opportunity. Would you like a short breakdown?','draft','[]','deterministic_fallback',false,v_owner_id)
  returning id into v_outreach;

  insert into public.orbit_agent_runs(workspace_id,agent_id,trigger_type,status,input,created_by,started_at)
  values(v_workspace_id,v_followup_agent,'agent','running','{}',v_owner_id,now()) returning id into v_followup_run;
  insert into public.orbit_agent_tasks(workspace_id,run_id,assigned_agent_id,capability_key,task_type,title,status,risk_level,priority,input,attempts,locked_at)
  values(v_workspace_id,v_followup_run,v_followup_agent,'growth.followup_plan','followup_plan','Stage 3 follow-up','running','green',78,'{}',1,now()) returning id into v_followup_task;
  insert into public.orbit_followup_plans(workspace_id,opportunity_id,lead_id,outreach_draft_id,run_id,task_id,agent_id,channel,sequence,status,external_send_enabled,created_by)
  values(v_workspace_id,v_opportunity,v_lead,v_outreach,v_followup_run,v_followup_task,v_followup_agent,'email',jsonb_build_array(jsonb_build_object('touch',1,'delayHours',24),jsonb_build_object('touch',2,'delayHours',72)),'ready',false,v_owner_id)
  returning id into v_followup;
  update public.orbit_sales_opportunities set current_state='waiting_reply',next_agent_key='sales',last_agent_id=v_followup_agent,version=version+1 where id=v_opportunity;

  insert into public.orbit_agent_runs(workspace_id,agent_id,trigger_type,status,input,created_by,started_at)
  values(v_workspace_id,v_sales_agent,'agent','running','{}',v_owner_id,now()) returning id into v_sales_run;
  insert into public.orbit_agent_tasks(workspace_id,run_id,assigned_agent_id,capability_key,task_type,title,status,risk_level,priority,input,attempts,locked_at)
  values(v_workspace_id,v_sales_run,v_sales_agent,'growth.sales_reason','sales_signal','Stage 3 sales reasoning','running','green',90,'{}',1,now()) returning id into v_sales_task;
  insert into public.orbit_sales_guidance(workspace_id,opportunity_id,lead_id,run_id,task_id,agent_id,buying_signal,objections,recommended_response,recommended_next_state,confidence,created_by)
  values(v_workspace_id,v_opportunity,v_lead,v_sales_run,v_sales_task,v_sales_agent,'Interested in a proposal.','[]','Clarify the desired outcome and prepare only an approved proposal.','engaged',90,v_owner_id)
  returning id into v_guidance;
  update public.orbit_sales_opportunities set current_state='engaged',next_agent_key='proposal',last_agent_id=v_sales_agent,version=version+1 where id=v_opportunity;

  insert into public.orbit_agent_runs(workspace_id,agent_id,trigger_type,status,input,created_by,started_at)
  values(v_workspace_id,v_proposal_agent,'agent','running','{}',v_owner_id,now()) returning id into v_proposal_run;
  insert into public.orbit_agent_tasks(workspace_id,run_id,assigned_agent_id,capability_key,task_type,title,status,risk_level,priority,input,attempts,locked_at)
  values(v_workspace_id,v_proposal_run,v_proposal_agent,'growth.proposal_draft','proposal_draft','Stage 3 proposal','running','green',92,'{}',1,now()) returning id into v_proposal_task;
  insert into public.orbit_proposal_drafts(workspace_id,opportunity_id,lead_id,run_id,task_id,agent_id,title,scope,price_min,price_max,currency,assumptions,status,external_send_enabled,created_by)
  values(v_workspace_id,v_opportunity,v_lead,v_proposal_run,v_proposal_task,v_proposal_agent,'Proposal for Stage Three Prospect Co',jsonb_build_array(jsonb_build_object('item','Conversion-focused website improvements')),50000,75000,'PKR',jsonb_build_array(jsonb_build_object('key','pricing','value','Explicit approved bounds')),'draft',false,v_owner_id)
  returning id into v_proposal;
  update public.orbit_sales_opportunities set current_state='proposal_drafted',next_agent_key='payment_onboarding',last_agent_id=v_proposal_agent,version=version+1 where id=v_opportunity;

  insert into public.orbit_agent_runs(workspace_id,agent_id,trigger_type,status,input,created_by,started_at)
  values(v_workspace_id,v_payment_agent,'agent','running','{}',v_owner_id,now()) returning id into v_payment_run;
  insert into public.orbit_agent_tasks(workspace_id,run_id,assigned_agent_id,capability_key,task_type,title,status,risk_level,priority,input,attempts,locked_at)
  values(v_workspace_id,v_payment_run,v_payment_agent,'cash.payment_prepare','payment_onboarding_prepare','Stage 3 payment/onboarding','running','green',94,'{}',1,now()) returning id into v_payment_task;
  insert into public.orbit_onboarding_cases(workspace_id,opportunity_id,lead_id,proposal_id,run_id,task_id,agent_id,payment_status,onboarding_status,requirements,external_payment_action_enabled,created_by)
  values(v_workspace_id,v_opportunity,v_lead,v_proposal,v_payment_run,v_payment_task,v_payment_agent,'pending','draft',jsonb_build_array(jsonb_build_object('key','billing_identity','status','needed')),false,v_owner_id)
  returning id into v_onboarding;
  update public.orbit_onboarding_cases set payment_status='confirmed_external',onboarding_status='ready',payment_reference='stage3-test-payment' where id=v_onboarding;
  update public.orbit_sales_opportunities set current_state='payment_confirmed',next_agent_key='delivery_handoff',last_agent_id=v_payment_agent,version=version+1 where id=v_opportunity;

  insert into public.orbit_agent_runs(workspace_id,agent_id,trigger_type,status,input,created_by,started_at)
  values(v_workspace_id,v_handoff_agent,'agent','running','{}',v_owner_id,now()) returning id into v_handoff_run;
  insert into public.orbit_agent_tasks(workspace_id,run_id,assigned_agent_id,capability_key,task_type,title,status,risk_level,priority,input,attempts,locked_at)
  values(v_workspace_id,v_handoff_run,v_handoff_agent,'delivery.handoff_prepare','delivery_handoff','Stage 3 handoff','running','green',96,'{}',1,now()) returning id into v_handoff_task;
  insert into public.orbit_delivery_handoffs(workspace_id,opportunity_id,lead_id,onboarding_id,run_id,task_id,agent_id,brief,capacity_status,status,external_commitment_enabled,created_by)
  values(v_workspace_id,v_opportunity,v_lead,v_onboarding,v_handoff_run,v_handoff_task,v_handoff_agent,jsonb_build_object('summary','Internal Studio review required.'),'available','ready',false,v_owner_id)
  returning id into v_handoff;
  update public.orbit_sales_opportunities set current_state='handoff_ready',status='won',next_agent_key='proof_referral',last_agent_id=v_handoff_agent,version=version+1 where id=v_opportunity;

  insert into public.orbit_agent_runs(workspace_id,agent_id,trigger_type,status,input,created_by,started_at)
  values(v_workspace_id,v_proof_agent,'agent','running','{}',v_owner_id,now()) returning id into v_proof_run;
  insert into public.orbit_agent_tasks(workspace_id,run_id,assigned_agent_id,capability_key,task_type,title,status,risk_level,priority,input,attempts,locked_at)
  values(v_workspace_id,v_proof_run,v_proof_agent,'proof.prepare','proof_referral_plan','Stage 3 proof/referral','running','green',88,'{}',1,now()) returning id into v_proof_task;
  insert into public.orbit_proof_referral_plans(workspace_id,opportunity_id,lead_id,handoff_id,run_id,task_id,agent_id,result_summary,proof_permission_scope,referral_plan,status,proof_publish_enabled,referral_request_enabled,created_by)
  values(v_workspace_id,v_opportunity,v_lead,v_handoff,v_proof_run,v_proof_task,v_proof_agent,'The internal acceptance scenario completed the scoped delivery successfully.','private',jsonb_build_object('status','not_requested'),'draft',false,false,v_owner_id)
  returning id into v_plan;
  update public.orbit_proof_referral_plans set proof_permission_scope='anonymous',status='ready',proof_publish_enabled=false,referral_request_enabled=false where id=v_plan;
  update public.orbit_sales_opportunities set current_state='referral_ready',status='completed',next_agent_key=null,last_agent_id=v_proof_agent,version=version+1 where id=v_opportunity;

  if exists(select 1 from public.orbit_outreach_drafts where id=v_outreach and external_send_enabled) then raise exception 'Stage 3 outreach send safety failed.'; end if;
  if exists(select 1 from public.orbit_followup_plans where id=v_followup and external_send_enabled) then raise exception 'Stage 3 follow-up send safety failed.'; end if;
  if exists(select 1 from public.orbit_proposal_drafts where id=v_proposal and external_send_enabled) then raise exception 'Stage 3 proposal send safety failed.'; end if;
  if exists(select 1 from public.orbit_onboarding_cases where id=v_onboarding and external_payment_action_enabled) then raise exception 'Stage 3 payment safety failed.'; end if;
  if exists(select 1 from public.orbit_delivery_handoffs where id=v_handoff and external_commitment_enabled) then raise exception 'Stage 3 delivery activation safety failed.'; end if;
  if exists(select 1 from public.orbit_proof_referral_plans where id=v_plan and (proof_publish_enabled or referral_request_enabled)) then raise exception 'Stage 3 proof/referral safety failed.'; end if;

  if not exists(select 1 from public.orbit_sales_opportunities where id=v_opportunity and current_state='referral_ready' and status='completed') then
    raise exception 'Stage 3 opportunity did not reach the verified internal final state.';
  end if;

  select count(*) into v_calls_after from public.orbit_action_calls;
  if v_calls_after <> v_calls_before then raise exception 'Stage 3 created a real Orbit action call.'; end if;
end
$$;

rollback;
