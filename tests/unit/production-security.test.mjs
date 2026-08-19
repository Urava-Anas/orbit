import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function source(path) {
  return readFile(new URL(`../../${path}`, import.meta.url), "utf8");
}

test("scheduler never transports Supabase admin credentials", async () => {
  const scheduler = await source("supabase/functions/orbit-stage4-scheduler/index.ts");
  const worker = await source("src/app/api/internal/autopilot-worker/route.ts");
  assert.doesNotMatch(scheduler, /ciphertext|supabase-iv|x-orbit-supabase/i);
  assert.doesNotMatch(worker, /createDecipheriv|x-orbit-supabase|service-auth/i);
  assert.match(scheduler, /X-Orbit-Scheduler-Token/);
  assert.match(worker, /consume_stage4_scheduler_invocation/);
});

test("integration encryption is independent from database admin keys", async () => {
  const integration = await source("src/lib/integration-connections.ts");
  const secretFunction = integration.match(/function integrationSecret\(\)[\s\S]*?\n}/)?.[0] ?? "";
  assert.match(secretFunction, /INTEGRATION_SECRET/);
  assert.doesNotMatch(secretFunction, /SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY/);
});

test("production configuration has no baked-in Orbit Supabase project", async () => {
  const config = await source("src/lib/supabase/config.ts");
  assert.doesNotMatch(config, /sjtgydpwsnjwxlwbtpgf/);
  assert.match(config, /NEXT_PUBLIC_SUPABASE_URL/);
  assert.match(config, /required/);
});

test("workspace provider credentials are preferred and platform mode is explicit", async () => {
  const providers = await source("src/lib/agents/stage4-providers.ts");
  assert.match(providers, /ORBIT_PROVIDER_CREDENTIAL_MODE/);
  const setting = providers.match(/async function providerSetting[\s\S]*?\n}/)?.[0] ?? "";
  assert.ok(setting.indexOf("vaultSecret") < setting.indexOf("platformCredentialMode"));
});

test("CSP no longer permits unsafe inline scripts or arbitrary https connections", async () => {
  const proxy = await source("src/proxy.ts");
  assert.match(proxy, /nonce-/);
  assert.match(proxy, /strict-dynamic/);
  assert.doesNotMatch(proxy, /script-src[^\n]*unsafe-inline/);
  assert.doesNotMatch(proxy, /connect-src[^\n]*https:\s/);
});

test("temporary workflows cannot mutate main", async () => {
  const quality = await source(".github/workflows/quality.yml");
  assert.match(quality, /contents: read/);
  assert.doesNotMatch(quality, /git push|contents: write/);
});
