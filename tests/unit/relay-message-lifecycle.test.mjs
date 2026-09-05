import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("../../", import.meta.url));
const source = (path) => readFile(join(root, path), "utf8");

test("Relay draft edits preserve thread identity and use an optimistic draft checkpoint", async () => {
  const action = await source("src/app/(app)/dashboard/mail/message-lifecycle-actions.ts");

  assert.match(action, /requestedThreadId/);
  assert.match(action, /threadForWorkspace/);
  assert.match(action, /draft_message_id/);
  assert.match(action, /draft_expected_updated_at/);
  assert.match(action, /draft\.updated_at !== expectedDraftUpdatedAt/);
  assert.match(action, /\.eq\("updated_at", expectedDraftUpdatedAt\)/);
  assert.match(action, /Draft changed since this editor loaded\. Nothing was overwritten/);
});

test("Relay reply drafts keep Internet reply threading inside the same mailbox and thread", async () => {
  const action = await source("src/app/(app)/dashboard/mail/message-lifecycle-actions.ts");

  assert.match(action, /latestReplyTarget/);
  assert.match(action, /\.eq\("workspace_id", workspaceId\)/);
  assert.match(action, /\.eq\("mailbox_id", mailboxId\)/);
  assert.match(action, /\.eq\("thread_id", threadId\)/);
  assert.match(action, /in_reply_to: replyTarget/);
  assert.match(action, /Relay refused a reply thread identity mismatch/);
});

test("Queueing an existing draft transitions that same message instead of inserting a duplicate", async () => {
  const action = await source("src/app/(app)/dashboard/mail/message-lifecycle-actions.ts");

  assert.match(action, /if \(draftMessageId\)/);
  assert.match(action, /status: targetStatus/);
  assert.match(action, /direction: targetStatus === "draft" \? "draft" : "outbound"/);
  assert.match(action, /\.eq\("id", draftMessageId\)/);
  assert.match(action, /\.eq\("status", "draft"\)/);
  assert.match(action, /Message queue transition was not verified/);
});

test("Approval queue has a deterministic rollback to draft before any send attempt", async () => {
  const action = await source("src/app/(app)/dashboard/mail/message-lifecycle-actions.ts");

  assert.match(action, /export async function returnRelayMessageToDraft/);
  assert.match(action, /message\.status !== "pending_approval"/);
  assert.match(action, /message\.provider_message_id \|\|/);
  assert.match(action, /message\.internet_message_id \|\|/);
  assert.match(action, /message\.sent_at/);
  assert.match(action, /status: "draft", direction: "draft"/);
  assert.match(action, /folder: "drafts"/);
});

test("Failed pre-delivery messages can be recovered only when no delivery evidence exists", async () => {
  const action = await source("src/app/(app)/dashboard/mail/message-lifecycle-actions.ts");

  assert.match(action, /export async function setRelayMessageRecoveryState/);
  assert.match(action, /expectedStatus === "failed" && nextStatus === "pending_approval"/);
  assert.match(action, /provider_message_id/);
  assert.match(action, /internet_message_id/);
  assert.match(action, /sent_at/);
  assert.match(action, /\.is\("provider_message_id", null\)/);
  assert.match(action, /\.is\("internet_message_id", null\)/);
  assert.match(action, /\.is\("sent_at", null\)/);
});

test("Uncertain sending state is fail-closed and never automatically retried", async () => {
  const action = await source("src/app/(app)/dashboard/mail/message-lifecycle-actions.ts");
  const page = await source("src/app/(app)/dashboard/mail/page.tsx");

  assert.match(action, /after\?\.status === "sending"/);
  assert.match(action, /Relay will not retry automatically/);
  assert.match(page, /message\.status === "sending"/);
  assert.match(page, /Verify provider delivery before recovery/);
});

test("Relay compose reopens a saved draft with its version and content", async () => {
  const page = await source("src/app/(app)/dashboard/mail/page.tsx");

  assert.match(page, /draft_expected_updated_at/);
  assert.match(page, /draft_message_id/);
  assert.match(page, /defaultValue=\{draft\?\.body_text \?\? ""\}/);
  assert.match(page, /formAction=\{saveRelayDraft\}/);
  assert.match(page, /formAction=\{queueRelayMessage\}/);
  assert.match(page, /Recover to approval queue/);
  assert.match(page, /Return to draft/);
});
