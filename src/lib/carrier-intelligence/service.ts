import "server-only";

import { normalizeCompanyCensusRecord } from "./company-census";
import { registerCarrierIdentifier } from "./identifier-store";
import {
  parseCarrierLookupIdentifier,
  type CarrierIdentifierKind,
  type CarrierLookupIdentifier,
} from "./identifiers";
import { resolveMotusMcToDot, type MotusMcResolution } from "./motus";
import { persistMotusMcResolution } from "./motus-store";
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

async function resolveRequestedDot(
  identifier: CarrierLookupIdentifier,
): Promise<
  | { status: "resolved"; dotNumber: string; motus: Extract<MotusMcResolution, { status: "resolved" }> | null }
  | { status: "not_found"; message: string }
  | { status: "manual_review"; message: string }
> {
  if (identifier.kind === "dot") {
    return { status: "resolved", dotNumber: identifier.value, motus: null };
  }

  const resolution = await resolveMotusMcToDot(identifier.value);
  if (resolution.status === "not_found") {
    return {
      status: "not_found",
      message: `No modern Motus operating-authority identity was found for ${identifier.canonical}.`,
    };
  }
  if (resolution.status === "invalid_source") {
    return {
      status: "manual_review",
      message: resolution.reason,
    };
  }

  return { status: "resolved", dotNumber: resolution.dotNumber, motus: resolution };
}

/**
 * First end-to-end Carrier Intelligence identity/core vertical slice.
 *
 * USDOT lookups bootstrap from the free Company Census dataset. MC lookups first
 * resolve MC → USDOT through modern Motus, then load Company Census by USDOT.
 * A missing Census row is explicitly NOT treated as proof that a USDOT entity
 * does not exist because FMCSA documents coverage exclusions (including active
 * HMSP entities). Those cases are routed to an alternate official-source path.
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

  let resolved;
  try {
    resolved = await resolveRequestedDot(identifier);
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

  if (resolved.status === "not_found") {
    return { status: "not_found", identifier, message: resolved.message };
  }
  if (resolved.status === "manual_review") {
    return { status: "manual_review", identifier, message: resolved.message };
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
