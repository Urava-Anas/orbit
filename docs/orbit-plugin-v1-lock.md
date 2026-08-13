# Orbit Plugin Architecture v1 — Locked Production Baseline

Orbit Plugin Architecture v1 is locked as a four-stage platform:

1. Plugin Core — catalog, strict manifests, workspace installations, permissions and audit history.
2. Universal App Layer — plugins inherit organisation-scoped provider authorisation from Orbit Connect.
3. Governed Runtime — verified plugins may expose bounded MCP tools through Orbit's approval, rate, size, replay and audit controls.
4. SDK + Marketplace — publishers submit immutable semantic versions for Orbit platform review before marketplace promotion.

Security invariants:

- Plugin execution is workspace isolated and fail closed.
- Normal users never paste provider OAuth/API secrets into plugins.
- Third-party publishers cannot directly write the public catalog or approved versions.
- Added permissions, newly required apps or changed remote runtime endpoints require organisation re-approval.
- Approved plugin versions are immutable.
- Operator invocation requires plugin-specific scopes.
- Raw tool arguments, raw tool outputs and provider secrets are not persisted in plugin audit records.
- OAuth/App state tokens are short-lived and one-time.
- Privileged scheduler/provider/plugin-review RPCs are service-role only.
- Browser responses use production security headers and a restrictive content security policy.

Cost invariant:

Orbit does not run a dedicated third-party plugin compute fleet. Orbit stores orchestration, permission, routing and audit metadata in the existing platform, while third-party runtime compute remains developer/provider owned.
