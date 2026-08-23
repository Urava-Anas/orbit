# Geo lead enrichment contract

Before a Geo Search result is approved into the Lead Engine, Orbit runs a best-effort enrichment pass against Geoapify data and the business's public website.

Persisted fields: business/contact person, role, phone, email, website, enrichment status, confidence, source, and enriched timestamp.

Orbit never guesses a decision maker. If a public owner/contact person cannot be verified, the result is stored as `partial` or `unresolved` and can still be reviewed manually.
