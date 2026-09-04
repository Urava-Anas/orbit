import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

function loadTs(path, dependencies = {}) {
  const source = readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const exports = {};
  runInNewContext(outputText, {
    exports, Date, Map, Set, console,
    require(name) {
      if (name === "server-only") return {};
      if (Object.hasOwn(dependencies, name)) return dependencies[name];
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  return exports;
}

const { scoreCarrierOpportunity } = loadTs("src/lib/apex-lead-factory/scoring.ts");
const contracts = loadTs("src/lib/apex-lead-factory/contracts.ts");
const evidence = (value) => ({ value, verificationState: "verified" });
function candidate(status = "active") {
  return {
    usdotNumber: "12345", discoveryOperatingStatus: "active",
    discoveredAt: "2026-09-04T00:00:00Z", sourceUpdatedAt: "2026-09-04T00:00:00Z",
    publicBusinessContactVerified: true,
    profile: {
      safety: { allowedToOperate: evidence(true) },
      authority: { status: evidence(status), authorityTypes: evidence(["property"]) },
      fleet: { powerUnits: evidence(10), drivers: evidence(10), cargoTypes: evidence(["general freight"]), operatingClassification: evidence(["for hire"]) },
      identity: { phone: evidence("2025550100") },
    },
  };
}

test("negative authority evidence cannot score as active even on an otherwise strong carrier", () => {
  for (const status of ["inactive", "not authorized", "unauthorized", "revoked", "active / revoked", "out-of-service", "not granted"]) {
    const result = scoreCarrierOpportunity(candidate(status), undefined, new Date("2026-09-04"));
    assert.equal(result.score, 0, status);
    assert.match(result.warnings.join(" "), /hard stop/);
  }
  assert.ok(scoreCarrierOpportunity(candidate(), undefined, new Date("2026-09-04")).score >= 80);
});

test("ambiguous pending authority receives no active-authority points", () => {
  const result = scoreCarrierOpportunity(candidate("pending - not yet granted"), undefined, new Date("2026-09-04"));
  assert.ok(!result.reasons.includes("Operating authority appears active."));
});

function runnerHarness({ lookupStatus = "ok", loseLease = false, terminal = false, releaseError = null, authority = "active" } = {}) {
  const original = {
    id: "work-1", workspace_id: "workspace-1", batch_id: "batch-1", usdot_number: "12345",
    attempts: terminal ? 4 : 1, max_attempts: 4, status: "enriching",
    locked_by: "worker-old", locked_at: "2026-09-04T00:00:00Z", candidate_payload: candidate(),
  };
  const stored = { ...original };
  let settlements = 0;
  let claims = 0;
  const admin = {
    async rpc(name) {
      if (name === "release_stale_apex_carrier_factory_work") return { error: releaseError };
      if (name === "claim_apex_carrier_factory_work") { claims++; return { data: [{ ...original }], error: null }; }
      throw new Error(`Unexpected RPC ${name}`);
    },
    from(table) {
      const filters = [];
      let values;
      const query = {
        update(v) { values = v; return query; },
        eq(k, v) { filters.push([k, v]); return query; },
        select() { return query; },
        limit() { return query; },
        async maybeSingle() {
          if (table !== "apex_carrier_factory_work_items") return { data: null, error: null };
          if (!filters.every(([key, value]) => stored[key] === value)) return { data: null, error: null };
          Object.assign(stored, values); settlements++;
          return { data: { id: stored.id }, error: null };
        },
      };
      return query;
    },
  };
  const runner = loadTs("src/lib/apex-lead-factory/runner.ts", {
    "@/lib/supabase/admin": { createAdminClient: () => admin },
    "@/lib/carrier-intelligence/service": { async lookupAndPersistCarrierCore() {
      if (loseLease) Object.assign(stored, { locked_by: "worker-new", attempts: original.attempts + 1, locked_at: "2026-09-04T00:20:00Z" });
      return { status: lookupStatus, carrierId: "carrier-1", message: "source result" };
    } },
    "@/lib/carrier-intelligence/read": { loadCarrier360Profile: async () => candidate(authority).profile },
    "@/lib/apex-lead-factory/contracts": contracts,
    "@/lib/apex-lead-factory/discovery": {},
    "@/lib/apex-lead-factory/equipment": { fetchObservedEquipmentForCarriers: async () => [] },
    "@/lib/apex-lead-factory/factory": { materialFingerprint: () => "v1:test" },
    "@/lib/apex-lead-factory/scoring": { scoreCarrierOpportunity },
  });
  return { runner, stored, settlements: () => settlements, claims: () => claims };
}

for (const lookupStatus of ["ok", "not_found", "source_unavailable"]) {
  test(`stale worker cannot overwrite a newer lease after ${lookupStatus}`, async () => {
    const h = runnerHarness({ lookupStatus, loseLease: true });
    const result = await h.runner.processCarrierFactoryWork("workspace-1", "batch-1", "worker-old", 1);
    assert.equal(h.settlements(), 0);
    assert.equal(h.stored.locked_by, "worker-new");
    assert.equal(h.stored.status, "enriching");
    assert.equal(result.leaseLost, 1);
    assert.equal(result.ready + result.rejected + result.retried + result.failed, 0);
  });
}

test("current lease settles ready, retries outages and stops at the retry limit", async () => {
  for (const [options, expected] of [[{}, "ready"], [{ lookupStatus: "source_unavailable" }, "queued"], [{ lookupStatus: "source_unavailable", terminal: true }, "failed"], [{ authority: "inactive" }, "rejected"]]) {
    const h = runnerHarness(options);
    const result = await h.runner.processCarrierFactoryWork("workspace-1", "batch-1", "worker-old", 1);
    assert.equal(h.stored.status, expected);
    assert.equal(h.stored.locked_by, null);
    assert.equal(h.settlements(), 1);
    assert.equal(result.leaseLost, 0);
    assert.equal(result.ready + result.rejected + result.retried + result.failed, 1);
  }
});

test("stale-lease release errors stop processing before claiming more work", async () => {
  const h = runnerHarness({ releaseError: { message: "database unavailable" } });
  await assert.rejects(h.runner.processCarrierFactoryWork("workspace-1", "batch-1", "worker-old", 1), /stale-lease release failed/);
  assert.equal(h.claims(), 0);
});

test("finalization returns database delivery evidence and propagates transaction errors", async () => {
  const h = runnerHarness();
  // The dedicated finalizer fixture permits only its single transactional RPC.
  let response = { data: { status: "waiting_for_more_ready", quota: 1000, ready: 998, delivered: 1, tierCounts: { A: 1, B: 0, C: 0 } }, error: null };
  const runner = loadTs("src/lib/apex-lead-factory/runner.ts", {
    "@/lib/supabase/admin": { createAdminClient: () => ({ rpc: async (name, args) => {
      assert.equal(name, "finalize_apex_carrier_factory_batch");
      assert.equal(args.p_workspace_id, "workspace-1");
      assert.equal(args.p_batch_id, "batch-1");
      return response;
    } }) },
    "@/lib/carrier-intelligence/service": {}, "@/lib/carrier-intelligence/read": {},
    "@/lib/apex-lead-factory/contracts": contracts, "@/lib/apex-lead-factory/discovery": {},
    "@/lib/apex-lead-factory/equipment": {}, "@/lib/apex-lead-factory/factory": {},
    "@/lib/apex-lead-factory/scoring": {},
  });
  assert.equal((await runner.finalizeCarrierFactoryBatch("workspace-1", "batch-1")).delivered, 1);
  response = { data: null, error: { message: "transaction rolled back" } };
  await assert.rejects(runner.finalizeCarrierFactoryBatch("workspace-1", "batch-1"), /transaction rolled back/);
  assert.equal(h.settlements(), 0);
});
