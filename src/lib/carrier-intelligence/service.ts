import "server-only";

import { normalizeCompanyCensusRecord } from "./company-census";
import {
  parseCarrierLookupIdentifier,
  type CarrierIdentifierKind,
  type CarrierLookupIdentifier,
} from "./identifiers";
import { persistCompanyCensusCarrier } from "./store";
import {
  CarrierPublicSourceError,
  fetchCompanyCensusByDot,
} from "./transportation-data";

export type CarrierCoreLookupOutcome =
  | {
      status: "ok";
      identifier: CarrierLookupIdentifier;
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
      status: "needs_motus_resolution";
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

/**
 * First end-to-end Carrier Intelligence vertical slice.
 *
 * USDOT lookups can bootstrap directly from the free Company Census dataset.
 * MC lookups intentionally stop at a typed state until the modern Motus
 * MC-to-USDOT resolver is implemented. We do not guess or rely only on the first
 * legacy Census docket slot, because doing so can create false "not found"
 * results or bind the wrong carrier.
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
  if (identifier.kind === "mc") {
    return {
      status: "needs_motus_resolution",
      identifier,
      message:
        "MC lookup is waiting for the modern Motus MC-to-USDOT resolver. No carrier identity was guessed.",
    };
  }

  let row;
  try {
    row = await fetchCompanyCensusByDot(identifier.value);
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
      status: "not_found",
      identifier,
      message: `No Company Census carrier was found for ${identifier.canonical}.`,
    };
  }

  const retrievedAt = new Date().toISOString();
  const normalized = normalizeCompanyCensusRecord(row, retrievedAt);
  if (normalized.normalized.dotNumber !== identifier.value) {
    throw new Error(
      `Company Census identity mismatch: requested ${identifier.canonical} but source returned USDOT ${normalized.normalized.dotNumber ?? "unknown"}.`,
    );
  }

  const persisted = await persistCompanyCensusCarrier({
    workspaceId: input.workspaceId,
    leadId: input.leadId ?? null,
    rawRecord: row,
    result: normalized,
  });

  return {
    status: "ok",
    identifier,
    carrierId: persisted.carrierId,
    created: persisted.created,
    sourceRecordInserted: persisted.sourceRecordInserted,
    normalizedFieldsUpdated: persisted.normalizedFieldsUpdated,
    normalized: normalized.normalized,
  };
}
