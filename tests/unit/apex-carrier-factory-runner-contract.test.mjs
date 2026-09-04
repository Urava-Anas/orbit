import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

async function source(path) {
  return readFile(join(repoRoot, path), "utf8");
}

test("factory uses a resumable work queue instead of one giant 1,000-carrier request", async () => {
  const migration = await source("supabase/migrations/20260904101500_apex_carrier_factory_work_queue.sql");
  const runner = await source("src/lib/apex-lead-factory/runner.ts");

  assert.match(migration, /for update skip locked/i);
  assert.match(migration, /attempts/);
  assert.match(migration, /max_attempts/);
  assert.match(migration, /release_stale_apex_carrier_factory_work/);
  assert.match(runner, /processCarrierFactoryWork/);
  assert.match(runner, /boundedLimit/);
});

test("daily batch is not called complete until the full requested quota is ready", async () => {
  const runner = await source("src/lib/apex-lead-factory/runner.ts");

  assert.match(runner, /if \(ready\.length < quota\)/);
  assert.match(runner, /waiting_for_more_ready/);
  assert.match(runner, /delivered_count: quota/);
});

test("observed truck evidence comes from public FMCSA inspection files and VIN decoding", async () => {
  const equipment = await source("src/lib/apex-lead-factory/equipment.ts");

  assert.match(equipment, /fx4q-ay7w/);
  assert.match(equipment, /wt8s-2hbx/);
  assert.match(equipment, /DecodeVINValuesBatch/);
  assert.match(equipment, /Truck Tractor/);
  assert.match(equipment, /Straight Truck/);
  assert.match(equipment, /Semi Trailer/);
  assert.match(equipment, /not a complete declared fleet/i);
});

test("factory remains internal intelligence only and has no outbound send path", async () => {
  const route = await source("src/app/api/apex/carrier-factory/route.ts");
  const runner = await source("src/lib/apex-lead-factory/runner.ts");
  const combined = `${route}\n${runner}`;

  assert.doesNotMatch(combined, /sendEmail|sendSms|sendOutreach|gmail|resend/i);
  assert.match(route, /owner.*admin/i);
});
