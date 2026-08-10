import { z } from "zod";

export const stageFourAutopilotStateSchema = z.enum([
  "off",
  "checking",
  "running",
  "pausing",
  "degraded",
  "blocked",
]);

export const stageFourAutopilotModeSchema = z.enum([
  "simulation",
  "approval",
  "policy",
]);

export const stageFourExternalCapabilitySchema = z.enum([
  "growth.outreach_send",
  "growth.followup_send",
  "growth.proposal_send",
  "cash.payment_request",
  "cash.payment_collect",
  "delivery.project_activate",
  "proof.publish",
  "growth.referral_send",
]);

export const stageFourChannelSchema = z.enum([
  "email",
  "whatsapp",
  "phone",
  "manual",
  "system",
]);

export const stageFourActionStatusSchema = z.enum([
  "draft",
  "waiting_approval",
  "approved",
  "queued",
  "executing",
  "succeeded",
  "failed",
  "blocked",
  "cancelled",
  "quarantined",
]);

export const stageFourConfigureSchema = z
  .object({
    mode: stageFourAutopilotModeSchema.default("approval"),
    externalActionsEnabled: z.boolean().default(false),
    killSwitchEngaged: z.boolean().default(true),
    timezone: z.string().min(1).max(80).default("Asia/Karachi"),
    workingHoursStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default("09:00"),
    workingHoursEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default("20:00"),
    workingDays: z.array(z.number().int().min(0).max(6)).min(1).max(7).default([1, 2, 3, 4, 5, 6]),
    maxDailyOutbound: z.number().int().min(1).max(500).default(20),
    minSecondsBetweenOutbound: z.number().int().min(0).max(86_400).default(120),
    maxOpenOpportunities: z.number().int().min(1).max(10_000).default(100),
    maxActiveProjects: z.number().int().min(1).max(1_000).default(10),
    maxConsecutiveFailures: z.number().int().min(1).max(20).default(3),
  })
  .strict();

export const stageFourStartSchema = z.object({
  idempotencyKey: z.string().min(1).max(160).optional(),
});

export const stageFourControlSchema = z.object({
  action: z.enum([
    "start",
    "pause",
    "stop",
    "engage_kill_switch",
    "disengage_kill_switch",
  ]),
  reason: z.string().trim().max(1000).optional(),
  idempotencyKey: z.string().min(1).max(160).optional(),
});

const commonRequestFields = {
  opportunityId: z.string().uuid(),
  idempotencyKey: z.string().min(1).max(180),
  scheduledAt: z.string().datetime().optional(),
};

export const stageFourActionRequestSchema = z.discriminatedUnion("capabilityKey", [
  z.object({
    ...commonRequestFields,
    capabilityKey: z.literal("growth.outreach_send"),
    artifactId: z.string().uuid(),
    channel: z.enum(["email", "whatsapp", "phone", "manual"]),
  }),
  z.object({
    ...commonRequestFields,
    capabilityKey: z.literal("growth.followup_send"),
    artifactId: z.string().uuid(),
    channel: z.enum(["email", "whatsapp", "phone", "manual"]),
    touchIndex: z.number().int().min(0).max(20),
  }),
  z.object({
    ...commonRequestFields,
    capabilityKey: z.literal("growth.proposal_send"),
    artifactId: z.string().uuid(),
    channel: z.enum(["email", "whatsapp", "manual"]),
  }),
  z.object({
    ...commonRequestFields,
    capabilityKey: z.literal("cash.payment_request"),
    artifactId: z.string().uuid(),
    channel: z.enum(["email", "whatsapp", "manual"]),
    paymentInstructions: z.string().min(5).max(2000),
  }),
  z.object({
    ...commonRequestFields,
    capabilityKey: z.literal("cash.payment_collect"),
    artifactId: z.string().uuid(),
    channel: z.literal("system"),
  }),
  z.object({
    ...commonRequestFields,
    capabilityKey: z.literal("delivery.project_activate"),
    artifactId: z.string().uuid(),
    channel: z.literal("system"),
    projectName: z.string().min(2).max(180),
    projectSummary: z.string().max(4000).optional(),
    agreedValue: z.number().nonnegative(),
    currency: z.enum(["PKR", "USD", "GBP", "EUR", "AED", "SAR"]),
    dueDate: z.string().date().optional(),
  }),
  z.object({
    ...commonRequestFields,
    capabilityKey: z.literal("proof.publish"),
    artifactId: z.string().uuid(),
    channel: z.literal("system"),
    proofTitle: z.string().min(2).max(180),
    evidenceUrl: z.string().url().max(500).optional(),
  }),
  z.object({
    ...commonRequestFields,
    capabilityKey: z.literal("growth.referral_send"),
    artifactId: z.string().uuid(),
    channel: z.enum(["email", "whatsapp", "manual"]),
  }),
]);

