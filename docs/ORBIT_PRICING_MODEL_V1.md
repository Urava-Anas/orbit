# Orbit Pricing Model v1

## Product principle

Orbit is priced per organisation workspace, not per individual login. The commercial unit is the business being operated. Team limits are included inside each plan so customers can grow without turning every employee invitation into a purchasing decision.

## Trial

Every newly created founder workspace receives a 15-day Business trial. The trial starts when the workspace is created and is recorded in `orbit_workspace_subscriptions`. No payment provider is required for the trial.

A signed-in account without an existing founder/admin workspace can create one trial workspace through `/trial`. Active Foundry learner accounts cannot use that path. The public pricing flow preserves `/trial` through email and Google authentication.

Existing production workspaces are grandfathered as `comped` so introducing pricing does not interrupt current internal or client operations.

## Public plans

| Plan | Monthly | Annual | Included team members | Positioning |
| --- | ---: | ---: | ---: | --- |
| Founder | $29 | $290 | 3 | Solo founder / very small team |
| Business | $79 | $790 | 10 | Growing company; recommended |
| Autopilot | $199 | $1,990 | 25 | Automation-heavy operations |
| Enterprise | Custom | Custom | Custom | Larger/custom organisations |

Annual billing is intentionally equivalent to roughly two months free.

## Commercial state model

`trialing -> active -> past_due/cancelled`

`comped` is reserved for internal, grandfathered, partner, or manually sponsored workspaces.

The subscription record also reserves provider/customer/subscription identifiers so Stripe or another checkout provider can be connected later without changing the workspace model.

## Trial expiry and read-only behaviour

The database owns the write boundary. `private.orbit_workspace_can_write(workspace_id)` permits writes for active, comped, or non-expired trial workspaces. Restrictive RLS policies apply that condition to workspace-scoped operational tables.

When a trial expires, normal workspace reads remain available while operational INSERT, UPDATE, and DELETE actions are denied. Subscription and plan-change tables are deliberately excluded from this gate so an expired customer can still inspect billing state and choose a plan.

## Payments-not-connected behaviour

Until checkout is connected, a founder/admin can submit a plan-change request. Requests are append-only commercial intent records and do not mutate subscription status. This avoids pretending payment occurred while still giving the product a real upgrade path.

## Security

Subscription rows are readable only by members of the same workspace through existing private workspace membership helpers. Plan-change requests may be inserted only by workspace admins/owners and must attribute the request to the signed-in user.

The trigger function that creates the subscription row is not directly executable by anon or authenticated users. The dedicated self-serve `start_orbit_trial(text)` RPC is executable only by authenticated users and validates authentication, workspace ownership history, learner status, and workspace-name constraints before creating one trial workspace.

## Next payment phase

A checkout provider should later:

1. Create checkout sessions from the selected Orbit plan + billing interval.
2. Store provider customer/subscription identifiers on `orbit_workspace_subscriptions`.
3. Update status and billing period from verified webhooks only.
4. Never trust client-submitted payment state.
5. Keep plan pricing in `src/lib/orbit-plans.ts` as the product catalogue, with provider price IDs mapped separately by environment.
6. Add payment-recovery UX around `past_due` and verified provider events without weakening the database write gate.
