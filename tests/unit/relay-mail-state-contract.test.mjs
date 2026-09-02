import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

async function source(path) {
  return readFile(join(repoRoot, path), "utf8");
}

test("Relay never presents approval-pending outbound mail as Sent", async () => {
  const actions = await source("src/app/(app)/dashboard/mail/actions.ts");
  const requestSend = actions.match(
    /export async function requestMailSend\(formData: FormData\)[\s\S]*?\n}/,
  )?.[0] ?? "";

  assert.match(requestSend, /"pending_approval"/);
  assert.match(requestSend, /folder: messageStatus === "draft" \? "drafts" : "outbox"/);
  assert.match(requestSend, /folder=outbox/);
  assert.doesNotMatch(requestSend, /folder: messageStatus === "draft" \? "drafts" : "sent"/);
  assert.doesNotMatch(requestSend, /folder=sent/);
});
