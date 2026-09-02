# Apex Carrier Intelligence readiness

## Current safe gate

Carrier Intelligence is a bounded Apex workflow inside Orbit. It reuses the Apex workspace, carrier records, Lead Engine, authentication and approval controls. It must not become a second CRM.

The founder/admin lookup surface accepts only MC or USDOT input. Workspace tenancy comes from the authenticated Orbit session. Results display source, verification state and confidence. Lookup cannot approve, reject, contact or book a carrier.

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
3. Add a stored-carrier list and explicit preflight view after the lookup UI is accepted.
4. Add Gmail only through Orbit's existing connector and approval model; do not create a separate Apex inbox or credential store.
5. Do not merge or deploy until the founder authorizes the production pilot.
