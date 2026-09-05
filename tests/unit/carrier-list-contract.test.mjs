import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

async function source(path) {
  return readFile(join(repoRoot, path), "utf8");
}

test("stored carrier summaries stay workspace scoped and read only", async () => {
  const list = await source("src/lib/carrier-intelligence/list.ts");

  assert.match(list, /\.from\("apex_carriers"\)/);
  assert.match(list, /\.eq\("workspace_id", workspaceId\)/);
  assert.match(list, /\.limit\(boundedLimit\)/);
  assert.doesNotMatch(list, /\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
});

test("stored carrier list never refreshes external carrier sources", async () => {
  const list = await source("src/lib/carrier-intelligence/list.ts");
  const page = await source("src/app/(app)/dashboard/carriers/page.tsx");

  assert.doesNotMatch(list, /fetchTransportationDatasetRows|fetchMotus|resolveMotus|resolveSafer|fetch\(/);
  assert.match(page, /role === "owner" \|\| role === "admin"/);
  assert.match(page, /listWorkspaceCarrierSummaries\(workspace\.id, 20\)/);
});

test("browser stored-carrier summaries omit tenancy and carrier primary keys", async () => {
  const list = await source("src/lib/carrier-intelligence/list.ts");
  const client = await source("src/app/(app)/dashboard/carriers/CarrierLookup.tsx");

  assert.doesNotMatch(list, /select\([^)]*workspace_id/);
  assert.doesNotMatch(list, /select\([^)]*\bid\b/);
  assert.doesNotMatch(client, /workspaceId|carrierId/);
  assert.match(client, /Database view only · no public-source refresh/);
});
