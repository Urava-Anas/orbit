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
    "Orchestrate Orbit's sales loop, delegate work to specialist agents, enforce authority rules, and escalate exceptions without bypassing founder controls.",
  instructions: [
    "Treat Orbit database state as the source of truth.",
    "Never perform an action that is not explicitly allowed by the agent capability map.",
    "Green actions may execute automatically when their conditions pass.",
    "Amber actions require supervisor approval; if no supervisor exists, route to the workspace owner/founder.",
    "Red actions require founder approval before execution.",
    "Delegate specialist work through child runs instead of impersonating a specialist.",
    "Every delegated task must record the exact capability authorizing it.",
    "Every delegated task must have a run, task record, idempotency key when applicable, and execution event history.",
    "On failure, preserve evidence, stop unsafe continuation, and return a structured escalation instead of improvising.",
    "Stages 1 and 2 may write internal Orbit records, but must never send messages or trigger external commercial actions.",
  ].join("\n"),
  supervisorKey: null,
  model: null,
  tools: ["agent.delegate", "orbit.read_state"],
  capabilities: [
    { key: "agents.read", authority: "green" },
    { key: "agents.delegate", authority: "green" },
    { key: "agents.run", authority: "amber" },
  ],
  inputSchema: {
    type: "object",
    additionalProperties: true,
  },
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
    maxDelegationDepth: 4,
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
    "Turn an existing Orbit lead and its Lead Finder evidence into a reproducible qualification decision and sales intelligence snapshot.",
  instructions: [
    "Use only workspace-owned lead and Lead Finder evidence.",
    "Prefer existing verified Lead Finder scores when present; otherwise use the deterministic Stage 2 rubric.",
    "Never invent contact details, proof, pain points, review counts, or business facts.",
    "Separate evidence from inference and persist the scoring basis.",
    "Return qualified, review, or unqualified using the Stage 2 thresholds.",
    "Do not send outreach and do not modify external systems.",
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
      qualification: { type: "string" },
      recommendedChannel: { type: ["string", "null"] },
    },
    required: ["intelligenceId", "totalScore", "qualification", "recommendedChannel"],
  },
  config: {
    qualifiedThreshold: 60,
    reviewThreshold: 40,
    externalActionsEnabled: false,
  },
});

export const outreachAgent: OrbitAgentDefinition = validateAgentDefinition({
  key: "outreach",
  name: "Outreach",
  kind: "specialist",
  status: "active",
  mission:
    "Create concise, evidence-grounded personalized sales outreach for qualified Orbit leads while keeping all sending disabled until a later stage.",
  instructions: [
    "Draft only for qualified leads unless the Sales Director explicitly routes a review case later.",
    "Personalize from persisted lead intelligence; never fabricate familiarity or claims.",
    "Lead with the observed business problem and a relevant next step, not generic praise.",
    "Do not promise guaranteed outcomes, invented scarcity, or unsupported proof.",
    "Return a draft artifact only. Never call email, WhatsApp, social, or messaging send tools in Stage 2.",
  ].join("\n"),
  supervisorKey: "sales_director",
  model: null,
  tools: ["orbit.leads.read", "orbit.intelligence.read", "orbit.outreach.write"],
  capabilities: [
    { key: "growth.read", authority: "green" },
    { key: "growth.outreach_draft", authority: "green" },
    { key: "growth.outreach_send", authority: "red", conditions: { disabledInStage2: true } },
  ],
  inputSchema: {
    type: "object",
    properties: {
      leadId: { type: "string" },
      intelligenceId: { type: "string" },
    },
    required: ["leadId", "intelligenceId"],
  },
  outputSchema: {
    type: "object",
    properties: {
      draftId: { type: "string" },
      channel: { type: "string" },
      externalSendEnabled: { const: false },
    },
    required: ["draftId", "channel", "externalSendEnabled"],
  },
  config: {
    modelPolicy: "optional_openai_compatible_local",
    deterministicFallback: true,
    externalActionsEnabled: false,
  },
});

export const stageOneAgentCatalog = [salesDirectorAgent] as const;
export const stageTwoAgentCatalog = [
  salesDirectorAgent,
  leadIntelligenceAgent,
  outreachAgent,
] as const;
