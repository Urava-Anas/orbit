import { z } from "zod";

export const stageThreeOpportunityStateSchema = z.enum([
  "intelligence_pending",
  "intelligence_ready",
  "research_ready",
  "qualified",
  "review",
  "unqualified",
  "outreach_drafted",
  "waiting_reply",
  "engaged",
  "proposal_requested",
  "proposal_drafted",
  "payment_pending",
  "payment_confirmed",
  "handoff_ready",
  "delivery_active",
  "delivery_completed",
  "proof_ready",
  "referral_ready",
  "closed_won",
  "closed_lost",
  "blocked",
]);

export const stageThreePrepareSchema = z.object({
  leadId: z.string().uuid(),
  idempotencyKey: z.string().min(1).max(160).optional(),
});

export const stageThreeAdvanceEventSchema = z.enum([
  "reply_interested",
  "reply_objection",
  "proposal_requested",
  "proposal_accepted",
  "payment_confirmed",
  "delivery_completed",
  "proof_permission_granted",
  "lead_lost",
]);

export const stageThreeAdvanceSchema = z
  .object({
    opportunityId: z.string().uuid(),
    event: stageThreeAdvanceEventSchema,
    idempotencyKey: z.string().min(1).max(160).optional(),
    responseText: z.string().max(4000).optional(),
    objections: z.array(z.string().min(1).max(500)).max(12).default([]),
    priceMin: z.number().nonnegative().optional(),
    priceMax: z.number().nonnegative().optional(),
    currency: z.enum(["PKR", "USD", "GBP", "EUR", "AED", "SAR"]).optional(),
    paymentReference: z.string().min(1).max(240).optional(),
    capacityStatus: z.enum(["unknown", "available", "constrained", "blocked"]).optional(),
    deliveryBrief: z.record(z.string(), z.unknown()).optional(),
    resultSummary: z.string().min(10).max(4000).optional(),
    proofPermissionScope: z.enum(["private", "anonymous", "public"]).optional(),
  })
  .superRefine((input, ctx) => {
    if (["reply_interested", "reply_objection"].includes(input.event) && !input.responseText) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["responseText"], message: "A real inbound response is required." });
    }
    if (input.event === "proposal_requested") {
      if (input.priceMin === undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["priceMin"], message: "Explicit approved priceMin is required." });
      }
      if (input.priceMax === undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["priceMax"], message: "Explicit approved priceMax is required." });
      }
      if (!input.currency) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["currency"], message: "Explicit currency is required." });
      }
      if (input.priceMin !== undefined && input.priceMax !== undefined && input.priceMax < input.priceMin) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["priceMax"], message: "priceMax must be greater than or equal to priceMin." });
      }
    }
    if (input.event === "payment_confirmed" && !input.paymentReference) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["paymentReference"], message: "A verified external payment reference is required." });
    }
    if (input.event === "payment_confirmed" && !input.capacityStatus) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["capacityStatus"], message: "Current delivery capacity status is required." });
    }
    if (input.event === "delivery_completed" && !input.resultSummary) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["resultSummary"], message: "A real delivery result summary is required." });
    }
    if (input.event === "proof_permission_granted" && !input.proofPermissionScope) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["proofPermissionScope"], message: "Explicit proof permission scope is required." });
    }
  });

export type StageThreeOpportunityState = z.infer<typeof stageThreeOpportunityStateSchema>;
export type StageThreeAdvanceEvent = z.infer<typeof stageThreeAdvanceEventSchema>;
export type StageThreePrepareInput = z.infer<typeof stageThreePrepareSchema>;
export type StageThreeAdvanceInput = z.infer<typeof stageThreeAdvanceSchema>;

const allowedStatesByEvent: Record<StageThreeAdvanceEvent, StageThreeOpportunityState[]> = {
  reply_interested: ["waiting_reply", "engaged"],
  reply_objection: ["waiting_reply", "engaged"],
  proposal_requested: ["engaged", "proposal_requested"],
  proposal_accepted: ["proposal_drafted"],
  payment_confirmed: ["payment_pending"],
  delivery_completed: ["handoff_ready", "delivery_active", "delivery_completed"],
  proof_permission_granted: ["proof_ready", "referral_ready"],
  lead_lost: [
    "waiting_reply",
    "engaged",
    "proposal_requested",
    "proposal_drafted",
    "payment_pending",
  ],
};

export function assertStageThreeEventAllowed(
  state: StageThreeOpportunityState,
  event: StageThreeAdvanceEvent,
) {
  if (!allowedStatesByEvent[event].includes(state)) {
    throw new Error(`Stage 3 event ${event} is not allowed from state ${state}.`);
  }
}
