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
    "supabase/migrations/20260831100000_relay_credential_read_service_role.sql",
  );

  assert.match(
    migration,
    /grant execute on function public\.orbit_relay_get_credential\(uuid\) to service_role;/i,
  );
});
