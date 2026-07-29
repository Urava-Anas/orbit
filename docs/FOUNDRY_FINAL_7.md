# Foundry V1 Final 7% Runbook

This release closes the remaining product-system gaps. It does not claim that
real-world adoption is complete until every active student has used the full
loop.

## What is now built

### Real daily testing

`/dashboard/foundry/operations` shows one row per active student and the
current Pakistan day:

- Portal opened and task/feedback viewed are recorded from real student page
  use.
- Submission and attendance checkpoints are created from canonical database
  events.
- A dash means the step was not applicable that day.
- Founder issue notes are date-scoped and can be resolved without rewriting
  the evidence.

No test may be marked green from demo or fixture data.

### Account connection

Account readiness is derived from the canonical student record:

- **Connected**: a verified Auth UUID is already bound.
- **Ready after sign-in**: an exact email exists and `claim_orbit_access()`
  will bind the first verified Google sign-in.
- **Missing email**: a human must supply the exact account address.

Orbit never invents an Auth UUID or guesses an email.

### Email and WhatsApp

External messages are off by default. A Founder must record channel consent.
The worker sends only the in-app notification title/body and Orbit link:

- Email uses Resend idempotency keys.
- WhatsApp uses an approved Cloud API template with three body parameters.
- Disabling consent before delivery prevents the queued message from sending.
- Provider failures retry independently with exponential backoff.

### Airtable and Notion

Supabase remains canonical:

1. Outbox event commits with the student transaction.
2. Airtable upserts the Students row by permanent UFS ID.
3. The Airtable Record ID is persisted in Orbit.
4. Notion upserts the Foundry Students page by Airtable Record ID.
5. The Notion page URL is written back to Airtable.

Each target has a separate receipt, lock, retry counter and last error. A
Notion outage cannot undo Airtable success.

### Studio Ready

Studio readiness is a Founder decision, not an automatic score. The review
uses the six standards from the student introduction guide:

1. Skill Quality
2. Deadline
3. Communication
4. Revision Attitude
5. Reliability
6. Confidentiality

Approval requires every standard at least 3/5 and an average at least 4/5,
plus a written evidence summary. Approval allows supervised Studio
consideration; it does not assign client work automatically.

### Certificates

Certificates are Founder-issued, evidence-gated, revocable and verified through
an unguessable public token. Direct public table access is denied.

- Track completion: 60% progress and at least one accepted submission.
- Foundry completion: 80% progress and at least two accepted submissions.
- Studio readiness: current approved six-standard review.

Every certificate says that it records verified training evidence and does not
guarantee a job, client project or income.

## Server configuration

Copy only the variable names from `.env.example` into Vercel. Never copy a
secret into source control.

Required for the worker:

- `SUPABASE_SECRET_KEY` (preferred) or `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET`

Provider variables:

- Airtable: `AIRTABLE_API_TOKEN`
- Notion: `NOTION_API_KEY`
- Email: `RESEND_API_KEY`, `FOUNDRY_EMAIL_FROM`
- WhatsApp: `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, approved
  template name/language/version

The Vercel Cron is a daily safety sweep at `02:00 UTC` (`07:00 PKT`).
Successful Founder and Student mutations also schedule an immediate bounded
worker pass.

## Release order

1. Record current production code deployment and database counts.
2. Apply `20260729195731_foundry_v1_final_7.sql`.
3. Verify new tables have RLS and all new functions have intended grants.
4. Add production environment variables; never expose them as `NEXT_PUBLIC_*`.
5. Deploy the exact reviewed application commit.
6. Queue the full roster sync from Foundry Operations.
7. Run one delivery with a consenting test account before enabling student
   channels in bulk.
8. Run all four SQL suites in rollback transactions.
9. Complete the real daily workflow with every active student.

Rollback must disable the Cron and external channel consent before reverting
application code. The migration is additive; do not drop evidence or delivery
receipts during incident response.
