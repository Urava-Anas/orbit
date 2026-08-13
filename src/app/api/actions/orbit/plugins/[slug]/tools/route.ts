import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PluginRuntimeError } from "@/lib/plugins/mcp";
import { listPluginToolsForOperator, parseOrbitOperatorBearer } from "@/lib/plugins/operator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ slug: string }> };

export async function GET(request: Request, context: RouteContext) {
  const token = parseOrbitOperatorBearer(request);
  if (!token) {
    return NextResponse.json(
      { ok: false, error: "invalid_authorization", message: "A valid Orbit bearer key is required." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { ok: false, error: "orbit_gateway_not_configured" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const { slug } = await context.params;
    const result = await listPluginToolsForOperator({ admin, token, slug });
    return NextResponse.json(
      { ok: true, ...result },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof PluginRuntimeError) {
      return NextResponse.json(
        { ok: false, error: error.code, message: error.message },
        { status: error.httpStatus, headers: { "Cache-Control": "no-store" } },
      );
    }
    console.error("Orbit Operator plugin discovery failed", error);
    return NextResponse.json(
      { ok: false, error: "plugin_operator_discovery_failed" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
