import { z } from "zod";

export const outreachChannelSchema = z.enum(["email", "whatsapp", "phone", "manual"]);
export const leadQualificationSchema = z.enum(["qualified", "review", "unqualified"]);

export const stageTwoLeadCycleSchema = z.object({
  leadId: z.string().uuid(),
  requestedChannel: outreachChannelSchema.optional(),
  idempotencyKey: z.string().min(1).max(180).optional(),
  qualifiedThreshold: z.number().int().min(50).max(90).default(60),
  reviewThreshold: z.number().int().min(20).max(70).default(40),
}).superRefine((value, ctx) => {
  if (value.reviewThreshold >= value.qualifiedThreshold) {
    ctx.addIssue({
      code: "custom",
      path: ["reviewThreshold"],
      message: "reviewThreshold must be lower than qualifiedThreshold",
    });
  }
});

export type OutreachChannel = z.infer<typeof outreachChannelSchema>;
export type LeadQualification = z.infer<typeof leadQualificationSchema>;
export type StageTwoLeadCycleInput = z.infer<typeof stageTwoLeadCycleSchema>;

export type StageTwoEvidence = {
  key: string;
  value: string | number | boolean;
  source: "lead" | "lead_finder";
};

export type LeadIntelligenceResult = {
  fitScore: number;
  problemScore: number;
  contactabilityScore: number;
  commercialScore: number;
  totalScore: number;
  qualification: LeadQualification;
  painPoint: string | null;
  detectedWeakness: string | null;
  recommendedOffer: string | null;
  recommendedChannel: OutreachChannel;
  suggestedNextAction: string;
  evidence: StageTwoEvidence[];
  scoringBasis: Record<string, unknown>;
};

export type OutreachDraftResult = {
  channel: OutreachChannel;
  subject: string | null;
  body: string;
  personalizationBasis: StageTwoEvidence[];
  generationMode: "deterministic_fallback" | "local_model";
  modelProvider: string | null;
  modelName: string | null;
  externalSendEnabled: false;
};
