# Urava Production Standard v1

This standard is mandatory for Orbit and every Urava-owned or Urava-delivered software product intended for public production.

A feature is not production-ready because it compiles, renders, or deploys. It is production-ready only after its security, correctness, tenant isolation, failure behavior, privacy behavior and scale characteristics are proven by release evidence.

## Primary rules

1. **No privileged credential transport.** Service-role, database-admin and infrastructure credentials remain inside the runtime that owns them and are never carried between services as job credentials.
2. **Narrow service identity.** Privileged operations use short-lived, scoped and verifiable capabilities or dedicated service identities. Reusable administrator credentials are not job tokens.
3. **Least privilege plus RLS.** Database roles receive only required privileges. Tenant tables use row-level security. Maintenance privileges are never granted to application clients.
4. **Automated release evidence.** Production requires typechecking, linting, dependency auditing, unit/security-contract tests, database isolation tests, E2E smoke tests and scale smoke tests.
5. **Protected release flow.** CI is read-only. Automated workflows never rewrite application source or push directly to `main`. Production changes flow through reviewed branches/PRs and required checks.
6. **Independent secret domains.** Encryption, OAuth, database, provider, webhook, worker and cron credentials use independent rotatable secrets. No secret silently falls back to an unrelated privileged credential.
7. **Verified integration readiness.** An integration is `connected` only after authentication succeeds and the capability Orbit intends to use is actually verified against the provider.
8. **Tenant provider isolation.** Workspace credentials are isolated. Shared Urava/platform credentials may be used only under an explicit product mode; they are never an implicit fallback.
9. **Atomic quotas.** Authentication, OAuth starts, costly provider APIs, plugin execution and other abuse-sensitive endpoints use server-enforced atomic rate limits/quotas and bounded request sizes/timeouts.
10. **Complete account lifecycle.** Public products provide privacy information, session revocation, credential recovery and an accessible account-deletion path with governed tenant-data cleanup.
11. **Environment isolation.** Development, CI, preview/staging and production use explicit environment configuration. Missing production configuration fails closed; source code never contains a production database fallback.
12. **Browser security policy.** Production uses restrictive security headers and CSP with explicit origins. Executable inline script exceptions and arbitrary network origins are not allowed.
13. **Scale is tested, not assumed.** Foreign keys and common tenant queries are indexed appropriately, provider/database work is bounded, and every production release passes repeatable concurrency/load smoke tests before public scale claims.

## Required release sequence

`Discuss → Prototype → Lock → Architecture → Build → Typecheck/Lint → Unit & Security Tests → Tenant/DB Tests → E2E → Scale Test → Privacy/Security Review → Staging/Preview → Reviewed Merge → Production → Runtime Verification`

## Enforcement

- `.github/workflows/quality.yml` is the canonical automated production gate.
- `supabase/tests/` contains database and tenant-isolation gates.
- `tests/unit/` contains source/security contracts.
- `scripts/e2e-smoke.mjs` and `scripts/load-smoke.mjs` provide application and concurrency smoke gates.
- Production migrations must be represented in `supabase/migrations/` and verified against the deployed database.
- Open P0/P1 production issues block release.

Any exception requires an explicit written risk decision, scope, expiry date and rollback path. Silent exceptions are prohibited.
