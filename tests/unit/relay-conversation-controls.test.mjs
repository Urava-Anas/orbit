import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("../../", import.meta.url));
const source = (path) => readFile(join(root, path), "utf8");

test("Relay conversation moves are workspace scoped and optimistic", async () => {
  const action = await source("src/app/(app)/dashboard/mail/conversation-actions.ts");

  assert.match(action, /requireWorkspace\(\)/);
  assert.match(action, /\.eq\("workspace_id", workspace\.id\)/);
  assert.match(action, /\.eq\("mailbox_id", mailboxId\)/);
  assert.match(action, /\.eq\("id", threadId\)/);
  assert.match(action, /\.eq\("folder", fromFolder\)/);
  assert.match(action, /thread\.folder !== fromFolder/);
  assert.match(action, /Nothing%20was%20overwritten/);
});

test("Relay conversation moves preserve a deterministic rollback path", async () => {
  const action = await source("src/app/(app)/dashboard/mail/conversation-actions.ts");

  assert.match(action, /from_folder/);
  assert.match(action, /to_folder/);
  assert.match(action, /Rollback: move it back to \$\{fromFolder\}/);
  assert.doesNotMatch(action, /\.delete\(/);
});

test("Relay UI exposes reversible archive and restore controls", async () => {
  const page = await source("src/app/(app)/dashboard/mail/page.tsx");

  assert.match(page, /moveRelayThread, setRelayThreadFlag/);
  assert.match(page, /action=\{moveRelayThread\}/);
  assert.match(page, /name="from_folder" value=\{selected\.folder\}/);
  assert.match(page, /name="to_folder" value="archive"/);
  assert.match(page, /Restore to inbox/);
  assert.match(page, /Archive conversation/);
});

test("Relay UI exposes reversible spam and trash controls", async () => {
  const page = await source("src/app/(app)/dashboard/mail/page.tsx");

  assert.match(page, /name="to_folder" value="spam"/);
  assert.match(page, /aria-label="Mark as spam"/);
  assert.match(page, /name="to_folder" value="trash"/);
  assert.match(page, /aria-label="Move to trash"/);
  assert.match(page, /selected\.folder === "archive" \|\| selected\.folder === "spam" \|\| selected\.folder === "trash"/);
});

test("Relay star and read flags are whitelisted, scoped and optimistic", async () => {
  const action = await source("src/app/(app)/dashboard/mail/conversation-actions.ts");

  assert.match(action, /new Set\(\["is_starred", "is_unread"\]\)/);
  assert.match(action, /export async function setRelayThreadFlag/);
  assert.match(action, /\.eq\("workspace_id", workspace\.id\)/);
  assert.match(action, /\.eq\("mailbox_id", mailboxId\)/);
  assert.match(action, /\.eq\("id", threadId\)/);
  assert.match(action, /\.eq\("folder", folder\)/);
  assert.match(action, /\.eq\(field, expected\)/);
  assert.match(action, /current !== expected/);
  assert.match(action, /Rollback: restore \$\{field\} to \$\{expected\}/);
});

test("Relay UI wires reversible star and read/unread controls", async () => {
  const page = await source("src/app/(app)/dashboard/mail/page.tsx");

  assert.match(page, /action=\{setRelayThreadFlag\}/);
  assert.match(page, /name="field" value="is_starred"/);
  assert.match(page, /name="field" value="is_unread"/);
  assert.match(page, /name="expected" value=\{String\(selected\.is_starred\)\}/);
  assert.match(page, /name="next" value=\{String\(!selected\.is_starred\)\}/);
  assert.match(page, /name="expected" value=\{String\(selected\.is_unread\)\}/);
  assert.match(page, /name="next" value=\{String\(!selected\.is_unread\)\}/);
  assert.match(page, /Mark as read/);
  assert.match(page, /Mark as unread/);
});

test("Relay conversation search stays inside the selected mailbox", async () => {
  const page = await source("src/app/(app)/dashboard/mail/page.tsx");

  assert.match(page, /name="q"/);
  assert.match(page, /\.eq\("workspace_id", workspace\.id\)/);
  assert.match(page, /\.eq\("mailbox_id", selectedMailbox\.id\)/);
  assert.match(page, /if \(!searchQuery\)/);
  assert.match(page, /threadRows\.filter/);
  assert.match(page, /thread\.participant_emails/);
  assert.match(page, /thread\.business_context_type/);
  assert.match(page, /No matching conversations/);
});
