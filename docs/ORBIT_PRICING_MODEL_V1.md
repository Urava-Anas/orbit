# Orbit Pricing Model v1

## Product principle

Orbit is priced per organisation workspace, not per individual login. The commercial unit is the business being operated. Team limits are included inside each plan so customers can grow without turning every employee invitation into a purchasing decision.

## Trial

Every newly created workspace receives a 15-day Business trial. The trial starts when the workspace is created and is recorded in `orbit_workspace_subscriptions`. No payment provider is required for the trial.

Existing production workspaces are grandfathered as `comped` so introducing pricing does not interrupt Urava, client workspaces, or existing Foundry records.

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

## Payments-not-connected behaviour

Until checkout is connected, a founder/admin can submit a plan-change request. Requests are append-only commercial intent records and do not mutate subscription status. This avoids pretending payment occurred while still giving the product a real upgrade path.

## Security

Subscription rows are readable only by members of the same workspace through existing private workspace membership helpers. Plan-change requests may be inserted only by workspace admins/owners and must attribute the request to the signed-in user. The workspace trial trigger is not RPC-executable by anon or authenticated users.

## Next payment phase

A checkout provider should later:

1. Create checkout sessions from the selected Orbit plan + billing interval.
2. Store provider customer/subscription identifiers on `orbit_workspace_subscriptions`.
3. Update status and billing period from verified webhooks only.
4. Never trust client-submitted payment state.
5. Keep plan pricing in `src/lib/orbit-plans.ts` as the product catalogue, with provider price IDs mapped separately by environment.
6. Add server-side entitlement enforcement for expired trials and delinquent subscriptions after payment recovery behaviour is finalized.
