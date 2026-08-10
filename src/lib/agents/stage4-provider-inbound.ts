import "server-only";

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { processStageFourInboundEvent } from "@/lib/agents/stage4-inbound";

type ProviderReplyInput = {
  providerEventId: string;
  channel: "email" | "whatsapp";
  sender: string;
  responseText: string;
  occurredAt?: string;
};

type OutboundRow = {
  workspace_id: string;
  opportunity_id: string;
  destination: string | null;
};

function stableUuid(seed: string) {
  const bytes = Buffer.from(createHash("sha256").update(seed).digest().subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function normalizePhone(value: string) {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = `92${digits.slice(1)}`;
  return digits;
}

function sameDestination(channel: "email" | "whatsapp", left: string, right: string) {
  return channel === "email"
    ? normalizeEmail(left) === normalizeEmail(right)
    : normalizePhone(left) === normalizePhone(right);
}

function strongOptOut(text: string) {
  const value = text.toLowerCase();
  return [
    "stop messaging",
    "stop contacting",
    "do not contact",
    "don't contact",
    "dont contact",
    "remove me",
    "unsubscribe",
    "not interested",
    "no thanks",
  ].some((phrase) => value.includes(phrase));
}

function looksLikeObjection(text: string) {
  const value = text.toLowerCase();
  return [
    "too expensive",
    "expensive",
    "no budget",
    "budget issue",
    "not now",
    "later",
    "already have",
    "not sure",
    "why should",
    "how much",
    "price",
    "cost",
    "concern",
    "problem",
  ].some((phrase) => value.includes(phrase));
}

function explicitProposalAcceptance(text: string) {
  const value = text.trim().toLowerCase().replace(/[.!]+$/g, "");
  return [
    "i accept",
    "accepted",
    "proposal accepted",
    "approved",
    "go ahead",
    "let's proceed",
    "lets proceed",
    "we accept",
    "proceed",
  ].includes(value);
}

async function resolveOpportunity(
  client: SupabaseClient,
  channel: "email" | "whatsapp",
  sender: string,
) {
  const actions = await client
    .from("orbit_external_action_requests")
    .select("workspace_id,opportunity_id,destination")
    .eq("channel", channel)
    .eq("status", "succeeded")
    .order("completed_at", { ascending: false })
    .limit(250);
  if (actions.error) throw new Error(`Resolve Stage 4 provider reply: ${actions.error.message}`);

  for (const row of (actions.data ?? []) as OutboundRow[]) {
    if (!row.destination || !sameDestination(channel, row.destination, sender)) continue;
    const opportunity = await client
      .from("orbit_sales_opportunities")
      .select("id,current_state,status")
      .eq("workspace_id", row.workspace_id)
      .eq("id", row.opportunity_id)
      .maybeSingle();
    if (opportunity.error) throw new Error(`Load provider reply opportunity: ${opportunity.error.message}`);
    if (!opportunity.data || ["lost", "completed"].includes(String(opportunity.data.status))) continue;
    return {
      workspaceId: row.workspace_id,
      opportunityId: row.opportunity_id,
      state: String(opportunity.data.current_state),
    };
  }
  return null;
}

export async function processStageFourProviderReply(
  client: SupabaseClient,
  input: ProviderReplyInput,
) {
  const responseText = input.responseText.trim().slice(0, 4000);
  if (!responseText) return { status: "ignored" as const, reason: "empty_reply" };
  const resolved = await resolveOpportunity(client, input.channel, input.sender);
  if (!resolved) return { status: "ignored" as const, reason: "no_recent_stage4_outbound_match" };

  const eventId = stableUuid(`${input.channel}:${input.providerEventId}`);
  if (strongOptOut(responseText)) {
    return processStageFourInboundEvent(client, {
      eventId,
      workspaceId: resolved.workspaceId,
      opportunityId: resolved.opportunityId,
      event: "lead_lost",
      responseText,
      channel: input.channel,
      occurredAt: input.occurredAt,
    });
  }

  if (resolved.state === "proposal_drafted") {
    if (!explicitProposalAcceptance(responseText)) {
      return {
        status: "ignored" as const,
        reason: "proposal_reply_requires_founder_or_explicit_acceptance",
        opportunityId: resolved.opportunityId,
      };
    }
    return processStageFourInboundEvent(client, {
      eventId,
      workspaceId: resolved.workspaceId,
      opportunityId: resolved.opportunityId,
      event: "proposal_accepted",
      channel: input.channel,
      occurredAt: input.occurredAt,
    });
  }

  if (!["waiting_reply", "engaged"].includes(resolved.state)) {
    return {
      status: "ignored" as const,
      reason: "state_does_not_accept_unverified_reply_transition",
      opportunityId: resolved.opportunityId,
      state: resolved.state,
    };
  }

  if (looksLikeObjection(responseText)) {
    return processStageFourInboundEvent(client, {
      eventId,
      workspaceId: resolved.workspaceId,
      opportunityId: resolved.opportunityId,
      event: "reply_objection",
      responseText,
      objections: [responseText.slice(0, 500)],
      channel: input.channel,
      occurredAt: input.occurredAt,
    });
  }

  return processStageFourInboundEvent(client, {
    eventId,
    workspaceId: resolved.workspaceId,
    opportunityId: resolved.opportunityId,
    event: "reply_interested",
    responseText,
    channel: input.channel,
    occurredAt: input.occurredAt,
  });
}
