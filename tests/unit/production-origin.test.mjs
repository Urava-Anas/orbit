import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

async function source(path) {
  return readFile(join(repoRoot, path), "utf8");
}

test("production proxy has a reviewed alias fallback without redirecting unknown previews", async () => {
  const proxy = await source("src/proxy.ts");
  assert.match(proxy, /REVIEWED_ORBIT_PRODUCTION_HOST/);
  assert.match(proxy, /REVIEWED_ORBIT_PRODUCTION_ALIASES/);
  assert.match(proxy, /Unknown preview\/deployment hosts are not silently redirected into production/);
  assert.doesNotMatch(proxy, /NEXT_PUBLIC_APP_URL is required in production/);
});

test("production health accepts only reviewed Orbit aliases as origin fallback", async () => {
  const health = await source("src/app/api/health/production/route.ts");
  assert.match(health, /REVIEWED_ORBIT_PRODUCTION_ALIASES/);
  assert.match(health, /requestUsesReviewedProductionOrigin/);
  assert.match(health, /orbit-two-delta\.vercel\.app/);
});
