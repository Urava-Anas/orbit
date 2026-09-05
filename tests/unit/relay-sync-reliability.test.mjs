import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("../../", import.meta.url));
const source = (path) => readFile(join(root, path), "utf8");

test("Relay inbound sync has a durable provider-message dedupe key", async () => {
  const migration = await source("supabase/migrations/20260823062500_orbit_mailbox_core.sql");
  const importer = await source("src/lib/relay/namecheap-vault.ts");

  assert.match(migration, /create unique index orbit_mail_messages_provider_unique/);
  assert.match(migration, /\(mailbox_id, provider_message_id\) where provider_message_id is not null/);
  assert.match(importer, /\.eq\("mailbox_id", input\.mailboxId\)/);
  assert.match(importer, /\.eq\("provider_message_id", providerMessageId\)/);
  assert.match(importer, /if \(existing\) \{\s*maxUid = Math\.max\(maxUid, uid\);\s*continue;/);
});

test("Relay serializes sync attempts with an optimistic mailbox claim", async () => {
  const reliability = await source("src/lib/relay/sync-reliability.ts");

  assert.match(reliability, /status: "syncing"/);
  assert.match(reliability, /\.eq\("status", observed\.status\)/);
  assert.match(reliability, /\.eq\("updated_at", observed\.updated_at\)/);
  assert.match(reliability, /sync is already running for this mailbox/);
  assert.match(reliability, /No duplicate sync was started/);
});

test("Relay can recover an abandoned sync claim without racing a fresh one", async () => {
  const reliability = await source("src/lib/relay/sync-reliability.ts");

  assert.match(reliability, /STALE_SYNC_MS = 2 \* 60 \* 1000/);
  assert.match(reliability, /observed\.status === "syncing"/);
  assert.match(reliability, /observedAt - observedUpdatedAt >= STALE_SYNC_MS/);
  assert.match(reliability, /recoveredStaleClaim: staleSync/);
});

test("Relay keeps transient sync failures retryable and hard auth failures fail closed", async () => {
  const reliability = await source("src/lib/relay/sync-reliability.ts");

  assert.match(reliability, /isHardConnectionFailure/);
  assert.match(reliability, /status: hardFailure \? "error" : "connected"/);
  assert.match(reliability, /connection_health: hardFailure \? "failed" : "degraded"/);
  assert.match(reliability, /recoveryState\.inbound_enabled = false/);
  assert.match(reliability, /recoveryState\.outbound_enabled = false/);
  assert.match(reliability, /retry will resume safely/);
});

test("Relay treats the bounded IMAP batch as a resumable partial sync", async () => {
  const importer = await source("src/lib/relay/namecheap-vault.ts");
  const reliability = await source("src/lib/relay/sync-reliability.ts");
  const actions = await source("src/app/(app)/dashboard/mail/actions.ts");

  assert.match(importer, /const MAX_SYNC = 10/);
  assert.match(importer, /available\.slice\(0, MAX_SYNC\)/);
  assert.match(importer, /sync_cursor_uid: maxUid \|\| null/);
  assert.match(reliability, /possiblyMore: result\.imported >= SYNC_BATCH_SIZE/);
  assert.match(actions, /Safe batch limit reached; Sync again to continue from the saved cursor/);
});

test("Relay blocks connector mutation while a sync owns the mailbox", async () => {
  const actions = await source("src/app/(app)/dashboard/mail/actions.ts");

  assert.match(actions, /requestedMailbox\?\.status === "syncing"/);
  assert.match(actions, /Connector%20changes%20are%20blocked/);
  assert.match(actions, /mailbox\.status === "syncing"/);
  assert.match(actions, /Disconnect%20is%20blocked/);
});

test("Relay surfaces persistent sync health, retry and reconnect UX", async () => {
  const page = await source("src/app/(app)/dashboard/mail/page.tsx");

  assert.match(page, /Last sync issue/);
  assert.match(page, /Last successful sync/);
  assert.match(page, /Degraded · retry available/);
  assert.match(page, /Retry sync/);
  assert.match(page, /Reconnect mailbox/);
  assert.match(page, /disabled=\{syncing\}/);
});
