import {
  stageThreeAgentCatalog,
} from "@/lib/agents/catalog";
import {
  type OrbitAgentDefinition,
  validateAgentDefinition,
} from "@/lib/agents/contracts";
import {
  stageFourFounderOnlyCapabilities,
  stageFourPolicyEligibleCapabilities,
  type StageFourExternalCapability,
} from "@/lib/agents/stage4-contracts";

const externalCapabilities = new Set<StageFourExternalCapability>([
  "growth.outreach_send",
  "growth.followup_send",
  "growth.proposal_send",
  "cash.payment_request",
  "cash.payment_collect",
  "delivery.project_activate",
  "proof.publish",
  "growth.referral_send",
]);

function stageFourInstructions(definition: OrbitAgentDefinition) {
  const preserved = definition.instructions
    .split("\n")
    .filter((line) => !line.includes("Stage 3"))
    .filter((line) => !line.includes("in Stage 3"));

  return [
    ...preserved,
    "Stage 4 never permits a specialist to call an external provider directly.",
    "Any irreversible action must be represented as an Orbit external action request and pass the centralized Stage 4 execution gateway.",
    "Do not bypass the workspace Autopilot state, kill switch, preflight, working-hours rules, rate limits, idempotency, approval, policy-grant, or capacity checks.",
    "A policy grant is founder pre-authorization only within its explicit constraints; outside those constraints the action must wait for founder approval.",
    "Payment collection is not implemented by the Stage 4 message gateway and must fail closed until a dedicated payment provider is connected.",
  ].join("\n");
}

function stageFourCapability(capability: OrbitAgentDefinition["capabilities"][number]) {
  if (!externalCapabilities.has(capability.key as StageFourExternalCapability)) {
    return capability;
  }

  const key = capability.key as StageFourExternalCapability;
  return {
    ...capability,
    authority: "red" as const,
    conditions: {
      ...capability.conditions,
      disabledInStage3: false,
      gatewayOnly: true,
      founderApprovalRequired: true,
      policyGrantEligible: stageFourPolicyEligibleCapabilities.has(key),
      founderOnly: stageFourFounderOnlyCapabilities.has(key),
    },
  };
}

function toStageFourDefinition(definition: OrbitAgentDefinition): OrbitAgentDefinition {
  const isExternalActor = definition.capabilities.some((capability) =>
    externalCapabilities.has(capability.key as StageFourExternalCapability),
  );

  return validateAgentDefinition({
    ...definition,
    instructions: stageFourInstructions(definition),
    tools: isExternalActor
      ? Array.from(new Set([...definition.tools, "orbit.autopilot.request_external_action"]))
      : definition.tools,
    capabilities: definition.capabilities.map(stageFourCapability),
    config: {
      ...definition.config,
      stage: 4,
      executionMode: isExternalActor ? "gateway_only" : definition.config.executionMode,
      externalActionsEnabled: isExternalActor ? "gateway_only" : false,
    },
  });
}

export const stageFourAgentCatalog: OrbitAgentDefinition[] = stageThreeAgentCatalog.map(
  toStageFourDefinition,
);
