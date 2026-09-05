export const CARRIER_SOURCE_PRIORITY = {
  official_government: 1,
  verified_document: 2,
  carrier_verified: 3,
  apex_first_party: 4,
  company_website: 5,
  public_web: 6,
  inferred: 7,
} as const;

export type CarrierSourceType = keyof typeof CARRIER_SOURCE_PRIORITY;

export type CarrierVerificationState =
  | "verified"
  | "carrier_filed"
  | "carrier_confirmed"
  | "derived"
  | "inferred"
  | "unverified"
  | "unknown";

export type CarrierVettingDecision =
  | "unassessed"
  | "approved"
  | "review"
  | "hold"
  | "reject";

export type CarrierRegulatoryIdentifierType = "usdot" | "mc" | "ff" | "mx";

export interface CarrierRegulatoryIdentifier {
  type: CarrierRegulatoryIdentifierType;
  value: string;
  isPrimary: boolean;
  status: "observed" | "active" | "inactive" | "historical" | "unknown";
  sourceName: string;
  sourceReference?: string | null;
  firstSeenAt?: string | null;
  lastSeenAt?: string | null;
}

export interface CarrierFieldEvidence<T = unknown> {
  value: T | null;
  sourceType: CarrierSourceType;
  sourceName: string;
  sourceReference?: string | null;
  sourceDate?: string | null;
  retrievedAt: string;
  confidence: number;
  verificationState: CarrierVerificationState;
  previousValue?: T | null;
}

export interface CarrierIdentity360 {
  legalName: CarrierFieldEvidence<string>;
  dbaName?: CarrierFieldEvidence<string>;
  /**
   * Compatibility/display MC only. A USDOT entity can have multiple MC/FF/MX
   * dockets, so operational code must use `regulatoryIdentifiers` rather than
   * assuming this field is the carrier's only docket.
   */
  mcNumber?: CarrierFieldEvidence<string>;
  dotNumber?: CarrierFieldEvidence<string>;
  regulatoryIdentifiers?: CarrierFieldEvidence<CarrierRegulatoryIdentifier[]>;
  officerName?: CarrierFieldEvidence<string>;
  officerTitle?: CarrierFieldEvidence<string>;
  phone?: CarrierFieldEvidence<string>;
  cellPhone?: CarrierFieldEvidence<string>;
  email?: CarrierFieldEvidence<string>;
  website?: CarrierFieldEvidence<string>;
  socialProfiles?: CarrierFieldEvidence<Record<string, string>>;
  physicalAddress?: CarrierFieldEvidence<string>;
  city?: CarrierFieldEvidence<string>;
  state?: CarrierFieldEvidence<string>;
  postalCode?: CarrierFieldEvidence<string>;
}

export interface CarrierFleet360 {
  drivers?: CarrierFieldEvidence<number>;
  powerUnits?: CarrierFieldEvidence<number>;
  trailers?: CarrierFieldEvidence<number>;
  equipment?: CarrierFieldEvidence<string[]>;
  operatingClassification?: CarrierFieldEvidence<string[]>;
  cargoTypes?: CarrierFieldEvidence<string[]>;
}

export interface CarrierAuthority360 {
  status?: CarrierFieldEvidence<string>;
  authorityTypes?: CarrierFieldEvidence<string[]>;
  grantedAt?: CarrierFieldEvidence<string>;
  authorityAgeDays?: CarrierFieldEvidence<number>;
  history?: CarrierFieldEvidence<Record<string, unknown>[]>;
}

export interface CarrierInsurance360 {
  regulatoryStatus?: CarrierFieldEvidence<string>;
  /**
   * Complete stored regulatory filing set. Use this when Motus returns more than
   * one filing; singleton convenience fields below must never arbitrarily choose
   * one policy from a multi-filing carrier.
   */
  filings?: CarrierFieldEvidence<Record<string, unknown>[]>;
  insurer?: CarrierFieldEvidence<string>;
  filingType?: CarrierFieldEvidence<string>;
  policyNumber?: CarrierFieldEvidence<string>;
  requiredAmount?: CarrierFieldEvidence<number>;
  coverageAmount?: CarrierFieldEvidence<number>;
  effectiveAt?: CarrierFieldEvidence<string>;
  cancellationAt?: CarrierFieldEvidence<string>;
  commercialEvidenceStatus?: CarrierFieldEvidence<string>;
}

export interface CarrierSafety360 {
  safetyRating?: CarrierFieldEvidence<string>;
  allowedToOperate?: CarrierFieldEvidence<boolean>;
  totalInspections?: CarrierFieldEvidence<number>;
  vehicleInspections?: CarrierFieldEvidence<number>;
  driverInspections?: CarrierFieldEvidence<number>;
  hazmatInspections?: CarrierFieldEvidence<number>;
  vehicleOosCount?: CarrierFieldEvidence<number>;
  driverOosCount?: CarrierFieldEvidence<number>;
  hazmatOosCount?: CarrierFieldEvidence<number>;
  vehicleOosPercent?: CarrierFieldEvidence<number>;
  driverOosPercent?: CarrierFieldEvidence<number>;
  hazmatOosPercent?: CarrierFieldEvidence<number>;
  totalViolations?: CarrierFieldEvidence<number>;
  violationCategories?: CarrierFieldEvidence<Record<string, number>>;
  totalCrashes?: CarrierFieldEvidence<number>;
  fatalCrashes?: CarrierFieldEvidence<number>;
  injuryCrashes?: CarrierFieldEvidence<number>;
  towawayCrashes?: CarrierFieldEvidence<number>;
}

