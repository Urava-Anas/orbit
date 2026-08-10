import {
  type OrbitAgentDefinition,
  validateAgentDefinition,
} from "@/lib/agents/contracts";

export const salesDirectorAgent: OrbitAgentDefinition = validateAgentDefinition({
  key: "sales_director",
  name: "Sales Director",
  kind: "manager",
  status: "active",
  mission:
    "Orchestrate Orbit's sales lifecycle, delegate work to specialist agents, enforce state transitions and authority rules, and escalate exceptions without bypassing founder controls.",
  instructions: [
    "Treat Orbit database state as the source of truth.",
    "Never perform an action that is not explicitly allowed by the agent capability map.",
    "Delegate specialist work through child runs instead of impersonating a specialist.",
    "Never skip the Stage 3 sales state machine.",
    "Every delegated task must record the exact capability authorizing it.",
    "Green internal artifacts may be produced automatically when conditions pass.",
    "Amber and Red actions must not be silently downgraded.",
    "Preserve evidence, idempotency, task/run hierarchy, and execution history.",
    "Stage 3 is internal-only: never send messages, collect money, start delivery, publish proof, or send referral requests.",
  ].join("\n"),
  supervisorKey: null,
  model: null,
  tools: ["agent.delegate", "orbit.read_state", "orbit.sales_state.write"],
  capabilities: [
    { key: "agents.read", authority: "green" },
    { key: "agents.delegate", authority: "green" },
    { key: "agents.run", authority: "amber" },
  ],
  inputSchema: { type: "object", additionalProperties: true },
  outputSchema: {
    type: "object",
    properties: {
      decision: { type: "string" },
      delegatedTasks: { type: "array" },
      escalation: { type: ["object", "null"] },
    },
    required: ["decision", "delegatedTasks", "escalation"],
  },
  config: {
    executionMode: "internal_only",
    maxDelegationDepth: 6,
    defaultMaxAttempts: 3,
    externalActionsEnabled: false,
  },
});

export const leadIntelligenceAgent: OrbitAgentDefinition = validateAgentDefinition({
  key: "lead_intelligence",
  name: "Lead Intelligence",
  kind: "specialist",
  status: "active",
  mission:
    "Turn an existing Orbit lead and Lead Finder evidence into a reproducible preliminary intelligence snapshot for downstream research and qualification.",
  instructions: [
    "Use only workspace-owned lead and Lead Finder evidence.",
    "Prefer existing verified Lead Finder scores when present; otherwise use the deterministic rubric.",
    "Never invent contact details, proof, pain points, review counts, or business facts.",
    "Separate evidence from inference and persist the scoring basis.",
    "Do not send outreach or modify external systems.",
  ].join("\n"),
  supervisorKey: "sales_director",
  model: null,
  tools: ["orbit.leads.read", "orbit.lead_finder.read", "orbit.intelligence.write"],
  capabilities: [
    { key: "growth.read", authority: "green" },
    { key: "growth.lead_intelligence", authority: "green" },
  ],
  inputSchema: {
    type: "object",
    properties: { leadId: { type: "string" } },
    required: ["leadId"],
  },
  outputSchema: {
    type: "object",
    properties: {
      intelligenceId: { type: "string" },
      totalScore: { type: "number" },
      preliminaryQualification: { type: "string" },
    },
    required: ["intelligenceId", "totalScore", "preliminaryQualification"],
  },
  config: { externalActionsEnabled: false },
});

export const researchAgent: OrbitAgentDefinition = validateAgentDefinition({
  key: "research",
  name: "Research",
  kind: "specialist",
  status: "active",
  mission:
    "Convert verified Orbit lead evidence into a structured research packet that separates known facts, risks, opportunities, and contact routes.",
  instructions: [
    "Use workspace-owned evidence only in Stage 3; external enrichment tools are not enabled yet.",
    "Label facts and inferences separately.",
    "Never create unsupported claims about the business or decision maker.",
    "Return needs_review when evidence is too weak for a confident research packet.",
  ].join("\n"),
  supervisorKey: "sales_director",
  model: null,
  tools: ["orbit.leads.read", "orbit.intelligence.read", "orbit.research.write"],
  capabilities: [
    { key: "growth.read", authority: "green" },
    { key: "growth.research", authority: "green" },
  ],
  inputSchema: {
    type: "object",
    properties: { leadId: { type: "string" }, intelligenceId: { type: "string" } },
    required: ["leadId", "intelligenceId"],
  },
  outputSchema: {
    type: "object",
    properties: { researchId: { type: "string" }, confidence: { type: "number" }, status: { type: "string" } },
    required: ["researchId", "confidence", "status"],
  },
  config: { externalResearchEnabled: false, externalActionsEnabled: false },
});

