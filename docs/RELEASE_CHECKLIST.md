# Orbit Production Release Checklist

A release is approved only when every required item is checked and linked to evidence.

## Release identity

- [ ] Release version or commit SHA recorded
- [ ] Release owner recorded
- [ ] Production deployment URL recorded
- [ ] Rollback deployment identified

## Product quality

- [ ] `npm run lint` passes
- [ ] `tsc --noEmit` passes
- [ ] `npm run build` passes
- [ ] Primary navigation works on desktop and mobile
- [ ] Empty, loading, success and error states are reviewed
- [ ] Browser console, page errors and failed requests are reviewed
- [ ] No invented metrics, simulated integrations or placeholder production data

## Authentication

- [ ] Google sign-in creates a valid session
- [ ] Founder, Student and Access Pending destinations resolve correctly
- [ ] Local sign-out ends the current browser session
- [ ] Repeated form submission is blocked while pending
- [ ] A learner can claim only the Foundry record matching their verified email

Email/password checks are required only if that provider is enabled:

- [ ] New signup, verification, sign-in and password reset succeed
- [ ] Invalid credentials fail without account enumeration
- [ ] Old password no longer works after reset
- [ ] Global sign-out revokes other sessions
- [ ] Leaked-password protection is enabled on a supporting Supabase plan

## Data and tenant security

- [ ] Production migrations match the repository
- [ ] All exposed tables have RLS enabled
- [ ] Tenant-isolation test passes
- [ ] Cross-workspace reads are blocked
- [ ] Cross-workspace writes are blocked
- [ ] Audit events remain tenant-scoped
- [ ] Workspace teardown removes workspace-owned records safely
- [ ] Supabase security advisor has no unresolved critical finding
- [ ] Foundry hardening, Foundry RLS and tenant-isolation SQL suites pass
- [ ] Student counts and learning evidence are unchanged after rollback tests
- [ ] No service-role or secret key is exposed to the browser or repository

## Operations

- [ ] GitHub Production Quality workflow passes
- [ ] Latest Vercel deployment is READY
- [ ] Homepage, login and authenticated dashboard smoke tests pass
- [ ] Runtime logs contain no unresolved P0 or P1 error
- [ ] Environment variables exist in the correct Vercel environments
- [ ] Custom-domain decision is recorded
- [ ] DNS and TLS are healthy when a custom domain is used
- [ ] Rollback procedure is tested or explicitly reviewed

## Documentation and release control

- [ ] Current V1 scope is accurate in Notion
- [ ] Future Founder App vision is clearly separated from shipped capability
- [ ] Known limitations are documented
- [ ] Open P0 and P1 issues equal zero
- [ ] Release decision and evidence links are recorded

## Approval

- [ ] Founder approval
- [ ] Release timestamp recorded
- [ ] External onboarding explicitly opened
