import type { Carrier360Profile, CarrierFieldEvidence } from "@/lib/carrier-intelligence/contracts";
import type {
  CarrierFactoryCandidate,
  CarrierOpportunityScore,
  ApexLeadTier,
} from "@/lib/apex-lead-factory/contracts";

function known<T>(evidence: CarrierFieldEvidence<T> | null | undefined): T | null {
  if (!evidence || evidence.value === null || evidence.verificationState === "unknown") return null;
  return evidence.value;
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function tierFor(score: number): ApexLeadTier {
  if (score >= 80) return "A";
  if (score >= 65) return "B";
  return "C";
}

function ageDays(value?: string | null, now = new Date()): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.floor((now.getTime() - parsed) / 86_400_000));
}

function hasAny(values: string[] | null, terms: string[]): boolean {
  if (!values?.length) return false;
  const normalized = values.map((value) => value.toLowerCase());
  return terms.some((term) => normalized.some((value) => value.includes(term)));
}

export function scoreCarrierOpportunity(
  candidate: CarrierFactoryCandidate,
  scoringVersion = "apex-carrier-opportunity-v1",
  now = new Date(),
): CarrierOpportunityScore {
  const { profile } = candidate;
  const reasons: string[] = [];
  const warnings: string[] = [];
  const whyNow: string[] = [];
  let score = 0;

  const allowedToOperate = known(profile.safety.allowedToOperate);
  const authorityStatus = known(profile.authority.status)?.toLowerCase() ?? null;
  const authorityTypes = known(profile.authority.authorityTypes) ?? [];
  const powerUnits = known(profile.fleet.powerUnits);
  const drivers = known(profile.fleet.drivers);
  const cargoTypes = known(profile.fleet.cargoTypes) ?? [];
  const operatingClassification = known(profile.fleet.operatingClassification) ?? [];
  const phone = known(profile.identity.phone) ?? known(profile.identity.cellPhone);
  const email = known(profile.identity.email);
  const vehicleOosPercent = known(profile.safety.vehicleOosPercent);
  const driverOosPercent = known(profile.safety.driverOosPercent);

  if (allowedToOperate === false) {
    return {
      score: 0,
      tier: "C",
      reasons: [],
      warnings: ["FMCSA evidence indicates the carrier is not currently allowed to operate."],
      whyNow: [],
      scoringVersion,
    };
  }

  if (allowedToOperate === true) {
    score += 18;
    reasons.push("Allowed-to-operate evidence is positive.");
  } else {
    warnings.push("Allowed-to-operate status is not verified.");
  }

  if (authorityStatus && /(active|authorized|granted)/i.test(authorityStatus)) {
    score += 16;
    reasons.push("Operating authority appears active.");
  } else if (authorityStatus && /(revoked|inactive|out of service|not authorized)/i.test(authorityStatus)) {
    score -= 30;
    warnings.push(`Authority status requires review: ${authorityStatus}.`);
  } else {
    warnings.push("Authority status is unknown or ambiguous.");
  }

  if (authorityTypes.length > 0) {
    score += 4;
    reasons.push("Authority type evidence is available.");
  }

  if (typeof powerUnits === "number") {
    if (powerUnits >= 2 && powerUnits <= 100) {
      score += 18;
      reasons.push(`${powerUnits} power units places the carrier in a dispatch-service-friendly operating range.`);
    } else if (powerUnits === 1) {
      score += 12;
      reasons.push("Single-truck carrier can be a high-need dispatch prospect.");
    } else if (powerUnits > 100) {
      score += 8;
      reasons.push("Large active fleet has material freight capacity, though dispatch outsourcing fit needs validation.");
    }
  } else {
    warnings.push("Power-unit count is not verified.");
  }

  if (typeof drivers === "number" && drivers > 0) {
    score += 4;
    reasons.push("Driver count is available and non-zero.");
  }

  if (
    hasAny(cargoTypes, [
      "general freight",
      "refrigerated",
      "fresh produce",
      "building materials",
      "machinery",
      "metal",
      "intermodal",
      "motor vehicles",
    ])
  ) {
    score += 8;
    reasons.push("Cargo profile maps to common dispatchable freight categories.");
  }

  if (hasAny(operatingClassification, ["authorized for hire", "for hire", "interstate"])) {
    score += 6;
    reasons.push("Operating classification suggests commercial dispatch relevance.");
  }

  if (candidate.publicBusinessContactVerified && (phone || email)) {
    score += 12;
    reasons.push("At least one public business contact channel is verified.");
  } else if (phone || email) {
    score += 6;
    reasons.push("A public business contact channel is available.");
  } else {
    warnings.push("No usable public business contact channel is currently available.");
  }

  if (candidate.observedEquipment?.length) {
    score += Math.min(6, 2 + candidate.observedEquipment.length);
    reasons.push(`${candidate.observedEquipment.length} inspection-observed equipment record(s) enrich the dossier.`);
  }

  const sourceAge = ageDays(candidate.sourceUpdatedAt ?? candidate.mcs150UpdatedAt, now);
  if (sourceAge !== null) {
    if (sourceAge <= 7) {
      score += 8;
      whyNow.push("Carrier source data changed within the last 7 days.");
    } else if (sourceAge <= 30) {
      score += 5;
      whyNow.push("Carrier source data changed within the last 30 days.");
    } else if (sourceAge <= 90) {
      score += 2;
    }
  }

  if (candidate.materialChangeKinds?.length) {
    score += Math.min(8, candidate.materialChangeKinds.length * 2);
    whyNow.push(`Material carrier change detected: ${candidate.materialChangeKinds.join(", ")}.`);
  }

  if (typeof vehicleOosPercent === "number" && vehicleOosPercent >= 40) {
    score -= 8;
    warnings.push(`High vehicle out-of-service signal (${vehicleOosPercent}%).`);
  }
  if (typeof driverOosPercent === "number" && driverOosPercent >= 15) {
    score -= 8;
    warnings.push(`High driver out-of-service signal (${driverOosPercent}%).`);
  }

  const finalScore = clamp(score);
  return {
    score: finalScore,
    tier: tierFor(finalScore),
    reasons,
    warnings,
    whyNow,
    scoringVersion,
  };
}
