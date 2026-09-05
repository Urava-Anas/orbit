import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

async function source(path) {
  return readFile(join(repoRoot, path), "utf8");
}

test("carrier preflight keeps manual RED conditions as hard stops", async () => {
  const preflight = await source("src/lib/carrier-intelligence/preflight.ts");

  for (const requiredStop of [
    "carrier_identity_not_verified",
    "suspicious_identity_or_fraud",
    "unresolved_payment_master_data_change",
    "carrier_substitution_requires_human_approval",
    "authority_not_verified_current",
    "regulatory_insurance_not_verified_current",
    "mandatory_credential_expired_missing_or_unknown",
    "hazmat_outside_validated_workflow",
    "oversize_overweight_outside_validated_workflow",
  ]) {
    assert.match(preflight, new RegExp(requiredStop));
  }
});

test("preflight cannot itself approve or book a carrier", async () => {
  const preflight = await source("src/lib/carrier-intelligence/preflight.ts");
  assert.doesNotMatch(preflight, /\.from\(|fetch\(|bookLoad|approveCarrier|sendEmail|sendSms/);
  assert.match(preflight, /does not approve a carrier/i);
});

test("GREEN preflight still preserves downstream Orbit approval gates", async () => {
  const preflight = await source("src/lib/carrier-intelligence/preflight.ts");
  assert.match(preflight, /does not bypass any load-level RED\/AMBER approval gates/i);
});
