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
    "Every delegated task must record the exact capability authorizing it.",
    "Every delegated task must have a run, task record, idempotency key when applicable, and execution event history.",
    "On failure, preserve evidence, stop unsafe continuation, and return a structured escalation instead of improvising.",
    "Stage 1 is dry-run only: never call external sales, messaging, payment, publishing, or delivery tools.",
  ].join("\n"),
  supervisorKey: null,
  model: null,
  tools: [],
  capabilities: [
    { key: "agents.read", authority: "green" },
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
    executionMode: "dry_run",
    maxDelegationDepth: 4,
    defaultMaxAttempts: 3,
    externalActionsEnabled: false,
  },
});

export const stageOneAgentCatalog = [salesDirectorAgent] as const;
