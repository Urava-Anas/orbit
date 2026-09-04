import type { CarrierFieldEvidence } from "@/lib/carrier-intelligence/contracts";
import {
  DEFAULT_CARRIER_FACTORY_CONFIG,
  type CarrierDeliveryHistory,
  type CarrierFactoryBatch,
  type CarrierFactoryCandidate,
  type CarrierFactoryConfig,
  type CarrierFactoryLead,
  type ApexLeadTier,
} from "@/lib/apex-lead-factory/contracts";
import { scoreCarrierOpportunity } from "@/lib/apex-lead-factory/scoring";

function normalizedUsdot(value: string): string {
  return value.replace(/\D/g, "").replace(/^0+/, "");
}

function evidenceValue<T>(evidence: CarrierFieldEvidence<T> | null | undefined): T | null {
  return evidence?.value ?? null;
}

function stableString(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableString).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${key}:${stableString(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * Fingerprint only fields that are material to re-entry. A new retrieval timestamp
 * alone must never make an old carrier look new to Apex.
 */
export function materialFingerprint(candidate: CarrierFactoryCandidate): string {
  const profile = candidate.profile;
  const payload = {
    usdot: normalizedUsdot(candidate.usdotNumber),
    authorityStatus: evidenceValue(profile.authority.status),
    authorityTypes: evidenceValue(profile.authority.authorityTypes),
    authorityGrantedAt: evidenceValue(profile.authority.grantedAt),
    powerUnits: evidenceValue(profile.fleet.powerUnits),
    drivers: evidenceValue(profile.fleet.drivers),
    trailers: evidenceValue(profile.fleet.trailers),
    equipment: evidenceValue(profile.fleet.equipment),
    cargoTypes: evidenceValue(profile.fleet.cargoTypes),
    operatingClassification: evidenceValue(profile.fleet.operatingClassification),
    phone: evidenceValue(profile.identity.phone),
    cellPhone: evidenceValue(profile.identity.cellPhone),
    email: evidenceValue(profile.identity.email),
    website: evidenceValue(profile.identity.website),
    declaredFleet: candidate.declaredFleet ?? null,
    observedEquipment: (candidate.observedEquipment ?? []).map((vehicle) => ({
      vin: vehicle.vin ?? null,
      vehicleType: vehicle.vehicleType ?? null,
      make: vehicle.make ?? null,
      model: vehicle.model ?? null,
      modelYear: vehicle.modelYear ?? null,
      bodyClass: vehicle.bodyClass ?? null,
      plateState: vehicle.plateState ?? null,
    })),
    mcs150UpdatedAt: candidate.mcs150UpdatedAt ?? null,
  };

  return `v1:${fnv1a(stableString(payload))}`;
}

function sourceAgeDays(candidate: CarrierFactoryCandidate, now: Date): number | null {
  const value = candidate.sourceUpdatedAt ?? candidate.mcs150UpdatedAt;
  if (!value) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.floor((now.getTime() - parsed) / 86_400_000));
}

function compareLeads(a: CarrierFactoryLead, b: CarrierFactoryLead): number {
  if (b.opportunity.score !== a.opportunity.score) {
    return b.opportunity.score - a.opportunity.score;
  }
  return Date.parse(b.sourceUpdatedAt ?? b.discoveredAt) - Date.parse(a.sourceUpdatedAt ?? a.discoveredAt);
}

/**
 * Pure factory core. Discovery/enrichment adapters feed candidates in; persistence
 * writes the returned delivery batch and canonical Lead Engine records.
 */
export function buildCarrierFactoryBatch(
  candidates: CarrierFactoryCandidate[],
  deliveryHistory: CarrierDeliveryHistory[],
  overrides: Partial<CarrierFactoryConfig> = {},
  now = new Date(),
): CarrierFactoryBatch {
  const config: CarrierFactoryConfig = { ...DEFAULT_CARRIER_FACTORY_CONFIG, ...overrides };
  const historyByUsdot = new Map<string, CarrierDeliveryHistory[]>();
  for (const history of deliveryHistory) {
    const key = normalizedUsdot(history.usdotNumber);
    if (!key) continue;
    historyByUsdot.set(key, [...(historyByUsdot.get(key) ?? []), history]);
  }

  const bestCandidateByUsdot = new Map<string, CarrierFactoryLead>();
  const rejected: CarrierFactoryBatch["rejected"] = [];
  let dedupedCandidates = 0;

  for (const candidate of candidates) {
    const usdot = normalizedUsdot(candidate.usdotNumber);
    if (!usdot) {
      rejected.push({ usdotNumber: candidate.usdotNumber, reasons: ["Missing valid USDOT identifier."] });
      continue;
    }

    const fingerprint = materialFingerprint(candidate);
    const previous = historyByUsdot.get(usdot) ?? [];
    const exactPrevious = previous.find((item) => item.materialFingerprint === fingerprint);
    if (exactPrevious) {
      dedupedCandidates += 1;
      rejected.push({
        usdotNumber: usdot,
        reasons: [`Previously delivered with the same material fingerprint at ${exactPrevious.deliveredAt}.`],
      });
      continue;
    }

    const opportunity = scoreCarrierOpportunity(candidate, config.scoringVersion, now);
    if (opportunity.score < config.minimumScore) {
      rejected.push({
        usdotNumber: usdot,
        reasons: [`Opportunity score ${opportunity.score} is below minimum ${config.minimumScore}.`, ...opportunity.warnings],
      });
      continue;
    }

    const age = sourceAgeDays(candidate, now);
    if (age !== null && age > config.maxSourceAgeDays) {
      opportunity.warnings.push(`Primary source evidence is ${age} days old; refresh before outreach.`);
    }

    const latestPrevious = previous
      .slice()
      .sort((a, b) => Date.parse(b.deliveredAt) - Date.parse(a.deliveredAt))[0];

    const lead: CarrierFactoryLead = {
      usdotNumber: usdot,
      profile: candidate.profile,
      declaredFleet: candidate.declaredFleet,
      observedEquipment: candidate.observedEquipment ?? [],
      opportunity,
      discoveredAt: candidate.discoveredAt,
      sourceUpdatedAt: candidate.sourceUpdatedAt,
      mcs150UpdatedAt: candidate.mcs150UpdatedAt,
      materialFingerprint: fingerprint,
      materialChangeKinds: candidate.materialChangeKinds ?? [],
      newToApex: previous.length === 0,
      previouslyDeliveredAt: latestPrevious?.deliveredAt ?? null,
    };

    const current = bestCandidateByUsdot.get(usdot);
    if (!current || compareLeads(lead, current) < 0) {
      if (current) dedupedCandidates += 1;
      bestCandidateByUsdot.set(usdot, lead);
    } else {
      dedupedCandidates += 1;
    }
  }

  const eligible = [...bestCandidateByUsdot.values()].sort(compareLeads);
  const delivered = eligible.slice(0, config.dailyQuota);
  const tierCounts: Record<ApexLeadTier, number> = { A: 0, B: 0, C: 0 };
  for (const lead of delivered) tierCounts[lead.opportunity.tier] += 1;

  return {
    generatedAt: now.toISOString(),
    quota: config.dailyQuota,
    candidatesScanned: candidates.length,
    eligibleCandidates: eligible.length,
    dedupedCandidates,
    delivered,
    rejected,
    tierCounts,
  };
}