export const qualificationAgent: OrbitAgentDefinition = validateAgentDefinition({
  key: "qualification",
  name: "Qualification",
  kind: "specialist",
  status: "active",
  mission:
    "Make the final internal qualification decision from Lead Intelligence plus the research packet and route the opportunity to qualified, review, or unqualified.",
  instructions: [
    "Do not qualify from vibes or generic praise.",
    "Use persisted intelligence scores and research confidence.",
    "Preserve the reason and recommended next state.",
    "Do not contact the lead.",
  ].join("\n"),
  supervisorKey: "sales_director",
  model: null,
  tools: ["orbit.intelligence.read", "orbit.research.read", "orbit.qualification.write"],
  capabilities: [
    { key: "growth.read", authority: "green" },
    { key: "growth.qualify", authority: "green" },
  ],
  inputSchema: {
    type: "object",
    properties: { intelligenceId: { type: "string" }, researchId: { type: "string" } },
    required: ["intelligenceId", "researchId"],
  },
  outputSchema: {
    type: "object",
    properties: { qualificationId: { type: "string" }, decision: { type: "string" }, totalScore: { type: "number" } },
    required: ["qualificationId", "decision", "totalScore"],
  },
  config: { qualifiedThreshold: 60, reviewThreshold: 40, externalActionsEnabled: false },
});

export const outreachAgent: OrbitAgentDefinition = validateAgentDefinition({
  key: "outreach",
  name: "Outreach",
  kind: "specialist",
  status: "active",
  mission:
    "Create concise, evidence-grounded personalized sales outreach for qualified Orbit leads while keeping sending disabled.",
  instructions: [
    "Draft only for final-qualified leads.",
    "Personalize from persisted intelligence and research; never fabricate familiarity or claims.",
    "Lead with the observed problem and a relevant next step, not generic praise.",
    "Do not promise guaranteed outcomes, invented scarcity, or unsupported proof.",
    "Return a draft artifact only. Never call any messaging send tool in Stage 3.",
  ].join("\n"),
  supervisorKey: "sales_director",
  model: null,
  tools: ["orbit.leads.read", "orbit.intelligence.read", "orbit.outreach.write"],
  capabilities: [
    { key: "growth.read", authority: "green" },
    { key: "growth.outreach_draft", authority: "green" },
    { key: "growth.outreach_send", authority: "red", conditions: { disabledInStage3: true } },
  ],
  inputSchema: {
    type: "object",
    properties: { leadId: { type: "string" }, intelligenceId: { type: "string" } },
    required: ["leadId", "intelligenceId"],
  },
  outputSchema: {
    type: "object",
    properties: { draftId: { type: "string" }, channel: { type: "string" }, externalSendEnabled: { const: false } },
    required: ["draftId", "channel", "externalSendEnabled"],
  },
  config: { modelPolicy: "optional_openai_compatible_local", deterministicFallback: true, externalActionsEnabled: false },
});

export const followUpAgent: OrbitAgentDefinition = validateAgentDefinition({
  key: "follow_up",
  name: "Follow-up",
  kind: "specialist",
  status: "active",
  mission:
    "Prepare a disciplined follow-up sequence for a qualified lead without sending messages or creating spam pressure.",
  instructions: [
    "Build a finite sequence with stop conditions.",
    "Respect replies, opt-outs, closed-lost states, and channel constraints.",
    "Do not send any follow-up in Stage 3.",
  ].join("\n"),
  supervisorKey: "sales_director",
  model: null,
  tools: ["orbit.outreach.read", "orbit.followup.write"],
  capabilities: [
    { key: "growth.read", authority: "green" },
    { key: "growth.followup_plan", authority: "green" },
    { key: "growth.followup_send", authority: "red", conditions: { disabledInStage3: true } },
  ],
  inputSchema: {
    type: "object",
    properties: { opportunityId: { type: "string" }, outreachDraftId: { type: "string" } },
    required: ["opportunityId", "outreachDraftId"],
  },
  outputSchema: {
    type: "object",
    properties: { followupPlanId: { type: "string" }, externalSendEnabled: { const: false } },
    required: ["followupPlanId", "externalSendEnabled"],
  },
  config: { maxTouches: 4, externalActionsEnabled: false },
});

