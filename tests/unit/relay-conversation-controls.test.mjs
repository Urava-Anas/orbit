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
