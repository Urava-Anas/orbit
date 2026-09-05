import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { CarrierVettingDecision } from "./contracts";

export interface StoredCarrierSummary {
  legalName: string;
  dotNumber: string | null;
  mcNumber: string | null;
  authorityStatus: string | null;
  insuranceStatus: string | null;
  decision: CarrierVettingDecision;
  lastVerifiedAt: string | null;
  updatedAt: string;
}

type StoredCarrierRow = {
  legal_name: string;
  dot_number: string | null;
  mc_number: string | null;
  authority_status: string | null;
  insurance_status: string | null;
  vetting_decision: CarrierVettingDecision;
  last_verified_at: string | null;
  updated_at: string;
};

/**
 * Read-only recent-carrier projection for the Apex operator surface.
 *
 * The authenticated workspace id is supplied only by the server page. No carrier
 * id or workspace id is returned to the browser, and rendering this list never
 * contacts a public carrier-data source.
 */
export async function listWorkspaceCarrierSummaries(
  workspaceId: string,
  limit = 20,
): Promise<StoredCarrierSummary[]> {
  const admin = createAdminClient();
  if (!admin) {
    throw new Error("Server-side Supabase credentials are required for stored carrier reads.");
  }

  const boundedLimit = Math.min(Math.max(Math.trunc(limit), 1), 50);
  const result = await admin
    .from("apex_carriers")
    .select(
      "legal_name,dot_number,mc_number,authority_status,insurance_status,vetting_decision,last_verified_at,updated_at",
    )
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false })
    .limit(boundedLimit);

  if (result.error) {
    throw new Error(`Stored carrier list read failed: ${result.error.message}`);
  }

  return ((result.data ?? []) as StoredCarrierRow[]).map((row) => ({
    legalName: row.legal_name,
    dotNumber: row.dot_number,
    mcNumber: row.mc_number,
    authorityStatus: row.authority_status,
    insuranceStatus: row.insurance_status,
    decision: row.vetting_decision,
    lastVerifiedAt: row.last_verified_at,
    updatedAt: row.updated_at,
  }));
}
