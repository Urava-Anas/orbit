import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

async function source(path) {
  return readFile(join(repoRoot, path), "utf8");
}

test("Relay decrypted credential reads use the server admin client", async () => {
  const relay = await source("src/lib/relay/namecheap-vault.ts");
  const credentialReader = relay.match(
    /async function getMailboxCredential\(mailboxId: string\)[\s\S]*?\n}/,
  )?.[0] ?? "";

  assert.match(relay, /import \{ createAdminClient \} from "@\/lib\/supabase\/admin"/);
  assert.match(credentialReader, /createAdminClient\(\)/);
  assert.match(credentialReader, /orbit_relay_get_credential/);
  assert.doesNotMatch(credentialReader, /await createClient\(\)/);
});

test("Relay credential RPC explicitly grants the service role before cutover", async () => {
  const migration = await source(
    "supabase/migrations/20260831165900_relay_credential_read_service_role.sql",
  );

  assert.match(
    migration,
    /grant execute on function public\.orbit_relay_get_credential\(uuid\) to service_role;/i,
  );
});

test("Relay credential RPC accepts service-role calls without a user auth uid", async () => {
  const migration = await source(
    "supabase/migrations/20260831170026_relay_credential_getter_service_role_guard.sql",
  );

  assert.match(migration, /auth\.role\(\)/i);
  assert.match(migration, /service_role/i);
  assert.match(migration, /private\.is_workspace_admin\(v_workspace_id\)/i);
});
