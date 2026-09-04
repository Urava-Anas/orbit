import "server-only";

import { normalizeCompanyCensusRecord } from "./company-census";
import { registerCarrierIdentifier } from "./identifier-store";
import {
  parseCarrierLookupIdentifier,
  type CarrierIdentifierKind,
  type CarrierLookupIdentifier,
} from "./identifiers";
import { resolveMotusMcToDot, type MotusMcResolution } from "./motus";
import {
  fetchMotusAuthorityHistoryByDot,
  fetchMotusCurrentAuthoritiesByDot,
} from "./motus-authority";
import { fetchMotusInsuranceByDot } from "./motus-insurance";
import {
  persistMotusAuthorityFacts,
  persistMotusInsuranceFacts,
} from "./motus-regulatory-store";
import { persistMotusMcResolution } from "./motus-store";
import { resolveSaferMcToDot, type SaferMcResolution } from "./safer";
import { persistCompanyCensusCarrier } from "./store";
import {
  CarrierPublicSourceError,
  fetchCompanyCensusByDot,
} from "./transportation-data";

export type CarrierCoreLookupOutcome =
  | {
      status: "ok";
      identifier: CarrierLookupIdentifier;
      resolvedDotNumber: string;
      carrierId: string;
      created: boolean;
      sourceRecordInserted: boolean;
      normalizedFieldsUpdated: string[];
      normalized: ReturnType<typeof normalizeCompanyCensusRecord>["normalized"];
    }
  | {
      status: "invalid_input";
      message: string;
    }
  | {
      status: "not_found";
      identifier: CarrierLookupIdentifier;
      message: string;
    }
  | {
      status: "source_gap";
      identifier: CarrierLookupIdentifier;
      resolvedDotNumber: string;
      message: string;
    }
  | {
      status: "manual_review";
      identifier: CarrierLookupIdentifier;
      message: string;
    }
  | {
      status: "source_unavailable";
      identifier: CarrierLookupIdentifier;
      message: string;
    };

export type CarrierCoreLookupInput = {
  workspaceId: string;
  query: string;
  preferredKind?: CarrierIdentifierKind;
  leadId?: string | null;
};

type ResolvedDot = {
  status: "resolved";
  dotNumber: string;
  motus: Extract<MotusMcResolution, { status: "resolved" }> | null;
  safer: Extract<SaferMcResolution, { status: "resolved" }> | null;
};

type DotResolutionFailure =
  | { status: "not_found"; message: string }
  | { status: "manual_review"; message: string }
  | { status: "source_unavailable"; message: string };

async function resolveRequestedDot(
  identifier: CarrierLookupIdentifier,
): Promise<ResolvedDot | DotResolutionFailure> {
  if (identifier.kind === "dot") {
    return { status: "resolved", dotNumber: identifier.value, motus: null, safer: null };
  }

  let motusUnavailable: string | null = null;
  try {
    const resolution = await resolveMotusMcToDot(identifier.value);
    if (resolution.status === "resolved") {
      return {
        status: "resolved",
        dotNumber: resolution.dotNumber,
        motus: resolution,
        safer: null,
      };
    }
    if (resolution.status === "invalid_source") {
      return { status: "manual_review", message: resolution.reason };
    }
  } catch (error) {
    if (error instanceof CarrierPublicSourceError) {
      motusUnavailable = error.message;
    } else {
      throw error;
    }
  }

  // SAFER is a narrowly scoped identity fallback, not the primary data model.
  // It prevents a temporary/open-data lookup issue from making MC search useless.
  try {
    const safer = await resolveSaferMcToDot(identifier.value);
    if (safer.status === "resolved") {
      return {
        status: "resolved",
        dotNumber: safer.dotNumber,
        motus: null,
        safer,
      };
    }
    if (safer.status === "invalid_source") {
      return { status: "manual_review", message: safer.reason };
    }
  } catch (error) {
    if (error instanceof CarrierPublicSourceError) {
      return {
        status: "source_unavailable",
        message: [motusUnavailable, error.message].filter(Boolean).join(" SAFER fallback: "),
      };
    }
    throw error;
  }

  if (motusUnavailable) {
    return {
      status: "source_unavailable",
      message:
        `${motusUnavailable} SAFER fallback did not resolve ${identifier.canonical}; ` +
        "the lookup is inconclusive rather than a verified not-found result.",
    };
  }

  return {
    status: "not_found",
    message: `Neither modern Motus nor SAFER resolved ${identifier.canonical} to a USDOT entity.`,
  };
}

