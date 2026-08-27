import "server-only";

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  decideStageFourAction,
  executeStageFourAction,
  requestStageFourAction,
} from "@/lib/agents/stage4-runtime";
import { buildRecommendedSendPack } from "@/lib/growth/send-pack";
import { recordCompanyEventBestEffort } from "@/lib/memory/store";
import {
  renderRelayTemplate,
  resolveRelayVariables,
  type RelayTemplateSchema,
} from "@/lib/relay/template-renderer";

type Channel = "email" | "whatsapp";

type RelayBuildInput = {
  leadId: string;
  pricingPlanId: string;
  relayTemplateVersionId: string;
  channel?: Channel;
};

function list(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => String(item).trim()).filter(Boolean)
    : [];
}

function canonicalPayloadHash(input: {
  capabilityKey: string;
  channel: string;
  destination: string | null;
  artifactRefs: Record<string, unknown>;
  payload: Record<string, unknown>;
}) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

export async function buildRelayRecommendedSendPack(
  client: SupabaseClient,
  workspaceId: string,
  actorId: string,
  input: RelayBuildInput,
) {
  const [versionResult, leadResult, planResult, workspaceResult] = await Promise.all([
    client
      .from("relay_template_versions")
      .select("id,template_id,version,schema,variable_keys")
      .eq("workspace_id", workspaceId)
      .eq("id", input.relayTemplateVersionId)
      .single(),
    client
      .from("leads")
      .select("id,name,company,pain_point,email")
      .eq("workspace_id", workspaceId)
      .eq("id", input.leadId)
      .single(),
    client
      .from("pricing_plans")
      .select("id,name,service_category,pricing_type,base_price,min_price,max_price,currency,included_features,status")
      .eq("workspace_id", workspaceId)
      .eq("id", input.pricingPlanId)
      .eq("status", "active")
      .single(),
    client.from("workspaces").select("id,name").eq("id", workspaceId).single(),
  ]);

  if (versionResult.error || !versionResult.data) {
    throw new Error("Relay template version was not found in this workspace.");
  }
  if (leadResult.error || !leadResult.data) throw new Error("Lead was not found.");
  if (planResult.error || !planResult.data) throw new Error("Active pricing plan was not found.");
  if (workspaceResult.error || !workspaceResult.data) throw new Error("Workspace was not found.");

  const templateResult = await client
    .from("relay_templates")
    .select("id,name,category,subject_template,status")
    .eq("workspace_id", workspaceId)
    .eq("id", versionResult.data.template_id)
    .single();
  if (templateResult.error || !templateResult.data) throw new Error("Relay template was not found.");
  if (templateResult.data.status !== "active") throw new Error("Relay template must be active before it can be used in a Send Pack.");
  if (templateResult.data.category !== "proposal") {
    throw new Error("Commercial proposal Send Packs require a Relay proposal template.");
  }
  if (input.channel === "whatsapp") {
    throw new Error("Relay email templates can only render email Send Packs.");
  }

  const lead = leadResult.data;
  const plan = planResult.data;
  const scope = list(plan.included_features);
  const selectedPrice = Number(plan.base_price);
  if (!Number.isFinite(selectedPrice)) throw new Error("Pricing plan has no valid selected price.");

  const proposalTitle = `${plan.name} — ${lead.company ?? lead.name}`;
  const values: Record<string, string> = {
    "lead.name": lead.name,
    "lead.company": lead.company ?? lead.name,
    "lead.pain_point": lead.pain_point ?? "",
    "workspace.name": workspaceResult.data.name,
    "proposal.title": proposalTitle,
    "proposal.price": String(selectedPrice),
    "proposal.currency": plan.currency,
    "proposal.scope": scope.join(", "),
    "sender.name": workspaceResult.data.name,
  };

  const renderedSubject = resolveRelayVariables(templateResult.data.subject_template, values);
  const rendered = renderRelayTemplate(versionResult.data.schema as RelayTemplateSchema, values);
  const missing = [...new Set([...renderedSubject.missing, ...rendered.missingVariables])];
  if (missing.length) {
    throw new Error(`Relay template is missing required values: ${missing.join(", ")}.`);
  }

  const pack = await buildRecommendedSendPack(client, workspaceId, actorId, {
    leadId: input.leadId,
    pricingPlanId: input.pricingPlanId,
    channel: "email",
  });

  const proposalUpdate = await client
    .from("orbit_proposal_drafts")
    .update({
      relay_template_version_id: versionResult.data.id,
      relay_rendered_subject: renderedSubject.value.slice(0, 240),
      relay_rendered_html: rendered.html,
      relay_rendered_text: rendered.text,
      relay_variable_snapshot: values,
      relay_rendered_at: new Date().toISOString(),
    })
    .eq("workspace_id", workspaceId)
    .eq("id", pack.proposalId);
  if (proposalUpdate.error) {
    throw new Error(`Bind Relay rendering to proposal: ${proposalUpdate.error.message}`);
  }

  const packUpdate = await client
    .from("orbit_recommended_send_packs")
    .update({
      subject: renderedSubject.value.slice(0, 240),
      message_body: rendered.text,
      content_snapshot: {
        relay_template_id: templateResult.data.id,
        relay_template_version_id: versionResult.data.id,
        relay_template_version: versionResult.data.version,
        rendered_from_canonical_schema: true,
      },
    })
    .eq("workspace_id", workspaceId)
    .eq("id", pack.sendPackId);
  if (packUpdate.error) {
    throw new Error(`Bind Relay rendering to Send Pack: ${packUpdate.error.message}`);
  }

  await recordCompanyEventBestEffort({
    workspaceId,
    actorId,
    domain: "relay",
    eventType: "send_pack.relay_rendered",
    entityType: "send_pack",
    entityId: pack.sendPackId,
    payload: {
      proposal_id: pack.proposalId,
      relay_template_id: templateResult.data.id,
      relay_template_version_id: versionResult.data.id,
      relay_template_version: versionResult.data.version,
    },
  });

  return {
    ...pack,
    relayTemplateId: String(templateResult.data.id),
    relayTemplateVersionId: String(versionResult.data.id),
    relayTemplateVersion: Number(versionResult.data.version),
  };
}

