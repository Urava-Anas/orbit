# Relay Operations & Recovery Runbook

Status: completion-gate documentation for the Relay engine. This runbook describes the verified non-production implementation currently preserved on `orbit/relay-conversation-controls-v1` and integrated into the Orbit RC1 release line. It does not authorize production deployment or external sending.

## Operating invariants

- Every mailbox, conversation and message mutation remains workspace-scoped and mailbox-scoped.
- Durable inbound deduplication relies on the database uniqueness boundary `(mailbox_id, provider_message_id)`.
- A mailbox may have only one active sync owner. A fresh `syncing` claim blocks competing synchronization and connector mutation.
- Stale synchronization claims may be recovered only after the bounded stale timeout.
- Bounded IMAP batches are resumable from the persisted cursor. A partial batch is not reported as fully synchronized.
- Authentication or credential failures fail closed and require reconnect/credential repair; transient provider/network failures remain retryable.
- A message in `sending` is delivery-uncertain. Never automatically resend it because the provider may already have accepted the message.
- A failed message may return to approval only when no provider message id, Internet message id or sent timestamp proves delivery.
- Existing drafts use optimistic timestamp guards. A stale editor must fail rather than overwrite a newer draft.
- Queueing an existing draft transitions that same message to `pending_approval`; it must not create a duplicate outbound message.

## Mailbox health states

### Connected / healthy
The latest successful synchronization completed and there is no active retryable or credential failure. Normal read/search/sync operations are allowed.

### Syncing
A synchronization claim currently owns the mailbox. Do not disconnect, replace credentials, or start a competing sync. Allow the active bounded batch to finish or wait for the stale-claim threshold before recovery.

### Degraded / retryable
The previous attempt failed for a transient reason such as provider/network interruption. Preserve the cursor and retry the same mailbox from its saved checkpoint. Do not reset the mailbox or discard previously synchronized messages.

### Failed / reconnect required
Authentication or credential state is invalid. Stop automated retries. Repair/reconnect the mailbox, then run a bounded synchronization from the saved checkpoint.

### Partial synchronization
The bounded batch completed but more remote messages may remain. Preserve the updated cursor and run another bounded sync. Do not treat the mailbox as fully caught up until the partial indicator clears.

## Safe synchronization recovery

1. Confirm the mailbox belongs to the expected workspace.
2. Read the mailbox health, last successful sync, current cursor, last error, and whether an active sync claim exists.
3. If a fresh claim exists, do not race it.
4. If the claim is stale, use the normal recovery path; do not manually clear unrelated mailbox state.
5. For a transient failure, retry from the persisted cursor.
6. For an authentication failure, reconnect credentials before retrying.
7. Verify the resulting mailbox state and confirm that duplicate inbound rows were not created.
8. Preserve evidence of the previous state and the resulting state in the execution ledger.

Rollback for a sync-reliability regression: return the reliability slice to verified Relay checkpoint `becb035979b8f72cd95c449a973983957c9611f2`, or abandon the Relay branch/RC integration. Production `main` is not part of this rollback path until a separately approved production rollout occurs.

## Draft and approval recovery

- Saved drafts reopen with their current content and exact `updated_at` checkpoint.
- If a stale draft save fails, reload the current draft; never force-overwrite it.
- A reply draft preserves its existing Relay thread and `in_reply_to` target.
- Before a send attempt, a `pending_approval` message can be reversibly returned to draft.
- A pre-delivery `failed` message can be recovered to approval only when there is no delivery evidence.
- Never recover a `sending` message by automatic resend. Treat it as delivery-uncertain and reconcile provider evidence first.
- If the message is already `sent` but the conversation state lagged, repair the conversation state conditionally; do not resend the message.

## Conversation controls

Conversation-level Archive/restore, Spam/restore, Trash/restore, Star/unstar, Read/unread and mailbox-scoped search must remain workspace/mailbox/thread scoped. A failure in one control must not justify resetting or recreating the conversation.

## Verification checklist

Relay cannot be called complete unless all of these are true on the exact integrated head:

- Production Quality is green, including dependency audit, isolated Supabase reset/seed, typecheck, lint, database/workflow suites, unit/security-contract tests, production build, end-to-end smoke and scale smoke.
- Conversation controls work against the intended workspace/mailbox/thread only.
- Draft optimistic-concurrency behavior rejects stale saves.
- Draft -> pending approval -> draft reversal operates on the same message row.
- Failed pre-delivery recovery is blocked when any delivery evidence exists.
- `sending` remains non-auto-retryable.
- Mailbox sync serialization prevents concurrent ownership.
- Stale sync recovery does not race a fresh sync.
- Transient failures preserve retryability/cursor; credential failures fail closed.
- Partial batches remain resumable and visibly partial.
- Connector mutation/disconnect is blocked while sync owns the mailbox.
- Healthy, syncing, degraded/retryable, failed/reconnect and partial states are understandable in the UI.
- No P0/P1 Relay blocker remains.
- Rollback checkpoint and release-head verification evidence are recorded.

## Production boundary

This runbook is operational documentation, not production approval. Do not merge/deploy to production, change credentials, run destructive migrations, or send high-impact external email without explicit founder approval and the normal Urava release gate.
