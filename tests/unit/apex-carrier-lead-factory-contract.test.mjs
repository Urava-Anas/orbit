import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

async function source(path) {
  return readFile(join(repoRoot, path), "utf8");
}

test("Apex carrier factory defaults to exactly 1,000 delivery slots", async () => {
  const contracts = await source("src/lib/apex-lead-factory/contracts.ts");
  const factory = await source("src/lib/apex-lead-factory/factory.ts");

  assert.match(contracts, /dailyQuota:\s*1_000/);
  assert.match(factory, /eligible\.slice\(0, config\.dailyQuota\)/);
  assert.match(factory, /candidatesScanned:\s*candidates\.length/);
});

test("unchanged previously delivered USDOT is suppressed before scoring", async () => {
  const factory = await source("src/lib/apex-lead-factory/factory.ts");

  assert.match(factory, /historyByUsdot/);
  assert.match(factory, /materialFingerprint\(candidate\)/);
  assert.match(factory, /item\.materialFingerprint === fingerprint/);
  assert.match(factory, /Previously delivered with the same material fingerprint/);
});

test("material fingerprint ignores retrieval timestamp churn", async () => {
  const factory = await source("src/lib/apex-lead-factory/factory.ts");

  assert.match(factory, /mcs150UpdatedAt/);
  assert.doesNotMatch(factory, /retrievedAt:\s*candidate\./);
  assert.match(factory, /A new retrieval timestamp\s*\n \* alone must never make an old carrier look new/);
});

test("database ledger independently rejects duplicate USDOT material versions", async () => {
  const migration = await source("supabase/migrations/20260904100000_apex_carrier_lead_factory.sql");

  assert.match(migration, /unique \(workspace_id, usdot_number, material_fingerprint\)/);
  assert.match(migration, /apex_carrier_factory_can_deliver/);
  assert.match(migration, /carrier_intelligence\.generate_leads/);
  assert.match(migration, /risk_level\)\s*\nvalues\s*\n\s*\('carrier_intelligence\.generate_leads'[\s\S]*'green'/);
});

test("outbound communication is not added to the factory capability", async () => {
  const migration = await source("supabase/migrations/20260904100000_apex_carrier_lead_factory.sql");
  const factory = await source("src/lib/apex-lead-factory/factory.ts");

  assert.doesNotMatch(migration, /send_email|send_sms|send_outreach/);
  assert.doesNotMatch(factory, /sendEmail|sendSms|sendOutreach|gmail|resend/i);
});

test("declared fleet and observed equipment remain separate dossier concepts", async () => {
  const contracts = await source("src/lib/apex-lead-factory/contracts.ts");

  assert.match(contracts, /DeclaredFleetComposition/);
  assert.match(contracts, /ObservedCarrierVehicle/);
  assert.match(contracts, /observedEquipment/);
  assert.match(contracts, /truckTractors/);
  assert.match(contracts, /straightTrucks/);
  assert.match(contracts, /termLeased/);
  assert.match(contracts, /tripLeased/);
});
