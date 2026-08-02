# Orbit Lead Finder MVP

Lead Finder is the controlled discovery input for Orbit's Lead Engine.

Flow: search brief → Google Places discovery → temporary review queue → on-demand contact enrichment → deterministic opportunity scoring → founder approval → Lead Engine.

Guardrails:
- no scraping
- no automatic outreach
- no direct insertion into the live pipeline without approval
- Google Place IDs are durable duplicate keys
- cached provider content expires after 30 days
- minimum field masks are used to control cost
