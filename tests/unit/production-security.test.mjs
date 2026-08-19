import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

async function source(path) {
  return readFile(join(repoRoot, path), "utf8");
}

async function runtimeSources(directory) {
  const root = join(repoRoot, directory);
  const files = [];
  async function walk(path) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const next = join(path, entry.name);
      if (entry.isDirectory()) await walk(next);
      else if (/\.(?:ts|tsx|js|mjs)$/.test(entry.name)) files.push(await readFile(next, "utf8"));
    }
  }
  await walk(root);
  return files.join("\n");
}

test("scheduler never transports Supabase admin credentials", async () => {
  const scheduler = await source("supabase/functions/orbit-stage4-scheduler/index.ts");
  const worker = await source("src/app/api/internal/autopilot-worker/route.ts");
  assert.doesNotMatch(scheduler, /ciphertext|supabase-iv|x-orbit-supabase/i);
  assert.doesNotMatch(worker, /createDecipheriv|x-orbit-supabase|service-auth/i);
  assert.match(scheduler, /X-Orbit-Scheduler-Token/);
  assert.match(worker, /consume_stage4_scheduler_invocation/);
});

test("legacy service-role transport cannot remain anywhere in executable runtime code", async () => {
  const runtime = `${await runtimeSources("src")}\n${await runtimeSources("supabase/functions")}`;
  assert.doesNotMatch(runtime, /x-orbit-supabase-(?:iv|ciphertext)/i);
  assert.doesNotMatch(runtime, /decryptServiceRole/);
});

test("integration encryption is independent from database admin keys", async () => {
  const integration = await source("src/lib/integration-connections.ts");
  const secretFunction = integration.match(/function integrationSecret\(\)[\s\S]*?\n}/)?.[0] ?? "";
  assert.match(secretFunction, /INTEGRATION_SECRET/);
  assert.doesNotMatch(secretFunction, /SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY/);
});

test("internal signing domains do not reuse cron or worker credentials", async () => {
  const gateway = await source("src/lib/agents/stage4-gateway.ts");
  const inbound = await source("src/app/api/internal/autopilot-events/route.ts");
  const gatewaySecret = gateway.match(/export function stageFourGatewaySecret\(\)[\s\S]*?\n}/)?.[0] ?? "";
  assert.match(gatewaySecret, /ORBIT_EXTERNAL_ACTION_GATEWAY_SECRET/);
  assert.doesNotMatch(gatewaySecret, /CRON_SECRET|ORBIT_AUTOPILOT_WORKER_SECRET/);
  assert.match(inbound, /ORBIT_INBOUND_EVENT_SECRET/);
  assert.doesNotMatch(inbound, /ORBIT_EXTERNAL_ACTION_GATEWAY_SECRET/);
});

test("production public Supabase config is explicit and preview builds fail closed", async () => {
  const config = await source("src/lib/supabase/config.ts");
  assert.match(config, /VERCEL_ENV\s*===\s*"production"/);
  assert.match(config, /VERCEL\s*===\s*"1"/);
  assert.match(config, /NEXT_PUBLIC_SUPABASE_URL/);
  assert.match(config, /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  assert.match(config, /sb_publishable_/);
  assert.match(config, /Preview and development builds never fall back to production data/);
  assert.doesNotMatch(config, /SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY/);
});

test("workspace provider credentials are preferred and platform mode is explicit", async () => {
  const providers = await source("src/lib/agents/stage4-providers.ts");
  assert.match(providers, /ORBIT_PROVIDER_CREDENTIAL_MODE/);
  const setting = providers.match(/async function providerSetting[\s\S]*?\n}/)?.[0] ?? "";
  assert.ok(setting.indexOf("vaultSecret") < setting.indexOf("platformCredentialMode"));
});

test("OAuth connections require provider capability verification and token lifecycle handling", async () => {
  const callback = await source("src/app/api/integrations/oauth/[provider]/callback/route.ts");
  const status = await source("src/app/api/integrations/connection-status/route.ts");
  const lifecycle = await source("src/lib/integration-token-lifecycle.ts");
  const pluginConnections = await source("src/lib/plugins/connections.ts");
  assert.match(callback, /verifiedCapabilities/);
  assert.match(callback, /oauth_capability_verification_failed/);
  assert.match(status, /verification_required/);
  assert.match(status, /reauthorization_required/);
  assert.match(status, /getFreshIntegrationAccessToken/);
  assert.match(lifecycle, /grant_type:\s*"refresh_token"/);
  assert.match(lifecycle, /AbortSignal\.timeout/);
  assert.match(pluginConnections, /verifiedCapabilities/);
  assert.match(pluginConnections, /token_expires_at/);
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
