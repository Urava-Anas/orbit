export type CarrierComplianceState =
  | "verified_current"
  | "verified_not_required"
  | "not_current"
  | "unknown";

export type CarrierCredentialState =
  | "verified_current"
  | "verified_not_required"
  | "expired"
  | "missing"
  | "unknown";

export type CarrierPreflightRiskClass = "green" | "amber" | "red";

export interface CarrierOperationalPreflightInput {
  carrierContractActive: boolean;
  legalClassificationApproved: boolean;
  identityVerified: boolean;
  authority: CarrierComplianceState;
  regulatoryInsurance: CarrierComplianceState;
  commercialInsuranceRequired: boolean;
  commercialInsuranceVerified: boolean;
  equipmentKnown: boolean;
  driverAssignmentKnown: boolean;
  hosAvailabilityKnown: boolean;
  loadPolicyLoaded: boolean;
  communicationsHealthy: boolean;
  loadSourceHealthy: boolean;
  factorCreditPolicyKnown: boolean;
  escalationOwnerAvailable: boolean;
  auditLogHealthy: boolean;
  documentStorageHealthy: boolean;
  mandatoryCredentials: CarrierCredentialState[];
  hazmatMovement: boolean;
  hazmatWorkflowValidated: boolean;
  oversizeOrOverweightMovement: boolean;
  oversizeWorkflowValidated: boolean;
  unresolvedSecurityIncident: boolean;
  suspiciousIdentityOrFraud: boolean;
  unresolvedPaymentMasterDataChange: boolean;
  carrierSubstitutionRequested: boolean;
}

export interface CarrierOperationalPreflightResult {
  readyForAutopilot: boolean;
  riskClass: CarrierPreflightRiskClass;
  hardStops: string[];
  missingReadiness: string[];
  humanApprovalRequired: boolean;
}

function currentOrNotRequired(value: CarrierComplianceState) {
  return value === "verified_current" || value === "verified_not_required";
}

/**
 * Deterministic preflight derived from the Apex operating manual's automation
 * boundaries. This function does not approve a carrier or decide whether a
 * regulatory requirement legally applies. Those classifications must already be
 * verified by the governed onboarding/compliance workflow.
 */
export function evaluateCarrierOperationalPreflight(
  input: CarrierOperationalPreflightInput,
): CarrierOperationalPreflightResult {
  const hardStops: string[] = [];
  const missingReadiness: string[] = [];

  if (!input.identityVerified) hardStops.push("carrier_identity_not_verified");
  if (input.suspiciousIdentityOrFraud) hardStops.push("suspicious_identity_or_fraud");
  if (input.unresolvedPaymentMasterDataChange) hardStops.push("unresolved_payment_master_data_change");
  if (input.carrierSubstitutionRequested) hardStops.push("carrier_substitution_requires_human_approval");
  if (input.unresolvedSecurityIncident) hardStops.push("unresolved_security_incident");

  if (!input.legalClassificationApproved) hardStops.push("legal_classification_not_approved");
  if (!currentOrNotRequired(input.authority)) hardStops.push("authority_not_verified_current");
  if (!currentOrNotRequired(input.regulatoryInsurance)) {
    hardStops.push("regulatory_insurance_not_verified_current");
  }
  if (input.commercialInsuranceRequired && !input.commercialInsuranceVerified) {
    hardStops.push("required_commercial_insurance_not_verified");
  }

  if (
    input.mandatoryCredentials.some(
      (state) => state === "expired" || state === "missing" || state === "unknown",
    )
  ) {
    hardStops.push("mandatory_credential_expired_missing_or_unknown");
  }

  if (input.hazmatMovement && !input.hazmatWorkflowValidated) {
    hardStops.push("hazmat_outside_validated_workflow");
  }
  if (input.oversizeOrOverweightMovement && !input.oversizeWorkflowValidated) {
    hardStops.push("oversize_overweight_outside_validated_workflow");
  }

  if (!input.carrierContractActive) missingReadiness.push("carrier_contract_not_active");
  if (!input.equipmentKnown) missingReadiness.push("equipment_availability_unknown");
  if (!input.driverAssignmentKnown) missingReadiness.push("driver_assignment_unknown");
  if (!input.hosAvailabilityKnown) missingReadiness.push("hos_availability_unknown");
  if (!input.loadPolicyLoaded) missingReadiness.push("carrier_load_policy_not_loaded");
  if (!input.communicationsHealthy) missingReadiness.push("communications_integration_unhealthy");
  if (!input.loadSourceHealthy) missingReadiness.push("load_source_integration_unhealthy");
  if (!input.factorCreditPolicyKnown) missingReadiness.push("factor_credit_policy_unknown");
  if (!input.escalationOwnerAvailable) missingReadiness.push("exception_escalation_owner_unavailable");
  if (!input.auditLogHealthy) missingReadiness.push("audit_log_unhealthy");
  if (!input.documentStorageHealthy) missingReadiness.push("document_storage_unhealthy");

  const readyForAutopilot = hardStops.length === 0 && missingReadiness.length === 0;
  const riskClass: CarrierPreflightRiskClass = hardStops.length
    ? "red"
    : missingReadiness.length
      ? "amber"
      : "green";

  return {
    readyForAutopilot,
    riskClass,
    hardStops,
    missingReadiness,
    // Even a GREEN preflight means the evidence prerequisites are satisfied; it
    // does not bypass any load-level RED/AMBER approval gates in Orbit.
    humanApprovalRequired: hardStops.length > 0,
  };
}