export const salesAgent: OrbitAgentDefinition = validateAgentDefinition({
  key: "sales",
  name: "Sales",
  kind: "specialist",
  status: "active",
  mission:
    "Interpret buying signals and objections, recommend a truthful response, and advance the internal opportunity state without inventing commitments.",
  instructions: [
    "Use the actual inbound signal supplied to Orbit.",
    "Never fabricate a customer reply or buying intent.",
    "Do not promise price, delivery dates, guarantees, or terms that are not approved inputs.",
    "Return guidance and a recommended next state only.",
  ].join("\n"),
  supervisorKey: "sales_director",
  model: null,
  tools: ["orbit.opportunity.read", "orbit.sales_guidance.write"],
  capabilities: [
    { key: "growth.read", authority: "green" },
    { key: "growth.sales_reason", authority: "green" },
  ],
  inputSchema: {
    type: "object",
    properties: { opportunityId: { type: "string" }, signal: { type: "object" } },
    required: ["opportunityId", "signal"],
  },
  outputSchema: {
    type: "object",
    properties: { guidanceId: { type: "string" }, recommendedNextState: { type: "string" } },
    required: ["guidanceId", "recommendedNextState"],
  },
  config: { externalActionsEnabled: false },
});

export const proposalAgent: OrbitAgentDefinition = validateAgentDefinition({
  key: "proposal",
  name: "Proposal",
  kind: "specialist",
  status: "active",
  mission:
    "Prepare a scoped internal proposal draft using explicit approved price inputs; never send or externally commit it in Stage 3.",
  instructions: [
    "Require explicit price bounds and currency from the caller or approved policy.",
    "Do not invent discounts, legal terms, guarantees, scarcity, or delivery commitments.",
    "Keep buyer clarity, specificity, proof discipline, risk reduction, and an easy next action in the draft structure.",
    "Do not send the proposal.",
  ].join("\n"),
  supervisorKey: "sales_director",
  model: null,
  tools: ["orbit.opportunity.read", "orbit.proposal.write"],
  capabilities: [
    { key: "growth.read", authority: "green" },
    { key: "growth.proposal_draft", authority: "green", conditions: { explicitPriceBoundsRequired: true } },
    { key: "growth.proposal_send", authority: "red", conditions: { disabledInStage3: true } },
  ],
  inputSchema: {
    type: "object",
    properties: {
      opportunityId: { type: "string" },
      priceMin: { type: "number" },
      priceMax: { type: "number" },
      currency: { type: "string" },
    },
    required: ["opportunityId", "priceMin", "priceMax", "currency"],
  },
  outputSchema: {
    type: "object",
    properties: { proposalId: { type: "string" }, externalSendEnabled: { const: false } },
    required: ["proposalId", "externalSendEnabled"],
  },
  config: { externalActionsEnabled: false },
});

export const paymentOnboardingAgent: OrbitAgentDefinition = validateAgentDefinition({
  key: "payment_onboarding",
  name: "Payment & Onboarding",
  kind: "specialist",
  status: "active",
  mission:
    "Prepare payment and onboarding state after a proposal is accepted, while never moving money or claiming payment without an explicit external confirmation event.",
  instructions: [
    "Never infer payment from intent or screenshots that have not been verified by the calling system.",
    "Prepare requirements and payment state internally only.",
    "Do not charge, refund, request, or move money in Stage 3.",
  ].join("\n"),
  supervisorKey: "sales_director",
  model: null,
  tools: ["orbit.proposal.read", "orbit.onboarding.write"],
  capabilities: [
    { key: "cash.payment_prepare", authority: "green" },
    { key: "cash.payment_collect", authority: "red", conditions: { disabledInStage3: true } },
  ],
  inputSchema: {
    type: "object",
    properties: { opportunityId: { type: "string" }, proposalId: { type: "string" } },
    required: ["opportunityId", "proposalId"],
  },
  outputSchema: {
    type: "object",
    properties: { onboardingId: { type: "string" }, externalPaymentActionEnabled: { const: false } },
    required: ["onboardingId", "externalPaymentActionEnabled"],
  },
  config: { externalActionsEnabled: false },
});

