import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

async function source(path) {
  return readFile(join(repoRoot, path), "utf8");
}

test("Motus authority lifecycle does not manufacture original grant dates", async () => {
  const normalizer = await source("src/lib/carrier-intelligence/motus-authority.ts");
  const store = await source("src/lib/carrier-intelligence/motus-regulatory-store.ts");

  assert.match(normalizer, /op_auth_stat_change_date/);
  assert.match(normalizer, /NOT treated[\s\S]{0,80}original grant date/i);
  assert.match(store, /granted_at:\s*null/);
  assert.match(store, /effective_at:\s*fact\.statusChangedAt/);
  assert.doesNotMatch(store, /granted_at:\s*fact\.statusChangedAt/);
});

test("Motus insurance remains regulatory filing evidence rather than a commercial COI", async () => {
  const normalizer = await source("src/lib/carrier-intelligence/motus-insurance.ts");
  const store = await source("src/lib/carrier-intelligence/motus-regulatory-store.ts");

  assert.match(normalizer, /published_active_or_pending/);
  assert.match(normalizer, /MAX_COV_AMOUNT[\s\S]{0,120}not as the carrier's regulatory[\s\S]{0,80}minimum/i);
  assert.match(normalizer, /never treated as a commercial COI/i);
  assert.match(store, /required_amount:\s*null/);
  assert.match(store, /cancellation_at:\s*null/);
  assert.match(store, /Credential Vault/);
});

test("Motus regulatory source payloads are idempotency-gated before fact inserts", async () => {
  const store = await source("src/lib/carrier-intelligence/motus-regulatory-store.ts");

  assert.match(store, /carrierSourcePayloadHash/);
  assert.match(store, /error\.code === "23505"/);
  assert.match(store, /if \(currentInserted && current\.length\)/);
  assert.match(store, /if \(historyInserted && history\.length\)/);
  assert.match(store, /if \(!sourceInserted \|\| !filings\.length\)/);
});

test("Motus source rows must agree with the requested USDOT identity", async () => {
  const authority = await source("src/lib/carrier-intelligence/motus-authority.ts");
  const insurance = await source("src/lib/carrier-intelligence/motus-insurance.ts");

  assert.match(authority, /authority identity mismatch/);
  assert.match(insurance, /insurance identity mismatch/);
  assert.match(authority, /source_invalid_response/);
  assert.match(insurance, /source_invalid_response/);
});
