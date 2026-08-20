"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { decideStageFourAction, executeStageFourAction, requestStageFourAction } from "@/lib/agents/stage4-runtime";
import {
  buildRecommendedSendPack,
  isLeadReadyForSendPack,
  type SendPackContentAsset,
  type SendPackLead,
  type SendPackPricingPlan,
} from "@/lib/send-packs";
import { requireWorkspace } from "@/lib/workspace";

const idSchema = z.string().uuid();

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function fail(leadId: string, message: string): never {
  redirect(`/dashboard/leads/${leadId}?error=${encodeURIComponent(message)}`);
}

function succeed(leadId: string, message: string): never {
  revalidatePath(`/dashboard/leads/${leadId}`);
  revalidatePath("/dashboard/leads");
  redirect(`/dashboard/leads/${leadId}?notice=${encodeURIComponent(message)}`);
}

export async function prepareRecommendedSendPack(formData: FormData) {
  const parsed = z.object({
    leadId: idSchema,
    planId: idSchema,
    assetId: idSchema.or(z.literal("")),
  }).safeParse({
    leadId: value(formData, "leadId"),
    planId: value(formData, "planId"),
    assetId: value(formData, "assetId"),
  });
  if (!parsed.success) fail(value(formData, "leadId"), "Choose a valid active pricing plan.");

  const { supabase, user, workspace } = await requireWorkspace();
  const [leadResult, plansResult, assetsResult] = await Promise.all([
    supabase.from("leads").select("id,name,company,email,phone,whatsapp,niche,stage,pain_point,notes,lead_score,currency").eq("workspace_id", workspace.id).eq("id", parsed.data.leadId).single(),
    supabase.from("pricing_plans").select("id,name,service_category,summary,pricing_type,base_price,min_price,max_price,currency,max_discount_percent,installment_options,included_features,add_ons,offer_valid_days,requires_approval,status,version").eq("workspace_id", workspace.id).eq("status", "active"),
    supabase.from("commercial_content_assets").select("id,title,asset_type,asset_url,body,audience_tags,industry_tags,service_categories,lead_stages,channels,goal,language,cta,linked_pricing_plan_id,status,sent_count,reply_count,meeting_count,won_count").eq("workspace_id", workspace.id).eq("status", "approved"),
  ]);
  if (leadResult.error || !leadResult.data) fail(parsed.data.leadId, "Orbit could not load this lead.");
  const lead = leadResult.data as SendPackLead;
  if (!isLeadReadyForSendPack(lead)) fail(lead.id, "Qualify this lead before preparing a commercial send pack.");

  let recommendation;
  try {
    recommendation = buildRecommendedSendPack({
      lead,
      plans: (plansResult.data ?? []) as SendPackPricingPlan[],
      assets: (assetsResult.data ?? []) as SendPackContentAsset[],
      selectedPlanId: parsed.data.planId,
      selectedAssetId: parsed.data.assetId || null,
    });
  } catch (error) {
    fail(lead.id, error instanceof Error ? error.message : "Orbit could not recommend a send pack.");
  }
  if (parsed.data.assetId && recommendation.asset?.id !== parsed.data.assetId) {
    fail(lead.id, "The selected content asset is not approved for this lead, channel and plan.");
  }

  const opportunityResult = await supabase
    .from("orbit_sales_opportunities")
    .select("id,current_state,status,version,context")
    .eq("workspace_id", workspace.id)
    .eq("lead_id", lead.id)
    .maybeSingle();
  if (opportunityResult.error) fail(lead.id, "Orbit could not prepare this sales opportunity.");

  const forbiddenStates = new Set(["payment_pending", "payment_confirmed", "handoff_ready", "delivery_active", "delivery_completed", "proof_ready", "referral_ready", "closed_won", "closed_lost", "blocked"]);
  let opportunityId: string;
  if (opportunityResult.data) {
    if (forbiddenStates.has(opportunityResult.data.current_state)) {
      fail(lead.id, `This opportunity is already ${opportunityResult.data.current_state.replaceAll("_", " ")}; a new proposal cannot overwrite it.`);
    }
    const context = opportunityResult.data.context && typeof opportunityResult.data.context === "object"
      ? opportunityResult.data.context as Record<string, unknown>
      : {};
    const updated = await supabase
      .from("orbit_sales_opportunities")
      .update({
        current_state: "proposal_drafted",
        status: "active",
        next_agent_key: "payment_onboarding",
        version: Number(opportunityResult.data.version) + 1,
        context: { ...context, phaseOneSendPack: true, pricingPlanId: recommendation.plan.id },
      })
      .eq("workspace_id", workspace.id)
      .eq("id", opportunityResult.data.id)
      .eq("version", opportunityResult.data.version)
      .select("id")
      .maybeSingle();
    if (updated.error || !updated.data) fail(lead.id, "This sales opportunity changed. Refresh and try again.");
    opportunityId = updated.data.id as string;
  } else {
    const created = await supabase
      .from("orbit_sales_opportunities")
      .insert({
        workspace_id: workspace.id,
        lead_id: lead.id,
        current_state: "proposal_drafted",
        status: "active",
        next_agent_key: "payment_onboarding",
        context: { phaseOneSendPack: true, pricingPlanId: recommendation.plan.id },
        created_by: user.id,
      })
      .select("id")
      .single();
    if (created.error || !created.data) fail(lead.id, "Orbit could not create the sales opportunity.");
    opportunityId = created.data.id as string;
  }

  const supersede = await supabase
    .from("orbit_recommended_send_packs")
    .update({ status: "superseded", blocked_reason: "Replaced by a newer founder preview." })
    .eq("workspace_id", workspace.id)
    .eq("lead_id", lead.id)
    .in("status", ["ready", "waiting_approval", "queued"]);
  if (supersede.error) fail(lead.id, "Orbit could not replace the previous send-pack preview.");

  const inserted = await supabase.from("orbit_recommended_send_packs").insert({
    workspace_id: workspace.id,
    lead_id: lead.id,
    opportunity_id: opportunityId,
    pricing_plan_id: recommendation.plan.id,
    content_asset_id: recommendation.asset?.id ?? null,
    channel: recommendation.channel,
    subject: recommendation.subject,
    message_body: recommendation.messageBody,
    proposal_title: recommendation.proposalTitle,
    proposal_scope: recommendation.proposalScope,
    pricing_snapshot: recommendation.pricingSnapshot,
    content_snapshot: recommendation.contentSnapshot,
    recommendation_basis: recommendation.recommendationBasis,
    confidence: recommendation.confidence,
    requires_approval: recommendation.requiresApproval,
    status: "ready",
    created_by: user.id,
  });
  if (inserted.error) fail(lead.id, "Orbit could not freeze this recommended send pack.");
  succeed(lead.id, "Recommended send pack prepared. Review it once, then send with one click.");
}