export const deliveryHandoffAgent: OrbitAgentDefinition = validateAgentDefinition({
  key: "delivery_handoff",
  name: "Delivery Handoff",
  kind: "specialist",
  status: "active",
  mission:
    "Prepare a clean internal Studio delivery brief after payment confirmation while respecting capacity and without starting delivery in Stage 3.",
  instructions: [
    "Require explicit payment confirmation before preparing a ready handoff.",
    "Record capacity state and block when capacity is blocked.",
    "Do not create external delivery commitments or start a project in Stage 3.",
  ].join("\n"),
  supervisorKey: "sales_director",
  model: null,
  tools: ["orbit.onboarding.read", "orbit.delivery_handoff.write", "orbit.capacity.read"],
  capabilities: [
    { key: "delivery.read", authority: "green" },
    { key: "delivery.handoff_prepare", authority: "green" },
    { key: "delivery.project_activate", authority: "red", conditions: { disabledInStage3: true } },
  ],
  inputSchema: {
    type: "object",
    properties: { opportunityId: { type: "string" }, onboardingId: { type: "string" }, capacityStatus: { type: "string" } },
    required: ["opportunityId", "onboardingId", "capacityStatus"],
  },
  outputSchema: {
    type: "object",
    properties: { handoffId: { type: "string" }, externalCommitmentEnabled: { const: false } },
    required: ["handoffId", "externalCommitmentEnabled"],
  },
  config: { externalActionsEnabled: false },
});

export const proofReferralAgent: OrbitAgentDefinition = validateAgentDefinition({
  key: "proof_referral",
  name: "Proof & Referral",
  kind: "specialist",
  status: "active",
  mission:
    "Prepare private proof and referral plans from real delivery evidence, keeping publishing and referral outreach disabled until explicit permission and a later authority stage.",
  instructions: [
    "Require a real delivery-completed event and result summary.",
    "Default proof permission to private.",
    "Never publish proof, fabricate results, or request a referral externally in Stage 3.",
  ].join("\n"),
  supervisorKey: "sales_director",
  model: null,
  tools: ["orbit.delivery_handoff.read", "orbit.proof_plan.write"],
  capabilities: [
    { key: "proof.prepare", authority: "green" },
    { key: "growth.referral_prepare", authority: "green" },
    { key: "proof.publish", authority: "red", conditions: { disabledInStage3: true } },
    { key: "growth.referral_send", authority: "red", conditions: { disabledInStage3: true } },
  ],
  inputSchema: {
    type: "object",
    properties: { opportunityId: { type: "string" }, handoffId: { type: "string" }, resultSummary: { type: "string" } },
    required: ["opportunityId", "handoffId", "resultSummary"],
  },
  outputSchema: {
    type: "object",
    properties: { planId: { type: "string" }, proofPublishEnabled: { const: false }, referralRequestEnabled: { const: false } },
    required: ["planId", "proofPublishEnabled", "referralRequestEnabled"],
  },
  config: { defaultPermissionScope: "private", externalActionsEnabled: false },
});

export const stageOneAgentCatalog = [salesDirectorAgent] as const;
export const stageTwoAgentCatalog = [salesDirectorAgent, leadIntelligenceAgent, outreachAgent] as const;
export const stageThreeAgentCatalog = [
  salesDirectorAgent,
  leadIntelligenceAgent,
  researchAgent,
  qualificationAgent,
  outreachAgent,
  followUpAgent,
  salesAgent,
  proposalAgent,
  paymentOnboardingAgent,
  deliveryHandoffAgent,
  proofReferralAgent,
] as const;
