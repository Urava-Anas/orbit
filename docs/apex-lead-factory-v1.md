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
