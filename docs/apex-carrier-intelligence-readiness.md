# Apex Carrier Intelligence readiness

## Current safe gate

Carrier Intelligence is a bounded Apex workflow inside Orbit. It reuses the Apex workspace, carrier records, Lead Engine, authentication and approval controls. It must not become a second CRM.

The founder/admin lookup surface accepts only MC or USDOT input. Workspace tenancy comes from the authenticated Orbit session. Results display source, verification state and confidence. Lookup cannot approve, reject, contact or book a carrier.

PR #59 remains the release branch. Production Quality must pass on its exact current head; a prior green run does not certify later changes. The owner has authorized the controlled production release and first 1,000-carrier batch, subject to the verification gates below and zero additional spending.

The verified Vercel target is `urava-pros/orbit`, connected to `Urava-Anas/orbit`. Pushes to `main` automatically deploy production. The observed production baseline on 2026-09-04 is deployment `dpl_HqZamUdQazVjXfpMJnhMooffn9Mb`, commit `d35c831`, serving `orbit-two-delta.vercel.app`.

Preview deployment `dpl_8Gn1VT9pnxquSGzbHaHSpJ3Zq3JU` failed because Preview lacks `NEXT_PUBLIC_SUPABASE_URL`. Production variables must not be copied into Preview, and the configuration guard must not be weakened. No isolated cloud preview database is available in the connected Supabase projects. Continue free development and isolated CI testing while this gate is blocked; do not create paid branches or change billing.

The original seven Carrier Intelligence migrations were independently verified in Orbit Production, including normalized SQL matches against head `20bc2eb`. Do not reapply them by filename: production migration timestamps differ. The new `apex_carrier_factory_atomic_delivery` migration is a separate pending release dependency; validate it in CI and reconcile migration history before any future production application. Its service-role-only finalizer is required by the updated runner. No live factory batch has been verified.

## Required gates before production pilot

- Production Quality passes on the exact branch head.
- Supabase migrations reset cleanly and `supabase/tests/apex_carrier_intelligence.sql` passes.
- Preview deployment is tested with an Apex owner/admin and a non-admin member.
- One known-good USDOT, one MC resolving to USDOT, one missing record, one source outage and the quota boundary are verified.
- Stored Carrier 360 reads make no live public-source calls.
- A human confirms commercial COI, identity and onboarding evidence before any approval or dispatch.
- Carrier approval remains a RED capability and outbound communication remains approval-gated.

## Source boundary

Core lookup uses free/public FMCSA-derived sources. Paid carrier-data vendors are optional enrichment only and cannot be required for a usable Carrier 360 profile. Unknown, stale or conflicting evidence remains visible and routes to manual review.

## Deterministic next actions

1. Run the full Production Quality workflow after each branch update.
2. Exercise the preview acceptance matrix without production credentials or real carrier outreach.
3. Verify the stored-carrier list and operational preflight already present in this release.
4. Run `supabase/tests/apex_carrier_factory_delivery.sql` only in isolated test databases. Its synthetic 1,000-record exercise proves delivery behavior, not real carrier quality or production delivery.
5. Merge only after the exact-commit checks and preview acceptance pass. Reverify production health, authorization and tenant isolation before starting the owner/admin factory workflow.
