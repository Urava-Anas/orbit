# Geo lead enrichment

Geo Search must enrich public business contact data before a discovered result is approved into the Lead Engine.

Stored fields: contact person, role, phone, email, website, enrichment status, confidence, source and enriched timestamp.

The enrichment pass uses Geoapify contact data first, then best-effort public business website pages (home/about/team/contact/leadership). Missing owner data is stored as unresolved/partial rather than guessed.
