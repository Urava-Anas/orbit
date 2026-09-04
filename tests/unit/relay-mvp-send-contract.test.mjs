import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("../../", import.meta.url));
const source = (path) => readFile(join(root, path), "utf8");

test("Relay sends only a stored message waiting for operator approval", async () => {
  const connector = await source("src/lib/relay/namecheap-vault.ts");
  const action = await source("src/app/(app)/dashboard/mail/actions.ts");

  assert.match(connector, /\.eq\("workspace_id", input\.workspaceId\)/);
  assert.match(connector, /\.eq\("mailbox_id", input\.mailboxId\)/);
  assert.match(connector, /\.eq\("status", "pending_approval"\)/);
  assert.match(connector, /status: "sending"/);
  assert.match(connector, /sender identity mismatch/);
  assert.match(connector, /mailbox credential mismatch/);
  assert.match(action, /approveAndSendRelayMessage/);
  assert.match(action, /requireMailboxAdmin\(role\)/);
});

test("Relay represents pending mail in an outbox and never skips a busy inbox batch", async () => {
  const connector = await source("src/lib/relay/namecheap-vault.ts");
  const action = await source("src/app/(app)/dashboard/mail/actions.ts");
  const migration = await source("supabase/migrations/20260904170000_relay_outbox_folder.sql");

  assert.match(action, /folder: messageStatus === "draft" \? "drafts" : "outbox"/);
  assert.match(action, /folder=outbox/);
  assert.doesNotMatch(action, /folder: messageStatus === "draft" \? "drafts" : "sent"/);
  assert.match(connector, /maxUid > 0 \? available\.slice\(0, MAX_SYNC\)/);
  assert.match(migration, /'outbox'/);
});

test("Relay locks authentication to the selected mailbox and preserves recoverable sync failures", async () => {
  const page = await source("src/app/(app)/dashboard/mail/page.tsx");
  const action = await source("src/app/(app)/dashboard/mail/actions.ts");

  assert.match(page, /name="mailbox_id" value=\{selectedMailbox\?\.id \?\? ""\}/);
  assert.match(page, /readOnly=\{Boolean\(selectedMailbox && selectedMailbox\.status !== "connected"\)\}/);
  assert.match(action, /requestedMailbox\.address\.toLowerCase\(\) !== email/);
  assert.match(action, /refused%20a%20mailbox%20identity%20mismatch/);
  assert.match(action, /Mailbox authenticated, but the first sync failed:/);
});
