import { NextResponse, type NextRequest } from "next/server";
import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REVIEWED_ORBIT_PRODUCTION_ALIASES = new Set([
  "orbit-two-delta.vercel.app",
  "orbit-urava-pros.vercel.app",
  "orbit-git-main-urava-pros.vercel.app",
]);

function requestUsesReviewedProductionOrigin(request: NextRequest) {
  const host = request.headers.get("host")?.trim().toLowerCase().split(":")[0];
  return Boolean(host && REVIEWED_ORBIT_PRODUCTION_ALIASES.has(host));
}

export async function GET(request: NextRequest) {
  const checks = {
    supabasePublicConfig: Boolean(supabaseUrl.trim() && supabasePublishableKey.trim()),
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
        requestUsesReviewedProductionOrigin(request),
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
