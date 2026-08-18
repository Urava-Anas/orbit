# Orbit Connection Flow Standard v1

Status: LOCKED

## Product rule
Every external connection or plugin credential in Orbit must use its own dedicated guided onboarding flow. Orbit must never collapse multiple providers into one mega-connection wizard and must not fall back to cheap standalone credential forms.

## Required experience
- Opening a connection creates a focused modal over the existing Orbit surface.
- Everything behind the modal is dimmed and blurred.
- One provider is configured at a time.
- The same Orbit shell is reused across providers, while provider-specific content and steps remain specific to that provider.
- The user always sees current step, validation state, permission state, asset state, security state, and the capability that will unlock.
- Errors are human-readable and remain inside the onboarding flow.
- Success is explicit and ends with the provider being ready in Orbit.

## Standard state journey
1. Install or enable capability when applicable.
2. Connect account or provide credential.
3. Validate real provider access.
4. Approve permissions and/or choose assets.
5. Complete setup and unlock the dependent Orbit capability.

A provider may omit a step only when it genuinely does not apply. The UI still uses the same shell.

## Standard connection states
- not_installed
- installed
- needs_connection
- validating
- needs_permissions
- needs_assets
- connected
- partial
- failed
- disconnected

## Security rules
- Secrets are never embedded in frontend code.
- API keys and tokens are submitted to Orbit server actions/routes.
- Provider credentials are validated server-side before persistence when the provider supports validation.
- Persisted secrets are encrypted at rest using Orbit's server-side integration secret.
- Browser code never receives decrypted credentials.
- Features remain locked until the required connection state is complete.
- Orbit must not display simulated or fake connection success when a provider integration is not configured.

## Shared implementation
All provider flows should reuse the shared connection shell and its visual language:
- ConnectionFlowModal
- step rail
- provider action area
- setup status panel
- security explanation
- success path rail
- human-readable failure states

## Provider-specific examples
- Geoapify: install plugin → API key → validate → approved Lead Engine boundary → Lead Finder enabled.
- GitHub: OAuth/App authorization → verify installation → repository scope → ready for delivery/automation.
- Vercel: OAuth/Integration authorization → verify account/team → project scope → ready for deployment operations.
- Google/Meta/LinkedIn and future integrations follow the same shell after their real provider-side apps are configured.

## Build rule
Prototype/UX decision → explicitly lock → implement shared primitive → implement one reference provider → migrate remaining providers → production QA. New connection work must follow this sequence unless the product decision is explicitly reopened.