export interface CarrierHazmat360 {
  declaredHazmat?: CarrierFieldEvidence<boolean>;
  hazmatInspectionHistory?: CarrierFieldEvidence<Record<string, unknown>>;
  hmspStatus?: CarrierFieldEvidence<"unknown" | "active" | "inactive" | "not_required">;
}

export interface CarrierCredentials360 {
  ucr?: CarrierFieldEvidence<string>;
  irp?: CarrierFieldEvidence<string>;
  ifta?: CarrierFieldEvidence<string>;
  hvut2290?: CarrierFieldEvidence<string>;
  stateCredentials?: CarrierFieldEvidence<Record<string, string>>;
  movementPermits?: CarrierFieldEvidence<Record<string, string>>;
}

export interface CarrierRisk360 {
  apexRiskScore?: number | null;
  decision: CarrierVettingDecision;
  reasons: string[];
  scoringVersion?: string | null;
  assessedAt?: string | null;
}

export interface Carrier360Profile {
  carrierId: string;
  workspaceId: string;
  leadId?: string | null;
  identity: CarrierIdentity360;
  fleet: CarrierFleet360;
  authority: CarrierAuthority360;
  insurance: CarrierInsurance360;
  safety: CarrierSafety360;
  hazmat: CarrierHazmat360;
  credentials: CarrierCredentials360;
  risk: CarrierRisk360;
  lastMaterialVerificationAt?: string | null;
}

const VERIFICATION_STRENGTH: Record<CarrierVerificationState, number> = {
  verified: 1,
  carrier_filed: 2,
  carrier_confirmed: 3,
  derived: 4,
  unverified: 5,
  inferred: 6,
  unknown: 7,
};

function timestamp(value?: string | null): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Determines whether a newly observed value is allowed to become the normalized
 * Carrier 360 value.
 *
 * Rules:
 * 1. A stronger source class always beats a weaker source class.
 * 2. For equal source classes, a stronger verification state wins.
 * 3. If those are equal, prefer the newer source date, then retrieval time.
 *
 * This prevents public-web or inferred enrichment from silently overwriting an
 * official government fact while still allowing fresher evidence at the same
 * trust tier to update the profile.
 */
export function shouldReplaceCarrierEvidence<T>(
  current: CarrierFieldEvidence<T> | null | undefined,
  candidate: CarrierFieldEvidence<T>,
): boolean {
  if (!current) return true;

  const currentPriority = CARRIER_SOURCE_PRIORITY[current.sourceType];
  const candidatePriority = CARRIER_SOURCE_PRIORITY[candidate.sourceType];

  if (candidatePriority !== currentPriority) {
    return candidatePriority < currentPriority;
  }

  const currentVerification = VERIFICATION_STRENGTH[current.verificationState];
  const candidateVerification = VERIFICATION_STRENGTH[candidate.verificationState];

  if (candidateVerification !== currentVerification) {
    return candidateVerification < currentVerification;
  }

  const currentSourceDate = timestamp(current.sourceDate);
  const candidateSourceDate = timestamp(candidate.sourceDate);
  if (candidateSourceDate !== currentSourceDate) {
    return candidateSourceDate > currentSourceDate;
  }

  return timestamp(candidate.retrievedAt) > timestamp(current.retrievedAt);
}

/**
 * Authority age is Apex-derived from the original/current authority grant date;
 * it is not stored as an independent regulatory fact.
 */
export function calculateAuthorityAgeDays(
  grantedAt: string | Date | null | undefined,
  asOf: string | Date = new Date(),
): number | null {
  if (!grantedAt) return null;

  const granted = grantedAt instanceof Date ? grantedAt : new Date(grantedAt);
  const comparison = asOf instanceof Date ? asOf : new Date(asOf);
  if (!Number.isFinite(granted.getTime()) || !Number.isFinite(comparison.getTime())) {
    return null;
  }

  const elapsed = comparison.getTime() - granted.getTime();
  if (elapsed < 0) return 0;
  return Math.floor(elapsed / 86_400_000);
}

/**
 * Compliance-sensitive unknowns must remain explicit. This helper is used by
 * Carrier 360 surfaces to avoid rendering a missing fact as a false negative.
 */
export function hasKnownValue<T>(evidence: CarrierFieldEvidence<T> | null | undefined): boolean {
  return Boolean(evidence && evidence.value !== null && evidence.verificationState !== "unknown");
}