/**
 * Best-effort regulatory bootstrap for Carrier 360. Identity/core persistence is
 * still useful when one regulatory publication is temporarily unavailable, so
 * authority and insurance source outages stay explicit as missing evidence
 * rather than causing the carrier itself to disappear from the pipeline.
 */
async function bootstrapMotusRegulatoryFacts(input: {
  workspaceId: string;
  carrierId: string;
  dotNumber: string;
  retrievedAt: string;
}) {
  const [currentAuthorityResult, authorityHistoryResult, insuranceResult] = await Promise.allSettled([
    fetchMotusCurrentAuthoritiesByDot(input.dotNumber),
    fetchMotusAuthorityHistoryByDot(input.dotNumber),
    fetchMotusInsuranceByDot(input.dotNumber),
  ]);

  const currentAuthority =
    currentAuthorityResult.status === "fulfilled" ? currentAuthorityResult.value : [];
  const authorityHistory =
    authorityHistoryResult.status === "fulfilled" ? authorityHistoryResult.value : [];
  const insurance = insuranceResult.status === "fulfilled" ? insuranceResult.value : [];

  if (currentAuthorityResult.status === "fulfilled" || authorityHistoryResult.status === "fulfilled") {
    await persistMotusAuthorityFacts({
      workspaceId: input.workspaceId,
      carrierId: input.carrierId,
      dotNumber: input.dotNumber,
      current: currentAuthority,
      history: authorityHistory,
      retrievedAt: input.retrievedAt,
    });
  } else {
    console.error("Carrier Intelligence authority bootstrap unavailable", {
      dotNumber: input.dotNumber,
      currentAuthorityError:
        currentAuthorityResult.reason instanceof Error
          ? currentAuthorityResult.reason.message
          : "unknown source error",
      authorityHistoryError:
        authorityHistoryResult.reason instanceof Error
          ? authorityHistoryResult.reason.message
          : "unknown source error",
    });
  }

  if (insuranceResult.status === "fulfilled") {
    await persistMotusInsuranceFacts({
      workspaceId: input.workspaceId,
      carrierId: input.carrierId,
      dotNumber: input.dotNumber,
      filings: insurance,
      retrievedAt: input.retrievedAt,
    });
  } else {
    console.error("Carrier Intelligence insurance bootstrap unavailable", {
      dotNumber: input.dotNumber,
      error: insuranceResult.reason instanceof Error ? insuranceResult.reason.message : "unknown source error",
    });
  }
}

/**
 * First end-to-end Carrier Intelligence identity/core vertical slice.
 *
 * USDOT lookups bootstrap from the free Company Census dataset. MC lookups first
 * resolve MC → USDOT through modern Motus with a narrow SAFER identity fallback,
 * then load Company Census by USDOT. A missing Census row is explicitly NOT
 * treated as proof that a USDOT entity does not exist because FMCSA documents
 * coverage exclusions (including active HMSP entities).
 *
 * Once identity/core data is persisted, bounded Motus current authority,
 * authority-history and active/pending insurance publications are bootstrapped
 * into Carrier 360 as provenance-bearing regulatory evidence. Their temporary
 * failure does not fabricate a negative fact or erase the valid Census carrier.
 *
 * Callers must supply workspaceId from authenticated Orbit workspace context.
 */