export const stageFourApprovalDecisionSchema = z.object({
  actionRequestId: z.string().uuid(),
  decision: z.enum(["approved", "rejected"]),
  reason: z.string().trim().max(1000).optional(),
});

export const stageFourExecuteSchema = z.object({
  actionRequestId: z.string().uuid(),
});

export const stageFourPolicyGrantSchema = z.object({
  capabilityKey: stageFourExternalCapabilitySchema,
  enabled: z.boolean().default(true),
  approvalMode: z.enum(["manual", "policy"]).default("manual"),
  constraints: z
    .object({
      allowedChannels: z.array(stageFourChannelSchema).max(5).optional(),
      maxMessageChars: z.number().int().min(50).max(10_000).optional(),
      maxPriceAmount: z.number().nonnegative().optional(),
      allowedCurrencies: z.array(z.enum(["PKR", "USD", "GBP", "EUR", "AED", "SAR"])).max(6).optional(),
      maxDailyActions: z.number().int().min(1).max(500).optional(),
      requireVerifiedContact: z.boolean().optional(),
    })
    .default({}),
  validUntil: z.string().datetime().optional(),
});

export type StageFourAutopilotState = z.infer<typeof stageFourAutopilotStateSchema>;
export type StageFourAutopilotMode = z.infer<typeof stageFourAutopilotModeSchema>;
export type StageFourExternalCapability = z.infer<typeof stageFourExternalCapabilitySchema>;
export type StageFourChannel = z.infer<typeof stageFourChannelSchema>;
export type StageFourActionRequestInput = z.infer<typeof stageFourActionRequestSchema>;
export type StageFourConfigureInput = z.infer<typeof stageFourConfigureSchema>;
export type StageFourPolicyGrantInput = z.infer<typeof stageFourPolicyGrantSchema>;

export const stageFourCapabilityOwner: Record<StageFourExternalCapability, string> = {
  "growth.outreach_send": "outreach",
  "growth.followup_send": "follow_up",
  "growth.proposal_send": "proposal",
  "cash.payment_request": "payment_onboarding",
  "cash.payment_collect": "payment_onboarding",
  "delivery.project_activate": "delivery_handoff",
  "proof.publish": "proof_referral",
  "growth.referral_send": "proof_referral",
};

export const stageFourPolicyEligibleCapabilities = new Set<StageFourExternalCapability>([
  "growth.outreach_send",
  "growth.followup_send",
  "growth.proposal_send",
  "cash.payment_request",
  "growth.referral_send",
]);

export const stageFourGatewayCapabilities = new Set<StageFourExternalCapability>([
  "growth.outreach_send",
  "growth.followup_send",
  "growth.proposal_send",
  "cash.payment_request",
  "growth.referral_send",
]);

export const stageFourFounderOnlyCapabilities = new Set<StageFourExternalCapability>([
  "cash.payment_collect",
  "delivery.project_activate",
  "proof.publish",
]);
