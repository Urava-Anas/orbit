import type { Carrier360Profile } from "@/lib/carrier-intelligence/contracts";

export type ApexLeadTier = "A" | "B" | "C";

export type MaterialChangeKind =
  | "authority"
  | "fleet"
  | "mcs150"
  | "equipment"
  | "contact"
  | "reactivation";

export interface ObservedCarrierVehicle {
  vin?: string | null;
  vehicleType?: string | null;
  make?: string | null;
  model?: string | null;
  modelYear?: number | null;
  bodyClass?: string | null;
  plateState?: string | null;
  sourceName: string;
  sourceReference?: string | null;
  observedAt?: string | null;
  retrievedAt: string;
  confidence: number;
}

export interface DeclaredFleetComposition {
  straightTrucks?: number | null;
  truckTractors?: number | null;
  trailers?: number | null;
  hazmatCargoTankTrucks?: number | null;
  hazmatCargoTankTrailers?: number | null;
  owned?: Record<string, number>;
  termLeased?: Record<string, number>;
  tripLeased?: Record<string, number>;
}

export interface CarrierFactoryCandidate {
  usdotNumber: string;
  profile: Carrier360Profile;
  discoveredAt: string;
  sourceUpdatedAt?: string | null;
  mcs150UpdatedAt?: string | null;
  declaredFleet?: DeclaredFleetComposition;
  observedEquipment?: ObservedCarrierVehicle[];
  publicBusinessContactVerified?: boolean;
  materialChangeKinds?: MaterialChangeKind[];
}

export interface CarrierOpportunityScore {
  score: number;
  tier: ApexLeadTier;
  reasons: string[];
  warnings: string[];
  whyNow: string[];
  scoringVersion: string;
}

export interface CarrierFactoryLead {
  usdotNumber: string;
  profile: Carrier360Profile;
  declaredFleet?: DeclaredFleetComposition;
  observedEquipment: ObservedCarrierVehicle[];
  opportunity: CarrierOpportunityScore;
  discoveredAt: string;
  sourceUpdatedAt?: string | null;
  mcs150UpdatedAt?: string | null;
  materialFingerprint: string;
  materialChangeKinds: MaterialChangeKind[];
  newToApex: boolean;
  previouslyDeliveredAt?: string | null;
}

export interface CarrierDeliveryHistory {
  usdotNumber: string;
  materialFingerprint: string;
  deliveredAt: string;
}

export interface CarrierFactoryBatch {
  generatedAt: string;
  quota: number;
  candidatesScanned: number;
  eligibleCandidates: number;
  dedupedCandidates: number;
  delivered: CarrierFactoryLead[];
  rejected: Array<{ usdotNumber: string; reasons: string[] }>;
  tierCounts: Record<ApexLeadTier, number>;
}

export interface CarrierFactoryConfig {
  dailyQuota: number;
  minimumScore: number;
  maxSourceAgeDays: number;
  scoringVersion: string;
}

export const DEFAULT_CARRIER_FACTORY_CONFIG: CarrierFactoryConfig = {
  dailyQuota: 1_000,
  minimumScore: 50,
  maxSourceAgeDays: 45,
  scoringVersion: "apex-carrier-opportunity-v1",
};
