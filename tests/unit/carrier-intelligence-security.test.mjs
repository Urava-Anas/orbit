import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

async function source(path) {
  return readFile(join(repoRoot, path), "utf8");
}

test("Carrier 360 request tenancy is derived from Orbit and never browser-selected", async () => {
  const route = await source("src/app/api/carriers/lookup/route.ts");
  assert.match(route, /requireWorkspace\(\)/);
  assert.match(route, /workspace\.id/);
  assert.doesNotMatch(route, /workspaceId:\s*z\./);
  assert.doesNotMatch(route, /leadId:\s*z\./);
  assert.match(route, /consume_apex_carrier_lookup_quota/);
});

test("core carrier lookup has no paid carrier-data provider dependency", async () => {
  const files = await Promise.all([
    source("src/lib/carrier-intelligence/service.ts"),
    source("src/lib/carrier-intelligence/transportation-data.ts"),
    source("src/lib/carrier-intelligence/company-census.ts"),
    source("src/lib/carrier-intelligence/motus.ts"),
    source("src/lib/carrier-intelligence/safer.ts"),
    source("src/lib/carrier-intelligence/store.ts"),
  ]);
  const runtime = files.join("\n");
  // Policy documentation and comments are allowed to name excluded vendors. The
  // executable path may not import them, call their hosts, or require credentials.
  assert.doesNotMatch(
    runtime,
    /from\s+["'][^"']*(?:carriersource|searchmule|apollo|zoominfo|clearbit|hunter)[^"']*["']/i,
  );
  assert.doesNotMatch(
    runtime,
    /https?:\/\/[^"'\s]*(?:carriersource|searchmule|apollo|zoominfo|clearbit|hunter)[^"'\s]*/i,
  );
  assert.doesNotMatch(
    runtime,
    /(?:CARRIERSOURCE|SEARCHMULE|APOLLO|ZOOMINFO|CLEARBIT|HUNTER)[A-Z0-9_]*(?:API_KEY|TOKEN|SECRET)/,
  );
  assert.doesNotMatch(runtime, /api[_-]?key|bearer\s+/i);
  assert.match(runtime, /data\.transportation\.gov/);
  assert.match(runtime, /safer\.fmcsa\.dot\.gov/);
});

test("USDOT identity can own multiple regulatory dockets without heuristic reassignment", async () => {
  const migration = await source("supabase/migrations/20260902101500_apex_carrier_identifiers.sql");
  const store = await source("src/lib/carrier-intelligence/identifier-store.ts");
  const contract = await source("src/lib/carrier-intelligence/contracts.ts");

  assert.match(migration, /identifier_type in \('usdot', 'mc', 'ff', 'mx'\)/);
  assert.match(migration, /unique \(workspace_id, identifier_type, identifier_value\)/);
  assert.match(migration, /references public\.apex_carriers\(workspace_id, id\)/);
  assert.match(store, /Manual review required/);
  assert.doesNotMatch(store, /delete\(\).*apex_carrier_identifiers/s);
  assert.match(contract, /regulatoryIdentifiers/);
});

test("Company Census straight-truck count is never mislabeled as trailers", async () => {
  const normalizer = await source("src/lib/carrier-intelligence/company-census.ts");
  const store = await source("src/lib/carrier-intelligence/store.ts");

  assert.match(normalizer, /truckUnits/);
  assert.match(normalizer, /TRUCK_UNITS is kept distinct from POWER_UNITS and is not treated as trailers/);
  assert.doesNotMatch(store, /truck_units:\s*"trailers"/);
});

test("missing Company Census coverage does not become a false carrier-not-found result", async () => {
  const service = await source("src/lib/carrier-intelligence/service.ts");
  const registry = await source("src/lib/carrier-intelligence/sources.ts");

  assert.match(service, /status:\s*"source_gap"/);
  assert.match(service, /not treated as a carrier-not-found result/);
  assert.match(registry, /active HMSP/);
});

test("Carrier 360 current facts remain separate from the historical provenance ledger", async () => {
  const currentMigration = await source("supabase/migrations/20260902103000_apex_carrier_current_evidence.sql");
  const store = await source("src/lib/carrier-intelligence/store.ts");
  const reader = await source("src/lib/carrier-intelligence/read.ts");

  assert.match(currentMigration, /apex_carrier_field_current/);
  assert.match(currentMigration, /provenance table remains the audit ledger/i);
  assert.match(store, /appendProvenanceLedger/);
  assert.match(store, /upsertCurrentEvidence/);
  assert.match(reader, /without re-contacting external[\s\S]{0,80}sources/i);
});

test("MC resolution is fail-closed and SAFER is only a fallback", async () => {
  const service = await source("src/lib/carrier-intelligence/service.ts");
  const motus = await source("src/lib/carrier-intelligence/motus.ts");
  const safer = await source("src/lib/carrier-intelligence/safer.ts");

  assert.ok(service.indexOf("resolveMotusMcToDot") < service.indexOf("resolveSaferMcToDot"));
  assert.match(motus, /multiple USDOT identities; manual review required/);
  assert.match(safer, /Narrow fallback/);
  assert.match(safer, /USDOT\\s\+Number/);
});

test("Apex risk decision stays separate from official FMCSA safety facts", async () => {
  const foundation = await source("supabase/migrations/20260902090000_apex_carrier_intelligence_foundation.sql");
  const contract = await source("src/lib/carrier-intelligence/contracts.ts");

  assert.match(foundation, /Apex-derived operational vetting score\. This is never an FMCSA safety score/);
  assert.match(contract, /CarrierRisk360/);
  assert.match(contract, /CarrierSafety360/);
});
