import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(new URL("../../src/app/(app)/dashboard/carriers/CarrierLookup.tsx", import.meta.url), "utf8");
const route = await readFile(new URL("../../src/app/api/carriers/lookup/route.ts", import.meta.url), "utf8");

test("Carrier Intelligence UI preserves the human approval boundary", () => {
  assert.match(page, /This screen cannot approve, reject or book a carrier/);
  assert.match(page, /Verify before dispatch/);
  assert.doesNotMatch(page, /approveCarrier|bookCarrier|rejectCarrier/);
});

test("Carrier lookup tenancy remains server-derived", () => {
  assert.match(route, /requireWorkspace\(\)/);
  assert.doesNotMatch(page, /workspaceId/);
  assert.doesNotMatch(page, /carrierId/);
});
