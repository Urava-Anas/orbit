export type CarrierSourceAccessMode =
  | "bulk_download"
  | "daily_delta"
  | "public_verification";

export interface CarrierSourceDefinition {
  key: string;
  name: string;
  owner: "FMCSA" | "UCR";
  authoritative: boolean;
  paidDependency: false;
  accessMode: CarrierSourceAccessMode;
  cadence: "daily" | "monthly" | "on_demand";
  datasetId?: string;
  notes: string;
  coverageLimitations?: readonly string[];
}

/**
 * Core source registry for Orbit Carrier Intelligence.
 *
 * Dataset IDs are the public DOT Data Portal identifiers. The ingestion layer
 * should prefer cached bulk/delta downloads and avoid per-carrier fan-out when a
 * single source file can satisfy the same work.
 */
export const FREE_CARRIER_SOURCE_REGISTRY = {
  fmcsa_company_census: {
    key: "fmcsa_company_census",
    name: "FMCSA Company Census File",
    owner: "FMCSA",
    authoritative: true,
    paidDependency: false,
    accessMode: "bulk_download",
    cadence: "daily",
    datasetId: "az4n-8mr2",
    notes:
      "Primary USDOT entity identity, business operations, equipment and driver source. Daily from roughly 24-hour-old source data; not real-time.",
    coverageLimitations: [
      "Does not include shipper-only business types.",
      "FMCSA states entities with an active HMSP on file at FMCSA/PHMSA are excluded from this file.",
      "A missing Company Census row is therefore not sufficient evidence that a USDOT entity does not exist.",
    ],
  },
  fmcsa_motus_carrier_history: {
    key: "fmcsa_motus_carrier_history",
    name: "Motus Carrier - All With History",
    owner: "FMCSA",
    authoritative: true,
    paidDependency: false,
    accessMode: "bulk_download",
    cadence: "daily",
    datasetId: "inys-ebih",
    notes:
      "Modern operating-authority baseline/history keyed by USDOT and docket number. One USDOT entity may have multiple operating-authority dockets.",
  },
  fmcsa_motus_authority_history: {
    key: "fmcsa_motus_authority_history",
    name: "Motus AuthHist - All With History",
    owner: "FMCSA",
    authoritative: true,
    paidDependency: false,
    accessMode: "bulk_download",
    cadence: "daily",
    datasetId: "yu5v-wbh6",
    notes: "Modern authority status/type lifecycle history.",
  },
  fmcsa_motus_insurance_history: {
    key: "fmcsa_motus_insurance_history",
    name: "Motus Insur - All With History",
    owner: "FMCSA",
    authoritative: true,
    paidDependency: false,
    accessMode: "bulk_download",
    cadence: "daily",
    datasetId: "c5y8-a4uz",
    notes:
      "Active/pending modern insurance filings and liability coverage fields. Does not replace broker-specific COI verification.",
  },
  fmcsa_motus_carrier_delta: {
    key: "fmcsa_motus_carrier_delta",
    name: "Motus Carrier Daily Difference",
    owner: "FMCSA",
    authoritative: true,
    paidDependency: false,
    accessMode: "daily_delta",
    cadence: "daily",
    datasetId: "nakq-58th",
    notes: "New and changed carrier/authority records from the recent update cycle.",
  },
  fmcsa_motus_authority_delta: {
    key: "fmcsa_motus_authority_delta",
    name: "Motus AuthHist Daily Difference",
    owner: "FMCSA",
    authoritative: true,
    paidDependency: false,
    accessMode: "daily_delta",
    cadence: "daily",
    datasetId: "dm5j-zc6c",
    notes: "Recent authority status/type changes.",
  },
  fmcsa_motus_insurance_delta: {
    key: "fmcsa_motus_insurance_delta",
    name: "Motus Insur Daily Difference",
    owner: "FMCSA",
    authoritative: true,
    paidDependency: false,
    accessMode: "daily_delta",
    cadence: "daily",
    datasetId: "x96h-evps",
    notes: "Recent active/pending insurance filing changes.",
  },
  fmcsa_motus_revoke_suspend_delta: {
    key: "fmcsa_motus_revoke_suspend_delta",
    name: "Motus RevokeSuspend Daily Difference",
    owner: "FMCSA",
    authoritative: true,
    paidDependency: false,
    accessMode: "daily_delta",
    cadence: "daily",
    datasetId: "e67p-xyd5",
    notes: "Recent operating-authority suspension/revocation actions.",
  },
  fmcsa_safer_snapshot: {
    key: "fmcsa_safer_snapshot",
    name: "FMCSA SAFER Company Snapshot",
    owner: "FMCSA",
    authoritative: true,
    paidDependency: false,
    accessMode: "public_verification",
    cadence: "on_demand",
    notes:
      "Verification/fallback surface, including cases where Company Census coverage is intentionally incomplete. Not the primary national ingestion store.",
  },
  fmcsa_hmsp: {
    key: "fmcsa_hmsp",
    name: "FMCSA Hazardous Materials Safety Permit verification",
    owner: "FMCSA",
    authoritative: true,
    paidDependency: false,
    accessMode: "public_verification",
    cadence: "on_demand",
    notes:
      "HMSP is distinct from a carrier declaring hazmat operations or having hazmat inspections. Company Census coverage can exclude active HMSP entities, so HMSP-aware lookup is mandatory.",
  },
  ucr_public: {
    key: "ucr_public",
    name: "Unified Carrier Registration public verification",
    owner: "UCR",
    authoritative: true,
    paidDependency: false,
    accessMode: "public_verification",
    cadence: "on_demand",
    notes:
      "Credential verification only. Cache verified year/status/evidence rather than making UCR a brittle runtime dependency.",
  },
} as const satisfies Record<string, CarrierSourceDefinition>;

export type FreeCarrierSourceKey = keyof typeof FREE_CARRIER_SOURCE_REGISTRY;

/**
 * These providers may still be referenced historically or manually by a user,
 * but Orbit Carrier Intelligence must not require them to construct the core
 * Carrier 360 dossier or the daily carrier-lead pipeline.
 */
export const NON_CORE_PAID_CARRIER_PROVIDERS = new Set([
  "carrier_source",
  "carriersource",
  "searchmule",
  "paid_dot_api",
  "paid_fmcsa_wrapper",
  "apollo",
  "zoominfo",
  "clearbit",
  "hunter",
  "paid_serp_api",
]);

export function normalizeProviderKey(providerKey: string): string {
  return providerKey.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

/**
 * Hard guard for the zero-paid-data core path. A future tenant can build an
 * optional enrichment connector separately, but it cannot silently become a
 * required Carrier 360 dependency.
 */
export function assertZeroPaidCarrierCoreSource(providerKey: string): void {
  const normalized = normalizeProviderKey(providerKey);
  if (NON_CORE_PAID_CARRIER_PROVIDERS.has(normalized)) {
    throw new Error(
      `Paid carrier-data provider "${providerKey}" is not permitted in the Carrier Intelligence core path.`,
    );
  }
}
