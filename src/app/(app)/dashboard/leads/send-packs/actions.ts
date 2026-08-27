"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  approveAndSendRecommendedPack,
  buildRecommendedSendPack,
} from "@/lib/growth/send-pack";
import { requireWorkspace } from "@/lib/workspace";

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function bounce(kind: "error" | "notice", message: string): never {
  revalidatePath("/dashboard/leads/send-packs");
  redirect(
    `/dashboard/leads/send-packs?${kind}=${encodeURIComponent(message)}`,
  );
}

export async function buildSendPackAction(formData: FormData) {
  const parsed = z
    .object({
      leadId: z.string().uuid(),
      pricingPlanId: z.string().uuid(),
      channel: z.enum(["auto", "email", "whatsapp"]),
    })
    .safeParse({
      leadId: value(formData, "leadId"),
      pricingPlanId: value(formData, "pricingPlanId"),
      channel: value(formData, "channel") || "auto",
    });

  if (!parsed.success) {
    bounce("error", "Choose a qualified lead and an active pricing plan.");
  }

  const { supabase, user, workspace } = await requireWorkspace();

  try {
    const pack = await buildRecommendedSendPack(
      supabase,
      workspace.id,
      user.id,
      {
        leadId: parsed.data.leadId,
        pricingPlanId: parsed.data.pricingPlanId,
        channel:
          parsed.data.channel === "auto" ? undefined : parsed.data.channel,
      },
    );
    bounce(
      "notice",
      `Send pack built. Review it, then Approve & Send. Pack ${pack.sendPackId.slice(0, 8)}.`,
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
    .object({ sendPackId: z.string().uuid() })
    .safeParse({ sendPackId: value(formData, "sendPackId") });

  if (!parsed.success) bounce("error", "Invalid send pack.");

  const { supabase, user, workspace } = await requireWorkspace();

  try {
    const result = await approveAndSendRecommendedPack(
      supabase,
      workspace.id,
      user.id,
      parsed.data.sendPackId,
    );
    bounce(
      result.status === "succeeded" ? "notice" : "error",
      result.status === "succeeded"
        ? "Proposal sent through Orbit's governed sender."
        : `Orbit blocked the send with status ${result.status}. Check Autopilot/provider controls.`,
    );
  } catch (error) {
    bounce(
      "error",
      error instanceof Error ? error.message : "Orbit could not send this pack.",
    );
  }
}
