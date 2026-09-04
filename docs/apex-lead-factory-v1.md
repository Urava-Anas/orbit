# Apex Carrier Intelligence Factory v1

## Production target

Deliver exactly 1,000 unique carrier prospects per Apex workspace/day from an over-collected candidate pool. A delivered USDOT is lifetime-deduplicated. Re-entry is allowed only when a material-change fingerprint changes (authority, fleet, MCS-150/source freshness, equipment, or verified contact evidence).

## Pipeline

Candidate discovery -> eligibility -> lifetime USDOT dedupe -> Carrier 360 enrichment -> equipment evidence -> deterministic opportunity scoring -> A/B/C ranking -> delivery batch -> canonical Lead Engine -> approval-gated outreach -> conversion measurement.

## Daily quality contract

- Quota: 1,000 delivered leads/day.
- Identity key: normalized USDOT number.
- Never silently recycle a previously delivered USDOT.
- Every material field carries provenance/freshness through Carrier 360.
- Declared fleet and inspection-observed equipment remain separate concepts.
- Unknown facts stay unknown; no inferred truck model is promoted to a government fact.
- Outbound contact remains behind existing RED/approval governance.
- If fewer than 1,000 A/B prospects qualify, fill the remaining quota with clearly labelled C-tier prospects rather than lowering or hiding quality thresholds.

## Required lead dossier

Identity, USDOT/docket identifiers, authority and operating status, physical location, public business contacts, drivers/power units/trailers, declared equipment and cargo, owned/leased fleet composition when available, inspection-observed vehicle details when available, authority/insurance/safety evidence, OOS/crash indicators, freshness, opportunity score, tier, score reasons, why-now signals, and source/confidence metadata.

## Metrics

Track candidates scanned, eligible, rejected, deduped, enriched, delivered, tier mix, stale-source rate, contactable rate, outreach approvals, replies, meetings and clients. Optimisation must use downstream conversion, not raw lead volume alone.

## Delivery and retry integrity

An existing batch retains its original quota when resumed. Work items can be settled only by the current worker lease (worker ID, lease timestamp and attempt number); lost leases are reported separately from successful ready/rejected/retry outcomes.

Finalization uses `finalize_apex_carrier_factory_batch`, a service-role-only, security-invoker transaction. It serializes finalizers within a workspace, selects qualifying unique material versions, persists ledger entries, settles work items and updates batch counts together. Re-entry requires both a changed fingerprint and an explicit allowed material-change reason. A failure rolls back the transaction. A repeat call reads the same persisted delivery count; existing partial ledger writes from an interrupted older runner can be recovered.

`ready` reports work items still in the ready state. `eligibleReady` reports the currently selectable remainder toward an unfinished quota; duplicate or unsupported re-entry rows can remain ready without being deliverable. `delivered` and `tierCounts` always describe persisted ledger entries for this batch, including when finalization returns `waiting_for_more_ready`. Extra ready rows do not increase the requested quota.

Negative authority evidence is evaluated before positive labels. Inactive, revoked, not-authorized and other explicit negative statuses cannot receive active-authority points or enter delivery through a high opportunity score. The delivery floor (50), A/B boundaries (80/65) and freshness threshold (45 days) are unchanged; this is a classification correction, not tuning from live results.

## Free verification

Run `npm ci`, `npm run typecheck`, `npm run lint` and `npm run test:unit` locally. The existing Production Quality workflow runs all migrations, database tests, build, E2E and scale smoke against an isolated Supabase instance on its standard GitHub runner. No hosted Supabase branch or paid API is needed for these checks.

The database delivery suite uses clearly synthetic fixtures inside a rolled-back transaction. It checks 999-versus-1,000 readiness, overcollection, exact unique quota, repeat finalization, cross-workspace rejection, lifetime deduplication, explicit material-change re-entry, partial-write recovery and rollback after an injected settlement failure. These tests must never be reported as a live 1,000-carrier batch.
