import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { PluginRuntimeError } from "@/lib/plugins/mcp";
import { invokePluginToolForOperator, parseOrbitOperatorBearer } from "@/lib/plugins/operator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  requestId: z.string().uuid(),
  arguments: z.record(z.string(), z.unknown()).default({}),
}).strict();

type RouteContext = { params: Promise<{ slug: string; tool: string }> };

export async function POST(request: Request, context: RouteContext) {
  const token = parseOrbitOperatorBearer(request);
  if (!token) {
    return NextResponse.json(
      { ok: false, error: "invalid_authorization", message: "A valid Orbit bearer key is required." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > 70 * 1024) {
    return NextResponse.json({ ok: false, error: "payload_too_large" }, { status: 413 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { ok: false, error: "orbit_gateway_not_configured" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const body = bodySchema.parse(await request.json());
    const { slug, tool } = await context.params;
    const result = await invokePluginToolForOperator({
      admin,
      token,
      slug,
      toolName: tool,
      arguments: body.arguments,
      requestId: body.requestId,
    });
    return NextResponse.json(
      { ok: true, ...result },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, error: "invalid_payload", message: "Plugin tool arguments are invalid." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    if (error instanceof PluginRuntimeError) {
      return NextResponse.json(
        { ok: false, error: error.code, message: error.message },
        { status: error.httpStatus, headers: { "Cache-Control": "no-store" } },
      );
    }
    console.error("Orbit Operator plugin invocation failed", error);
    return NextResponse.json(
      { ok: false, error: "plugin_operator_invocation_failed" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
