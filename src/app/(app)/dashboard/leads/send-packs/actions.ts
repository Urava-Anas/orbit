"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  approveAndSendRecommendedPack,
  buildRecommendedSendPack,
} from "@/lib/growth/send-pack";
import {
  approveAndSendRelayPack,
  buildRelayRecommendedSendPack,
} from "@/lib/relay/send-pack-binding";
import { requireWorkspace } from "@/lib/workspace";

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function bounce(kind: "error" | "notice", message: string): never {
  revalidatePath("/dashboard/leads/send-packs");
  redirect(`/dashboard/leads/send-packs?${kind}=${encodeURIComponent(message)}`);
}

export async function buildSendPackAction(formData: FormData) {
  const parsed = z
    .object({
      leadId: z.string().uuid(),
      pricingPlanId: z.string().uuid(),
      relayTemplateVersionId: z.string().uuid().optional().or(z.literal("")),
      channel: z.enum(["auto", "email", "whatsapp"]),
    })
    .safeParse({
      leadId: value(formData, "leadId"),
      pricingPlanId: value(formData, "pricingPlanId"),
      relayTemplateVersionId: value(formData, "relayTemplateVersionId"),
      channel: value(formData, "channel") || "auto",
    });

  if (!parsed.success) {
    bounce("error", "Choose a qualified lead and an active pricing plan.");
  }

  const { supabase, user, workspace } = await requireWorkspace();

  try {
    const common = {
      leadId: parsed.data.leadId,
      pricingPlanId: parsed.data.pricingPlanId,
      channel: parsed.data.channel === "auto" ? undefined : parsed.data.channel,
    } as const;

    const pack = parsed.data.relayTemplateVersionId
      ? await buildRelayRecommendedSendPack(supabase, workspace.id, user.id, {
          ...common,
          relayTemplateVersionId: parsed.data.relayTemplateVersionId,
        })
      : await buildRecommendedSendPack(supabase, workspace.id, user.id, common);

    bounce(
      "notice",
      `Send pack built${parsed.data.relayTemplateVersionId ? " with Relay" : ""}. Review it, then Approve & Send. Pack ${pack.sendPackId.slice(0, 8)}.`,
    );
  } catch (error) {
    bounce(
      "error",
      error instanceof Error ? error.message : "Orbit could not build the send pack.",
    );
  }
}

export async function approveAndSendPackAction(formData: FormData) {
  const parsed = z
    .object({
      sendPackId: z.string().uuid(),
      relay: z.enum(["0", "1"]).default("0"),
    })
    .safeParse({
      sendPackId: value(formData, "sendPackId"),
      relay: value(formData, "relay") || "0",
    });

  if (!parsed.success) bounce("error", "Invalid send pack.");

  const { supabase, user, workspace } = await requireWorkspace();

  try {
    const result = parsed.data.relay === "1"
      ? await approveAndSendRelayPack(supabase, workspace.id, user.id, parsed.data.sendPackId)
      : await approveAndSendRecommendedPack(supabase, workspace.id, user.id, parsed.data.sendPackId);

    bounce(
      result.status === "succeeded" ? "notice" : "error",
      result.status === "succeeded"
        ? `Proposal sent through Orbit's governed sender${parsed.data.relay === "1" ? " using the validated Relay rendering" : ""}.`
        : `Orbit blocked the send with status ${result.status}. Check Autopilot/provider controls.`,
    );
  } catch (error) {
    bounce(
      "error",
      error instanceof Error ? error.message : "Orbit could not send this pack.",
    );
  }
}