export async function lookupAndPersistCarrierCore(
  input: CarrierCoreLookupInput,
): Promise<CarrierCoreLookupOutcome> {
  const parsed = parseCarrierLookupIdentifier(input.query, input.preferredKind);
  if (!parsed.ok) {
    return { status: "invalid_input", message: parsed.message };
  }

  const identifier = parsed.identifier;
  const resolved = await resolveRequestedDot(identifier);

  if (resolved.status === "not_found") {
    return { status: "not_found", identifier, message: resolved.message };
  }
  if (resolved.status === "manual_review") {
    return { status: "manual_review", identifier, message: resolved.message };
  }
  if (resolved.status === "source_unavailable") {
    return { status: "source_unavailable", identifier, message: resolved.message };
  }

  let row;
  try {
    row = await fetchCompanyCensusByDot(resolved.dotNumber);
  } catch (error) {
    if (error instanceof CarrierPublicSourceError) {
      return {
        status: "source_unavailable",
        identifier,
        message: error.message,
      };
    }
    throw error;
  }

  if (!row) {
    return {
      status: "source_gap",
      identifier,
      resolvedDotNumber: resolved.dotNumber,
      message:
        `USDOT ${resolved.dotNumber} is not present in Company Census. ` +
        "This is not treated as a carrier-not-found result because FMCSA documents intentional Company Census coverage exclusions. Continue with SAFER/HMSP and other approved official fallback sources.",
    };
  }

  const retrievedAt = new Date().toISOString();
  const normalized = normalizeCompanyCensusRecord(row, retrievedAt);
  if (normalized.normalized.dotNumber !== resolved.dotNumber) {
    throw new Error(
      `Company Census identity mismatch: requested USDOT ${resolved.dotNumber} but source returned USDOT ${normalized.normalized.dotNumber ?? "unknown"}.`,
    );
  }

  const persisted = await persistCompanyCensusCarrier({
    workspaceId: input.workspaceId,
    leadId: input.leadId ?? null,
    rawRecord: row,
    result: normalized,
  });

  await registerCarrierIdentifier({
    workspaceId: input.workspaceId,
    carrierId: persisted.carrierId,
    type: "usdot",
    value: resolved.dotNumber,
    isPrimary: true,
    status: "observed",
    sourceName: "FMCSA Company Census File",
    sourceReference: `USDOT ${resolved.dotNumber}`,
    observedAt: retrievedAt,
  });

  // The Census docket slot is useful observed evidence but it is not treated as
  // the complete MC list. Modern Motus remains canonical for docket resolution.
  if (normalized.normalized.mcNumber) {
    await registerCarrierIdentifier({
      workspaceId: input.workspaceId,
      carrierId: persisted.carrierId,
      type: "mc",
      value: normalized.normalized.mcNumber,
      isPrimary: false,
      status: "observed",
      sourceName: "FMCSA Company Census File",
      sourceReference: `USDOT ${resolved.dotNumber} · docket1`,
      observedAt: retrievedAt,
    });
  }

  if (resolved.motus) {
    await persistMotusMcResolution({
      workspaceId: input.workspaceId,
      carrierId: persisted.carrierId,
      resolution: resolved.motus,
      retrievedAt,
    });
  }

  if (resolved.safer) {
    await registerCarrierIdentifier({
      workspaceId: input.workspaceId,
      carrierId: persisted.carrierId,
      type: "mc",
      value: resolved.safer.mcNumber,
      isPrimary: false,
      status: "observed",
      sourceName: "FMCSA SAFER Company Snapshot",
      sourceReference: resolved.safer.sourceReference,
      observedAt: retrievedAt,
    });
  }

  await bootstrapMotusRegulatoryFacts({
    workspaceId: input.workspaceId,
    carrierId: persisted.carrierId,
    dotNumber: resolved.dotNumber,
    retrievedAt,
  });

  return {
    status: "ok",
    identifier,
    resolvedDotNumber: resolved.dotNumber,
    carrierId: persisted.carrierId,
    created: persisted.created,
    sourceRecordInserted: persisted.sourceRecordInserted,
    normalizedFieldsUpdated: persisted.normalizedFieldsUpdated,
    normalized: normalized.normalized,
  };
}
