import { z } from "zod";

export const agentAuthorityLevelSchema = z.enum(["green", "amber", "red"]);
export const agentKindSchema = z.enum(["manager", "specialist"]);
export const agentStatusSchema = z.enum(["draft", "active", "paused", "disabled"]);
export const agentRunStatusSchema = z.enum([
  "queued",
  "running",
  "waiting_approval",
  "succeeded",
  "failed",
  "cancelled",
]);
export const agentTaskStatusSchema = z.enum([
  "queued",
  "running",
  "blocked",
  "waiting_approval",
  "succeeded",
  "failed",
  "cancelled",
]);

const jsonObjectSchema = z.record(z.string(), z.unknown());

export const agentCapabilitySchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){1,4}$/),
  authority: agentAuthorityLevelSchema,
  effect: z.enum(["allow", "deny"]).default("allow"),
  conditions: jsonObjectSchema.default({}),
});

export const orbitAgentDefinitionSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{1,63}$/),
  name: z.string().min(2).max(120),
  kind: agentKindSchema,
  status: agentStatusSchema.default("draft"),
  mission: z.string().min(3).max(1000),
  instructions: z.string().default(""),
  supervisorKey: z.string().regex(/^[a-z][a-z0-9_]{1,63}$/).nullable().default(null),
  model: z
    .object({
      provider: z.string().min(1),
      name: z.string().min(1),
    })
    .nullable()
    .default(null),
  tools: z.array(z.string().min(1)).default([]),
  capabilities: z.array(agentCapabilitySchema).default([]),
  inputSchema: jsonObjectSchema.default({}),
  outputSchema: jsonObjectSchema.default({}),
  config: jsonObjectSchema.default({}),
});

export const agentRunRequestSchema = z.object({
  agentKey: z.string().regex(/^[a-z][a-z0-9_]{1,63}$/),
  input: jsonObjectSchema.default({}),
  idempotencyKey: z.string().min(1).max(200).optional(),
  parentRunId: z.string().uuid().optional(),
  triggerType: z.enum(["manual", "system", "agent", "schedule"]).default("manual"),
});

export const agentTaskRequestSchema = z.object({
  runId: z.string().uuid(),
  assignedAgentKey: z.string().regex(/^[a-z][a-z0-9_]{1,63}$/),
  taskType: z.string().min(2).max(120),
  title: z.string().min(2).max(240),
  riskLevel: agentAuthorityLevelSchema.default("green"),
  priority: z.number().int().min(0).max(100).default(50),
  input: jsonObjectSchema.default({}),
  idempotencyKey: z.string().min(1).max(200).optional(),
  parentTaskId: z.string().uuid().optional(),
});

export type AgentAuthorityLevel = z.infer<typeof agentAuthorityLevelSchema>;
export type OrbitAgentDefinition = z.infer<typeof orbitAgentDefinitionSchema>;
export type AgentRunRequest = z.infer<typeof agentRunRequestSchema>;
export type AgentTaskRequest = z.infer<typeof agentTaskRequestSchema>;

export type AgentApprovalRoute = "auto" | "supervisor" | "founder";

export const approvalRouteForAuthority: Record<AgentAuthorityLevel, AgentApprovalRoute> = {
  green: "auto",
  amber: "supervisor",
  red: "founder",
};

export function validateAgentDefinition(input: unknown): OrbitAgentDefinition {
  return orbitAgentDefinitionSchema.parse(input);
}
