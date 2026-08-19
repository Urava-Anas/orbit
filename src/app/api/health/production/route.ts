import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const checks = {
    supabasePublicConfig: Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim(),
    ),
    supabaseServiceIdentity: Boolean(
      process.env.SUPABASE_SECRET_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
    ),
    independentIntegrationEncryption: Boolean(
      process.env.INTEGRATION_SECRET?.trim() &&
        (process.env.INTEGRATION_SECRET?.trim().length ?? 0) >= 32,
    ),
    canonicalOrigin: Boolean(
      process.env.NEXT_PUBLIC_APP_URL?.trim() ||
        process.env.FOUNDRY_APP_URL?.trim() ||
        process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim(),
    ),
    tenantProviderMode: ["workspace", "platform"].includes(
      process.env.ORBIT_PROVIDER_CREDENTIAL_MODE?.trim().toLowerCase() || "workspace",
    ),
  };
  const ready = Object.values(checks).every(Boolean);

  return NextResponse.json(
    {
      ok: ready,
      status: ready ? "ready" : "configuration_required",
      revision: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? null,
      checks,
    },
    {
      status: ready ? 200 : 503,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
