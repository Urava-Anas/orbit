import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(new URL("../../src/app/(app)/dashboard/carriers/CarrierLookup.tsx", import.meta.url), "utf8");
const route = await readFile(new URL("../../src/app/api/carriers/lookup/route.ts", import.meta.url), "utf8");

test("Carrier Intelligence UI preserves the human approval boundary", () => {
  assert.match(page, /This screen cannot approve, reject or book a carrier/);
  assert.match(page, /Verify before dispatch/);
  assert.match(page, /Lookup evidence never completes operational preflight/);
  assert.match(page, /Human onboarding and load-level approval remain required/);
  assert.doesNotMatch(page, /approveCarrier|bookCarrier|rejectCarrier/);
});

test("Carrier preflight surfaces hard stops without manufacturing dispatch readiness", () => {
  assert.match(page, /FMCSA operating fact/);
  assert.match(page, /Federal source evidence is a hard stop for dispatch/);
  assert.match(page, /Apex hold\/reject is a hard stop/);
  assert.match(page, /Not established by lookup/);
  assert.doesNotMatch(page, /readyForDispatch|dispatchReady|autoApprove/);
});

test("Carrier lookup tenancy remains server-derived", () => {
  assert.match(route, /requireWorkspace\(\)/);
  assert.doesNotMatch(page, /workspaceId/);
  assert.doesNotMatch(page, /carrierId/);
});
