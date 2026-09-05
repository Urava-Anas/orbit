# Orbit by Urava

Orbit is Urava's founder control plane for one real commercial loop:

`Lead → Client project → Cash + proof → Content → New lead`

The product deliberately excludes simulated integrations, invented health scores,
autonomous business claims, and unverified metrics.

## Production stack

- Next.js 16 App Router and React 19
- Supabase Auth with cookie-based SSR sessions
- Supabase Postgres with workspace-scoped Row Level Security
- Server Actions with Zod validation and server-derived tenant context
- Vercel deployment

## Modules

- Command Center — live pipeline, projects, paid PKR invoices, approved proof,
  scheduled next actions, and audit history
- Leads — qualification, source, stage, value, and next action
- Clients & Projects — client records, delivery scope, value, status, and due date
- Cash — invoice and payment state; not a replacement for accounting
- Proof — evidence, permission scope, and review state
- Content — human-reviewed drafts created only from approved proof
- Settings & Security — identity, role, password recovery, and session revocation

## Security model

- The browser never supplies a workspace ID for mutations.
- Every Server Action authenticates the user and resolves workspace membership.
- Every public table has RLS enabled.
- Tenant-owned rows use workspace membership policies.
- Composite foreign keys prevent cross-workspace record relationships.
- Public clients use only a Supabase publishable key.
- Mutations are validated, ownership-scoped, and captured in the audit trail.
- Password recovery does not reveal whether an account exists.
- The repository contains no database or service-role secrets.

## Local setup

```bash
cp .env.example .env.local
npm install
npm run dev -- --hostname 127.0.0.1
```

Required environment variables:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

Production-safe public defaults are included for the Orbit Supabase project, so
Git deployments work before Vercel environment variables are attached. These
are Supabase publishable client values, not privileged credentials. Environment
variables override them.

For stable Server Action references across rolling deployments, configure a
32-byte `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` in Vercel only. Never commit its
value.

## Verification

```bash
npm run lint
npm run build
```

Database migrations live in `supabase/migrations`. The live tenant-isolation test
is in `supabase/tests/tenant_isolation.sql`; it runs inside a transaction and
rolls back all synthetic users and records.


## Sovereign AI foundation

Orbit owns business workflows and treats AI models as replaceable infrastructure.

Stage 1 adds:

- a provider-independent AI Gateway at `POST /api/ai/gateway`
- server-only provider and model catalogs
- workspace model policies with local-only, cost, latency, preferred-model, and fallback controls
- per-attempt AI usage telemetry without storing raw prompts or outputs
- append-only company events
- deduplicated structured company memory entries
- a generic OpenAI-compatible adapter that can target a cloud endpoint today or an Urava-owned local inference server later

The seeded `openai` and `urava_local` providers are disabled by default. No model is enabled automatically.

Gateway execution requires a server-side `SUPABASE_SECRET_KEY` or legacy
`SUPABASE_SERVICE_ROLE_KEY`. Provider credentials are referenced only by
environment-variable name in the database; secret values are never stored in
the provider catalog.

The current adapter is enabled only for capabilities that are actually configured
on a provider/model pair. Stage 1 seeds only `chat`; structured output, tool
calling, vision, and other capabilities remain contract-level options until an
adapter and model are explicitly configured for them.
