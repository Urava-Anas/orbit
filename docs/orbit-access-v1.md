# Orbit Access v1 — Product, UX and release contract

Status: implementation branch only. Production must remain unchanged until preview QA passes.

## Product boundary

Orbit Access owns identity entry and account lifecycle for `orbit.urava.online`: sign up, verification, sign in, founder onboarding, trial activation, recovery, reset, invitations, post-auth routing, sessions and access-state handoff.

Urava public authentication is not Orbit authentication. `urava.online` remains the public company/Foundry acquisition surface. Orbit sessions, cookies, OAuth callbacks and account lifecycle stay host-scoped to Orbit. No Urava session may silently authenticate Orbit and no Orbit session may silently authenticate Urava.

## Canonical journeys

### New founder
`Start 15-day trial → /signup → identity verification → /onboarding → review → activate trial → /dashboard`

The 15-day clock starts only on final activation, not on the marketing click or account creation.

### Returning user
`/login → authenticate → access resolver → authorised workspace`

Login is for an existing account. It must not masquerade as trial signup.

### Recovery
`/forgot-password → generic recovery response → email link → /reset-password → revoke sessions → /login`

Recovery never reveals whether a submitted email has an Orbit account. The success state may always offer `Create account` as a safe next action.

### Invitation
Invitation acceptance remains a separate identity/access flow. An invitation grants membership/capabilities; signup itself never asks the user to select a privileged role.

## Onboarding information architecture

1. **Your organisation** — organisation/workspace name.
2. **What should Orbit bring under control first?** — leads & sales, projects & delivery, cash, team, approvals, company overview.
3. **How should Orbit work with you?** — recommend first, prepare for approval, governed automation.
4. **Review** — show organisation, selected priorities, operating posture, 15 full days, no payment method at this stage.
5. **Start trial** — one primary action; create the organisation, owner membership and trial atomically.

Onboarding preferences are identity metadata for personalisation only. They never grant authority. Authority comes from organisation membership and server/database policy.

## UX rules

- One dominant action per screen.
- Mobile-first; keyboard and assistive-tech usable.
- Signup, login, recovery and reset use clear task-specific copy.
- Never ask a new user to choose Founder/Student/Mentor/Employee as an authority shortcut.
- Explain what happens next before the action.
- Preserve intent across OAuth/email verification callbacks using same-origin allowlisted return paths only.
- Do not start a trial twice on retries.
- Error states must preserve security boundaries and avoid account enumeration.

## Route contract

- `/signup` — new Orbit account.
- `/verify-email` — email-confirmation holding state.
- `/login` — existing account only.
- `/forgot-password` — recovery request.
- `/reset-password` — valid recovery-session credential change.
- `/onboarding` — authenticated founder setup before first workspace/trial.
- `/trial` — compatibility route only; forwards to signup/onboarding/billing as appropriate.
- `/auth/callback` — same-origin callback router; allows only explicitly approved auth destinations.

## Release gates

Do not merge/release until the preview proves:

1. Email signup with both confirmation-enabled and already-confirmed paths.
2. Google signup and Google sign in.
3. Existing email/password sign in.
4. Wrong-password and rate-limit behaviour.
5. Recovery response is non-enumerating.
6. Reset link success, expiry and post-reset sign-in.
7. Founder onboarding can be resumed and trial activation is single-shot.
8. Existing founder/student routing still works.
9. Mobile and desktop layout passes.
10. No Urava public auth cookie/session/callback is reused by Orbit.

Rollback: close/revert this branch/PR. Production `main`, current Vercel alias, Supabase data and Urava auth stay untouched until explicit release.