export async function sendRecommendedPack(formData: FormData) {
  const parsed = z.object({ leadId: idSchema, packId: idSchema }).safeParse({
    leadId: value(formData, "leadId"),
    packId: value(formData, "packId"),
  });
  if (!parsed.success) fail(value(formData, "leadId"), "Invalid send pack.");

  const { supabase, user, workspace } = await requireWorkspace();
  const packResult = await supabase
    .from("orbit_recommended_send_packs")
    .select("id,lead_id,opportunity_id,content_asset_id,channel,status")
    .eq("workspace_id", workspace.id)
    .eq("id", parsed.data.packId)
    .eq("lead_id", parsed.data.leadId)
    .single();
  if (packResult.error || !packResult.data) fail(parsed.data.leadId, "Orbit could not load this send pack.");
  if (packResult.data.status !== "ready") fail(parsed.data.leadId, `This send pack is ${packResult.data.status}, not ready.`);

  try {
    const request = await requestStageFourAction(supabase, workspace.id, user.id, {
      opportunityId: packResult.data.opportunity_id,
      capabilityKey: "growth.proposal_send",
      artifactId: packResult.data.id,
      channel: packResult.data.channel,
      idempotencyKey: `phase-one-send-pack:${packResult.data.id}`,
    });
    const actionRequestId = "actionRequestId" in request
      ? String(request.actionRequestId)
      : String(request.id);

    await supabase.from("orbit_recommended_send_packs").update({
      action_request_id: actionRequestId,
      status: request.status === "waiting_approval" ? "waiting_approval" : "queued",
    }).eq("workspace_id", workspace.id).eq("id", packResult.data.id);

    if (request.status === "waiting_approval") {
      await decideStageFourAction(supabase, workspace.id, user.id, {
        actionRequestId,
        decision: "approved",
        reason: "Founder explicitly selected Send Recommended for this frozen pack.",
      });
    }

    const execution = await executeStageFourAction(supabase, workspace.id, user.id, {
      actionRequestId,
    });

    if (execution.status !== "succeeded") {
      const reason = "errorCode" in execution ? String(execution.errorCode) : "governed sender blocked the action";
      await supabase.from("orbit_recommended_send_packs").update({ status: "blocked", blocked_reason: reason }).eq("workspace_id", workspace.id).eq("id", packResult.data.id);
      fail(parsed.data.leadId, `Orbit stopped the send safely: ${reason.replaceAll("_", " ")}.`);
    }

    const nextActionAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
    await Promise.all([
      supabase.from("orbit_recommended_send_packs").update({ status: "sent", blocked_reason: null, sent_at: new Date().toISOString() }).eq("workspace_id", workspace.id).eq("id", packResult.data.id),
      supabase.from("leads").update({ stage: "proposal", next_action: "Follow up on the sent proposal.", next_action_at: nextActionAt }).eq("workspace_id", workspace.id).eq("id", parsed.data.leadId),
    ]);

  } catch (error) {
    const message = error instanceof Error ? error.message : "The governed sender rejected this action.";
    await supabase.from("orbit_recommended_send_packs").update({ status: "blocked", blocked_reason: message.slice(0, 2000) }).eq("workspace_id", workspace.id).eq("id", parsed.data.packId);
    fail(parsed.data.leadId, `Orbit stopped the send safely: ${message}`);
  }

  succeed(parsed.data.leadId, "Recommended proposal pack sent and the follow-up is scheduled.");
}
