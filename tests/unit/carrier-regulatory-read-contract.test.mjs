import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

async function source(path) {
  return readFile(join(repoRoot, path), "utf8");
}

test("Carrier 360 regulatory rendering reads stored tables and never calls public sources", async () => {
  const read = await source("src/lib/carrier-intelligence/read.ts");

  assert.match(read, /\.from\("apex_carrier_authorities"\)/);
  assert.match(read, /\.from\("apex_carrier_insurance_filings"\)/);
  assert.doesNotMatch(read, /fetchTransportationDatasetRows|fetchMotus|resolveMotus|resolveSafer/);
});

test("multiple Motus insurance filings remain a filing set instead of one arbitrary policy", async () => {
  const contract = await source("src/lib/carrier-intelligence/contracts.ts");
  const read = await source("src/lib/carrier-intelligence/read.ts");

  assert.match(contract, /filings\?: CarrierFieldEvidence<Record<string, unknown>\[]>/);
  assert.match(contract, /must never arbitrarily choose/);
  assert.match(read, /insuranceFilingSet/);
  assert.match(read, /insuranceFilings\.length === 1 \? insuranceFilings\[0\] : null/);
  assert.match(read, /filings: officialEvidence/);
});

test("missing regulatory source dates stay missing rather than becoming retrieval dates", async () => {
  const read = await source("src/lib/carrier-intelligence/read.ts");

  assert.match(read, /function maxOptionalTimestamp/);
  assert.match(read, /authoritySourceDate = maxOptionalTimestamp/);
  assert.match(read, /insuranceSourceDate = maxOptionalTimestamp/);
  assert.doesNotMatch(read, /authoritySourceDate\s*=\s*maxTimestamp/);
  assert.doesNotMatch(read, /insuranceSourceDate\s*=\s*maxTimestamp/);
});

test("mixed current regulatory states are explicitly derived rather than source-verified labels", async () => {
  const read = await source("src/lib/carrier-intelligence/read.ts");

  assert.match(read, /authorityStatuses\.length > 1 \? "derived" : "verified"/);
  assert.match(read, /insuranceStatuses\.length > 1 \? "derived" : "verified"/);
  assert.match(read, /Derived from FMCSA Motus Carrier/);
  assert.match(read, /Derived from FMCSA Motus Insur/);
});
