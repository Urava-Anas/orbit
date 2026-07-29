# Foundry Backend Hardening

This release strengthens the existing Foundry backend without connecting or
merging any additional student identities.

## Security invariants

- A learner can read only their own student, assignment, submission, progress,
  skill, attendance, and notification records.
- A learner can read only tasks assigned to them.
- A learner can read only general classes or classes for their department.
- Founder and reviewer writes are checked again at the database boundary.
- Connected student identity fields are immutable through normal product
  writes.
- High-risk records cannot be hard-deleted by authenticated product users.
- Reviewed submissions and terminal assignments cannot be edited into an
  earlier state.
- Audit and integration payloads contain identifiers and transition metadata,
  not copied student content.

## Atomic commands

| Command | Responsibility |
|---|---|
| `create_foundry_class_command` | Validates access and creates one class |
| `create_foundry_task_assignment_command` | Creates the task and assignment in one transaction |
| `submit_foundry_assignment_command` | Locks the assignment, numbers the attempt, and submits once |
| `review_foundry_submission_command` | Applies one review and triggers progress exactly once |
| `run_foundry_deadline_sweep` | Marks overdue work and activates the existing recovery workflow |

Every user-facing command accepts a UUID request key. Repeating the same
request returns the first result instead of creating a duplicate.

After the application begins using these commands, the command-path lockdown
migration rejects direct inserts and state changes on the protected tables.

## Durable integration boundary

Foundry changes append a minimal event to `foundry_outbox_events` in the same
transaction as the product change. Future Airtable, Notion, email, or analytics
workers can connect through:

- `claim_foundry_outbox_events(batch_size)` — service-role only, bounded to 100
  events, uses `FOR UPDATE SKIP LOCKED`, and reclaims workers stale for 15
  minutes.
- `complete_foundry_outbox_event(id, success, error)` — service-role only,
  records success or schedules exponential retry up to one hour.

No external worker is enabled in this release.

## Retention and audit

- Student, task, assignment, submission, attendance, progress, and skill
  records are retained. Product users update lifecycle/status instead of hard
  deleting evidence.
- Submission attempts are numbered and preserved.
- Duplicate-click submissions created before command idempotency are preserved;
  older active copies are marked `superseded` and the newest remains reviewable.
- Audit metadata records transaction ID, changed field names, and old/new
  status without copying full row values.
- Controlled workspace teardown remains possible and no longer fails when
  permission rows cascade after the workspace is gone.

## Rollout order

1. Apply `20260729064841_foundry_backend_hardening.sql`.
2. Deploy the application version that calls the atomic commands.
3. Apply `20260729070503_foundry_command_path_lockdown.sql`.
4. Run the Foundry hardening and tenant-isolation suites.
5. Verify production counts, RLS advisors, and runtime logs.

The first migration remains compatible with the previous application during
the short deployment window. The second migration is the enforcement gate and
must follow the application deployment.

## Foundry V1 completion migration

`20260729133243_foundry_v1_completion.sql` completes the operating layer:

- class status changes are constrained to valid forward transitions;
- scheduled, changed, live and cancelled classes create department-scoped
  learner notifications;
- completing a class records one attendance-backed progress event per learner;
- completing a class is blocked until every eligible learner has an attendance
  status;
- class and notification changes are included in the existing realtime channel.
- the integration outbox actor foreign key has a covering index.

This migration is backward-compatible with the deployed command application.
Apply it before deploying the Founder class controls and Student notification
inbox, then run all three SQL suites in rollback transactions.

## Verification

`supabase/tests/foundry_backend_hardening.sql` covers:

- command and review idempotency;
- atomic task assignment;
- cross-student privacy;
- class and task scoping;
- concurrent-safe submission attempts and revisions;
- invalid direct writes and hard-delete denial;
- immutable connected identity;
- notification isolation;
- class lifecycle, notification scope and completion evidence;
- deadline recovery;
- audit metadata;
- outbox privacy, claim, retry, and completion.

The legacy `foundry_rls.sql` and `tenant_isolation.sql` suites remain required.

## Reviewed advisor exceptions

`claim_orbit_access()` is intentionally `SECURITY DEFINER` and executable only
by `authenticated`. It needs protected access to `auth.users` so it can verify
the current `auth.uid()`, require a confirmed email and atomically claim exactly
one matching unlinked student row. It uses an empty search path and does not
accept caller-provided identity parameters.

Supabase leaked-password protection remains deferred while Orbit uses
Google-only authentication and the project stays on a plan that does not
include that control.
