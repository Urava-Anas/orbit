import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

async function source(path) {
  return readFile(join(repoRoot, path), "utf8");
}

test("approval-pending Relay mail cannot be represented as Sent", async () => {
  const actions = await source("src/app/(app)/dashboard/mail/actions.ts");

  assert.match(actions, /messageStatus[^\n]+pending_approval/);
  assert.doesNotMatch(actions, /folder:\s*messageStatus === "draft" \? "drafts" : "sent"/);
  assert.doesNotMatch(actions, /folder=sent[^\n]+queued[^\n]+approved/i);
});