export async function approveAndSendRelayPack(
  client: SupabaseClient,
  workspaceId: string,
  actorId: string,
  sendPackId: string,
) {
  const pack = await client
    .from("orbit_recommended_send_packs")
    .select("id,lead_id,opportunity_id,channel,recommendation_basis,status,action_request_id")
    .eq("workspace_id", workspaceId)
    .eq("id", sendPackId)
    .single();
  if (pack.error || !pack.data) throw new Error("Recommended send pack was not found.");
  if (pack.data.status === "sent") {
    return { sendPackId, status: "sent" as const, actionRequestId: pack.data.action_request_id as string | null, reused: true };
  }
  if (!["waiting_approval", "ready"].includes(pack.data.status)) {
    throw new Error(`Send pack cannot be approved from status ${pack.data.status}.`);
  }

  const basis = pack.data.recommendation_basis && typeof pack.data.recommendation_basis === "object" && !Array.isArray(pack.data.recommendation_basis)
    ? pack.data.recommendation_basis as Record<string, unknown>
    : {};
  const proposalId = String(basis.proposal_id || "");
  if (!proposalId) throw new Error("Send pack is missing its proposal artifact.");
  if (pack.data.channel !== "email") throw new Error("Relay-rendered Send Packs currently support governed email only.");

  const proposal = await client
    .from("orbit_proposal_drafts")
    .select("id,relay_template_version_id,relay_rendered_subject,relay_rendered_html,relay_rendered_text")
    .eq("workspace_id", workspaceId)
    .eq("id", proposalId)
    .single();
  if (proposal.error || !proposal.data?.relay_template_version_id || !proposal.data.relay_rendered_html || !proposal.data.relay_rendered_text) {
    throw new Error("Proposal does not contain a validated Relay rendering.");
  }

  const request = await requestStageFourAction(client, workspaceId, actorId, {
    opportunityId: pack.data.opportunity_id,
    capabilityKey: "growth.proposal_send",
    artifactId: proposalId,
    channel: "email",
    idempotencyKey: `send-pack:${sendPackId}:proposal`,
  });
  const actionRequestId = "actionRequestId" in request
    ? String(request.actionRequestId)
    : "id" in request
      ? String(request.id)
      : "";
  if (!actionRequestId) throw new Error("Stage 4 did not return an external action request.");

  const action = await client
    .from("orbit_external_action_requests")
    .select("id,capability_key,channel,destination,artifact_refs,payload,approval_id")
    .eq("workspace_id", workspaceId)
    .eq("id", actionRequestId)
    .single();
  if (action.error || !action.data) throw new Error("Stage 4 action request could not be loaded for Relay binding.");

  const payload = {
    ...(action.data.payload as Record<string, unknown>),
    subject: proposal.data.relay_rendered_subject,
    body: proposal.data.relay_rendered_text,
    html: proposal.data.relay_rendered_html,
    relayTemplateVersionId: proposal.data.relay_template_version_id,
  };
  const payloadHash = canonicalPayloadHash({
    capabilityKey: action.data.capability_key,
    channel: action.data.channel,
    destination: action.data.destination,
    artifactRefs: action.data.artifact_refs as Record<string, unknown>,
    payload,
  });

  const actionUpdate = await client
    .from("orbit_external_action_requests")
    .update({ payload, payload_hash: payloadHash })
    .eq("workspace_id", workspaceId)
    .eq("id", actionRequestId);
  if (actionUpdate.error) throw new Error(`Bind Relay rendering to Stage 4 action: ${actionUpdate.error.message}`);

  if (action.data.approval_id) {
    const approvalResult = await client
      .from("orbit_agent_approvals")
      .select("proposed_payload")
      .eq("workspace_id", workspaceId)
      .eq("id", action.data.approval_id)
      .single();
    if (approvalResult.error) throw new Error(`Load Stage 4 approval payload: ${approvalResult.error.message}`);
    const proposed = approvalResult.data?.proposed_payload && typeof approvalResult.data.proposed_payload === "object" && !Array.isArray(approvalResult.data.proposed_payload)
      ? approvalResult.data.proposed_payload as Record<string, unknown>
      : {};
    const approvalUpdate = await client
      .from("orbit_agent_approvals")
      .update({ proposed_payload: { ...proposed, payloadHash, relayTemplateVersionId: proposal.data.relay_template_version_id } })
      .eq("workspace_id", workspaceId)
      .eq("id", action.data.approval_id);
    if (approvalUpdate.error) throw new Error(`Update Stage 4 approval payload: ${approvalUpdate.error.message}`);
  }

  await client
    .from("orbit_recommended_send_packs")
    .update({ action_request_id: actionRequestId, status: request.status === "waiting_approval" ? "waiting_approval" : "queued" })
    .eq("workspace_id", workspaceId)
    .eq("id", sendPackId);

  if (request.status === "waiting_approval") {
    await decideStageFourAction(client, workspaceId, actorId, {
      actionRequestId,
      decision: "approved",
      reason: "Founder explicitly approved the validated Relay rendering for this Send Pack.",
    });
  }

  const execution = await executeStageFourAction(client, workspaceId, actorId, { actionRequestId });
  const succeeded = execution.status === "succeeded";
  await client
    .from("orbit_recommended_send_packs")
    .update({
      status: succeeded ? "sent" : "blocked",
      sent_at: succeeded ? new Date().toISOString() : null,
      blocked_reason: succeeded ? null : `Stage 4 execution ended with status ${execution.status}.`,
    })
    .eq("workspace_id", workspaceId)
    .eq("id", sendPackId);

  await recordCompanyEventBestEffort({
    workspaceId,
    actorId,
    domain: "relay",
    eventType: succeeded ? "relay.message.sent" : "relay.message.blocked",
    entityType: "send_pack",
    entityId: sendPackId,
    payload: {
      lead_id: pack.data.lead_id,
      opportunity_id: pack.data.opportunity_id,
      action_request_id: actionRequestId,
      relay_template_version_id: proposal.data.relay_template_version_id,
      execution_status: execution.status,
    },
  });

  return { sendPackId, actionRequestId, status: execution.status, externalActionExecuted: execution.externalActionExecuted };
}
