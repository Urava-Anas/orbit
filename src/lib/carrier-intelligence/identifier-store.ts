import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { CarrierRegulatoryIdentifierType } from "./contracts";

export type CarrierIdentifierStatus =
  | "observed"
  | "active"
  | "inactive"
  | "historical"
  | "unknown";

export type RegisterCarrierIdentifierInput = {
  workspaceId: string;
  carrierId: string;
  type: CarrierRegulatoryIdentifierType;
  value: string;
  isPrimary?: boolean;
  status?: CarrierIdentifierStatus;
  sourceName: string;
  sourceReference?: string | null;
  observedAt?: string;
};

function normalizeIdentifierValue(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!/^\d{1,10}$/.test(digits)) {
    throw new Error("Carrier regulatory identifier is invalid.");
  }
  return digits;
}

function adminOrThrow() {
  const admin = createAdminClient();
  if (!admin) {
    throw new Error("Server-side Supabase credentials are required for carrier identifier writes.");
  }
  return admin;
}

/**
 * Register a regulatory identifier without ever heuristically reassigning it.
 * The database uniqueness constraint is workspace + type + value, but this
 * explicit lookup produces a clearer fail-closed identity-collision error.
 */
export async function registerCarrierIdentifier(input: RegisterCarrierIdentifierInput) {
  const admin = adminOrThrow();
  const value = normalizeIdentifierValue(input.value);
  const observedAt = input.observedAt ?? new Date().toISOString();

  const existing = await admin
    .from("apex_carrier_identifiers")
    .select("id,carrier_id,is_primary,status")
    .eq("workspace_id", input.workspaceId)
    .eq("identifier_type", input.type)
    .eq("identifier_value", value)
    .maybeSingle();

  if (existing.error) {
    throw new Error(`Carrier identifier lookup failed: ${existing.error.message}`);
  }

  if (existing.data && existing.data.carrier_id !== input.carrierId) {
    throw new Error(
      `Carrier identifier collision: ${input.type.toUpperCase()} ${value} already belongs to another carrier record. Manual review required.`,
    );
  }

  if (input.isPrimary) {
    const clearPrimary = await admin
      .from("apex_carrier_identifiers")
      .update({ is_primary: false, updated_at: observedAt })
      .eq("workspace_id", input.workspaceId)
      .eq("carrier_id", input.carrierId)
      .eq("identifier_type", input.type)
      .eq("is_primary", true)
      .neq("identifier_value", value);

    if (clearPrimary.error) {
      throw new Error(`Carrier primary-identifier update failed: ${clearPrimary.error.message}`);
    }
  }

  if (existing.data) {
    const updated = await admin
      .from("apex_carrier_identifiers")
      .update({
        is_primary: input.isPrimary ?? existing.data.is_primary,
        status: input.status ?? existing.data.status ?? "observed",
        source_name: input.sourceName,
        source_reference: input.sourceReference ?? null,
        last_seen_at: observedAt,
        updated_at: observedAt,
      })
      .eq("workspace_id", input.workspaceId)
      .eq("id", existing.data.id)
      .select("id")
      .single();

    if (updated.error || !updated.data) {
      throw new Error(`Carrier identifier update failed: ${updated.error?.message ?? "unknown error"}`);
    }

    return { id: String(updated.data.id), created: false };
  }

  const inserted = await admin
    .from("apex_carrier_identifiers")
    .insert({
      workspace_id: input.workspaceId,
      carrier_id: input.carrierId,
      identifier_type: input.type,
      identifier_value: value,
      is_primary: input.isPrimary ?? false,
      status: input.status ?? "observed",
      source_name: input.sourceName,
      source_reference: input.sourceReference ?? null,
      first_seen_at: observedAt,
      last_seen_at: observedAt,
    })
    .select("id")
    .single();

  if (inserted.error || !inserted.data) {
    // A concurrent request may have won the insert. Re-run once through the
    // collision-aware path rather than swallowing a uniqueness conflict.
    if (inserted.error?.code === "23505") {
      return registerCarrierIdentifier(input);
    }
    throw new Error(`Carrier identifier insert failed: ${inserted.error?.message ?? "unknown error"}`);
  }

  return { id: String(inserted.data.id), created: true };
}
