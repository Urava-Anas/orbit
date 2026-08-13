import { NextResponse } from "next/server";
import { z } from "zod";
import { getOrbitAccess } from "@/lib/access";
import { invokePluginTool, PluginRuntimeError } from "@/lib/plugins/mcp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  requestId: z.string().uuid().optional(),
  arguments: z.record(z.string(), z.unknown()).default({}),
}).strict();

type RouteContext = { params: Promise<{ slug: string; tool: string }> };

function runtimeFailure(error: unknown) {
  if (error instanceof PluginRuntimeError) {
    return NextResponse.json(
      { ok: false, error: error.code, message: error.message },
      { status: error.httpStatus, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (error instanceof z.ZodError) {
    return NextResponse.json(
      { ok: false, error: "invalid_payload", message: "Plugin tool arguments are invalid." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  console.error("Plugin invocation failed", error);
  return NextResponse.json(
    { ok: false, error: "plugin_invocation_failed", message: "Orbit could not invoke this plugin tool." },
    { status: 500, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request, context: RouteContext) {
  const expectedOrigin = new URL(request.url).origin;
  const origin = request.headers.get("origin");
  if (!origin || origin !== expectedOrigin) {
    return NextResponse.json(
      { ok: false, error: "origin_rejected", message: "Plugin calls must originate from the active Orbit workspace." },
      { status: 403 },
    );
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > 70 * 1024) {
    return NextResponse.json({ ok: false, error: "payload_too_large" }, { status: 413 });
  }

  const accessContext = await getOrbitAccess();
  if (!accessContext) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const { access, supabase, user } = accessContext;
  if (
    access.accountRole !== "founder" ||
    !access.workspace ||
    (access.membershipRole !== "owner" && access.membershipRole !== "admin")
  ) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  try {
    const body = bodySchema.parse(await request.json());
    const { slug, tool } = await context.params;
    const result = await invokePluginTool({
      supabase,
      workspaceId: access.workspace.id,
      slug,
      toolName: tool,
      arguments: body.arguments,
      actorUserId: user.id,
      requestId: body.requestId,
    });
    return NextResponse.json(
      { ok: true, ...result },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return runtimeFailure(error);
  }
}
