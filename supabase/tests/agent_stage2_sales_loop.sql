-- Orbit Stage 2 acceptance test.
-- Verifies manager -> Lead Intelligence -> Outreach hierarchy, durable artifacts,
-- idempotency, tenant-safe references, and zero external message execution.

begin;

do $$
declare
  v_workspace_id uuid;
  v_owner_id uuid;
  v_director_id uuid;
  v_intelligence_agent_id uuid;
  v_outreach_agent_id uuid;
  v_lead_id uuid;
  v_search_id uuid;
  v_finder_id uuid;
  v_root_run uuid;
  v_root_task uuid;
  v_intel_run uuid;
  v_intel_task uuid;
  v_intelligence_id uuid;
  v_outreach_run uuid;
  v_outreach_task uuid;
  v_draft_id uuid;
  v_calls_before bigint;
  v_calls_after bigint;
  v_count bigint;
begin
  select w.id, w.owner_id into v_workspace_id, v_owner_id
  from public.workspaces w
  where w.name = 'Urava'
  order by w.created_at asc
  limit 1;

  if v_workspace_id is null or v_owner_id is null then
    raise exception 'Stage 2 test requires the Urava workspace and owner.';
  end if;

  select count(*) into v_calls_before from public.orbit_action_calls;

  insert into public.orbit_agents (
    workspace_id, agent_key, name, kind, status, mission, instructions, config, created_by
  ) values (
    v_workspace_id, 'sales_director', 'Sales Director', 'manager', 'active',
    'Stage 2 acceptance manager.', 'Internal-only delegation.',
    jsonb_build_object('externalActionsEnabled', false), v_owner_id
  ) on conflict (workspace_id, agent_key) do update set status='active'
  returning id into v_director_id;

  insert into public.orbit_agents (
    workspace_id, supervisor_agent_id, agent_key, name, kind, status, mission, instructions, config, created_by
  ) values (
    v_workspace_id, v_director_id, 'lead_intelligence', 'Lead Intelligence', 'specialist', 'active',
    'Stage 2 lead qualification.', 'Evidence only.',
    jsonb_build_object('externalActionsEnabled', false), v_owner_id
  ) on conflict (workspace_id, agent_key) do update
  set status='active', supervisor_agent_id=excluded.supervisor_agent_id
  returning id into v_intelligence_agent_id;

  insert into public.orbit_agents (
    workspace_id, supervisor_agent_id, agent_key, name, kind, status, mission, instructions, config, created_by
  ) values (
    v_workspace_id, v_director_id, 'outreach', 'Outreach', 'specialist', 'active',
    'Stage 2 outreach drafting.', 'Draft only; never send.',
    jsonb_build_object('externalActionsEnabled', false), v_owner_id
  ) on conflict (workspace_id, agent_key) do update
  set status='active', supervisor_agent_id=excluded.supervisor_agent_id
  returning id into v_outreach_agent_id;

  insert into public.orbit_agent_permissions (
    workspace_id, agent_id, capability_key, effect, authority_level, conditions, created_by
  ) values
    (v_workspace_id, v_director_id, 'agents.delegate', 'allow', 'green', '{}'::jsonb, v_owner_id),
    (v_workspace_id, v_intelligence_agent_id, 'growth.lead_intelligence', 'allow', 'green', '{}'::jsonb, v_owner_id),
    (v_workspace_id, v_outreach_agent_id, 'growth.outreach_draft', 'allow', 'green', '{}'::jsonb, v_owner_id),
    (v_workspace_id, v_outreach_agent_id, 'growth.outreach_send', 'allow', 'red', jsonb_build_object('disabledInStage2', true), v_owner_id)
  on conflict (workspace_id, agent_id, capability_key) do update
  set effect=excluded.effect, authority_level=excluded.authority_level, conditions=excluded.conditions;

  if not exists (
    select 1 from public.orbit_agent_permissions
    where workspace_id=v_workspace_id and agent_id=v_outreach_agent_id
      and capability_key='growth.outreach_send' and authority_level='red'
  ) then
    raise exception 'Outreach send capability is not red.';
  end if;

  insert into public.leads (
    workspace_id, name, company, email, phone, whatsapp, source, stage,
    estimated_value, currency, niche, pain_point, google_place_id, created_by
  ) values (
    v_workspace_id, 'Stage Two Prospect', 'Stage Two Prospect Co', 'stage2@example.test',
    '+920000000000', '+920000000000', 'google', 'new', 50000, 'PKR',
    'immigration consultancy', 'Website does not clearly guide prospects to the next step.',
    'stage2-test-place', v_owner_id
  ) returning id into v_lead_id;

  insert into public.lead_finder_searches (
    workspace_id, query_text, niche, location, target_problem, offer_key,
    requested_count, result_count, status, created_by, completed_at
  ) values (
    v_workspace_id, 'stage two acceptance test', 'immigration consultancy', 'Lahore',
    'Website conversion clarity', 'website-growth', 1, 1, 'completed', v_owner_id, now()
  ) returning id into v_search_id;

  insert into public.lead_finder_results (
    workspace_id, search_id, provider_place_id, business_name, formatted_address,
    website_url, phone, rating, review_count, niche, target_problem,
    fit_score, problem_score, contactability_score, commercial_score, total_score,
    score_reason, detected_weakness, recommended_offer, suggested_next_action,
    status, lead_id, analyzed_at, decided_at, created_by
  ) values (
    v_workspace_id, v_search_id, 'stage2-test-place', 'Stage Two Prospect Co', 'Lahore, Pakistan',
    'https://example.test', '+920000000000', 4.4, 80, 'immigration consultancy',
    'Website conversion clarity', 26, 25, 18, 15, 84,
    'Strong niche fit, explicit problem and direct contact route.',
    'Prospect journey and CTA clarity need improvement.',
    'Conversion-focused website and lead capture improvements.',
    'Prepare personalized outreach.', 'approved', v_lead_id, now(), now(), v_owner_id
  ) returning id into v_finder_id;

  insert into public.orbit_agent_runs (
    workspace_id, agent_id, trigger_type, status, input, idempotency_key, created_by, started_at
  ) values (
    v_workspace_id, v_director_id, 'manual', 'running',
    jsonb_build_object('leadId', v_lead_id, 'externalActionsEnabled', false),
    'stage2:acceptance-root', v_owner_id, now()
  ) returning id into v_root_run;

  begin
    insert into public.orbit_agent_runs (
      workspace_id, agent_id, trigger_type, status, input, idempotency_key, created_by
    ) values (
      v_workspace_id, v_director_id, 'manual', 'queued', '{}'::jsonb,
      'stage2:acceptance-root', v_owner_id
    );
    raise exception 'Stage 2 duplicate idempotency key was accepted.';
  exception when unique_violation then
    null;
  end;

  insert into public.orbit_agent_tasks (
    workspace_id, run_id, assigned_agent_id, capability_key, task_type, title,
    status, risk_level, priority, input, attempts, locked_at
  ) values (
    v_workspace_id, v_root_run, v_director_id, 'agents.delegate', 'stage2_sales_cycle',
    'Stage 2 root acceptance task', 'running', 'green', 70,
    jsonb_build_object('leadId', v_lead_id), 1, now()
  ) returning id into v_root_task;

  insert into public.orbit_agent_runs (
    workspace_id, agent_id, parent_run_id, trigger_type, status, input, created_by, started_at
  ) values (
    v_workspace_id, v_intelligence_agent_id, v_root_run, 'agent', 'running',
    jsonb_build_object('leadId', v_lead_id, 'finderResultId', v_finder_id), v_owner_id, now()
  ) returning id into v_intel_run;

  insert into public.orbit_agent_tasks (
    workspace_id, run_id, assigned_agent_id, parent_task_id, capability_key,
    task_type, title, status, risk_level, priority, input, attempts, locked_at
  ) values (
    v_workspace_id, v_intel_run, v_intelligence_agent_id, v_root_task,
    'growth.lead_intelligence', 'lead_intelligence', 'Analyze Stage Two Prospect',
    'running', 'green', 80, jsonb_build_object('leadId', v_lead_id), 1, now()
  ) returning id into v_intel_task;

  insert into public.orbit_lead_intelligence (
    workspace_id, lead_id, finder_result_id, run_id, task_id, agent_id,
    fit_score, problem_score, contactability_score, commercial_score, total_score,
    qualification, pain_point, detected_weakness, recommended_offer,
    recommended_channel, suggested_next_action, evidence, scoring_basis, created_by
  ) values (
    v_workspace_id, v_lead_id, v_finder_id, v_intel_run, v_intel_task, v_intelligence_agent_id,
    26, 25, 18, 15, 84, 'qualified',
    'Website does not clearly guide prospects to the next step.',
    'Prospect journey and CTA clarity need improvement.',
    'Conversion-focused website and lead capture improvements.',
    'email', 'Prepare personalized email outreach draft.',
    jsonb_build_array(jsonb_build_object('key','rating','value',4.4,'source','lead_finder')),
    jsonb_build_object('scoringMode','lead_finder'), v_owner_id
  ) returning id into v_intelligence_id;

  update public.orbit_agent_tasks set status='succeeded', completed_at=now(),
    output=jsonb_build_object('intelligenceId',v_intelligence_id,'qualification','qualified','totalScore',84)
  where id=v_intel_task;
  update public.orbit_agent_runs set status='succeeded', completed_at=now(),
    output=jsonb_build_object('intelligenceId',v_intelligence_id,'qualification','qualified','totalScore',84)
  where id=v_intel_run;

  insert into public.orbit_agent_runs (
    workspace_id, agent_id, parent_run_id, trigger_type, status, input, created_by, started_at
  ) values (
    v_workspace_id, v_outreach_agent_id, v_root_run, 'agent', 'running',
    jsonb_build_object('leadId',v_lead_id,'intelligenceId',v_intelligence_id,'externalSendEnabled',false),
    v_owner_id, now()
  ) returning id into v_outreach_run;

  insert into public.orbit_agent_tasks (
    workspace_id, run_id, assigned_agent_id, parent_task_id, capability_key,
    task_type, title, status, risk_level, priority, input, attempts, locked_at
  ) values (
    v_workspace_id, v_outreach_run, v_outreach_agent_id, v_root_task,
    'growth.outreach_draft', 'outreach_draft', 'Draft Stage Two Prospect outreach',
    'running', 'green', 75,
    jsonb_build_object('leadId',v_lead_id,'intelligenceId',v_intelligence_id,'externalSendEnabled',false),
    1, now()
  ) returning id into v_outreach_task;

  insert into public.orbit_outreach_drafts (
    workspace_id, lead_id, intelligence_id, run_id, task_id, agent_id,
    channel, subject, body, personalization_basis, generation_mode,
    external_send_enabled, created_by
  ) values (
    v_workspace_id, v_lead_id, v_intelligence_id, v_outreach_run, v_outreach_task,
    v_outreach_agent_id, 'email', 'A specific idea for Stage Two Prospect Co',
    'Hi Stage Two Prospect, I noticed a conversion clarity opportunity. Would you like a short breakdown?',
    jsonb_build_array(jsonb_build_object('key','target_problem','value','Website conversion clarity','source','lead_finder')),
    'deterministic_fallback', false, v_owner_id
  ) returning id into v_draft_id;

  update public.orbit_agent_tasks set status='succeeded', completed_at=now(),
    output=jsonb_build_object('draftId',v_draft_id,'externalSendEnabled',false)
  where id=v_outreach_task;
  update public.orbit_agent_runs set status='succeeded', completed_at=now(),
    output=jsonb_build_object('draftId',v_draft_id,'externalSendEnabled',false)
  where id=v_outreach_run;

  update public.orbit_agent_tasks set status='succeeded', completed_at=now(),
    output=jsonb_build_object('decision','draft_prepared','intelligenceId',v_intelligence_id,'draftId',v_draft_id,'externalActionExecuted',false)
  where id=v_root_task;
  update public.orbit_agent_runs set status='succeeded', completed_at=now(),
    output=jsonb_build_object('decision','draft_prepared','intelligenceId',v_intelligence_id,'draftId',v_draft_id,'externalActionExecuted',false)
  where id=v_root_run;

  if not exists (
    select 1 from public.orbit_agent_runs
    where id=v_intel_run and parent_run_id=v_root_run and status='succeeded'
  ) then raise exception 'Lead Intelligence child run hierarchy failed.'; end if;

  if not exists (
    select 1 from public.orbit_agent_runs
    where id=v_outreach_run and parent_run_id=v_root_run and status='succeeded'
  ) then raise exception 'Outreach child run hierarchy failed.'; end if;

  if not exists (
    select 1 from public.orbit_agent_tasks
    where id=v_intel_task and parent_task_id=v_root_task and capability_key='growth.lead_intelligence'
  ) then raise exception 'Lead Intelligence task capability/hierarchy failed.'; end if;

  if not exists (
    select 1 from public.orbit_agent_tasks
    where id=v_outreach_task and parent_task_id=v_root_task and capability_key='growth.outreach_draft'
  ) then raise exception 'Outreach task capability/hierarchy failed.'; end if;

  if not exists (
    select 1 from public.orbit_outreach_drafts
    where id=v_draft_id and status='draft' and external_send_enabled=false
  ) then raise exception 'Outreach draft safety invariant failed.'; end if;

  select count(*) into v_count from public.orbit_agent_approvals
  where run_id in (v_root_run,v_intel_run,v_outreach_run);
  if v_count <> 0 then
    raise exception 'Green Stage 2 internal workflow incorrectly requested approval.';
  end if;

  select count(*) into v_calls_after from public.orbit_action_calls;
  if v_calls_after <> v_calls_before then
    raise exception 'Stage 2 created a real Orbit action call.';
  end if;
end
$$;

rollback;
