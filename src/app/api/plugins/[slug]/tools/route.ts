import { NextResponse } from "next/server";
import { getOrbitAccess } from "@/lib/access";
import {
  discoverPluginTools,
  getCachedOrDiscoverPluginTools,
  PluginRuntimeError,
} from "@/lib/plugins/mcp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ slug: string }> };

function runtimeFailure(error: unknown) {
  if (error instanceof PluginRuntimeError) {
    return NextResponse.json(
      { ok: false, error: error.code, message: error.message },
      { status: error.httpStatus, headers: { "Cache-Control": "no-store" } },
    );
  }
  console.error("Plugin tool discovery failed", error);
  return NextResponse.json(
    { ok: false, error: "plugin_discovery_failed", message: "Orbit could not load plugin tools." },
    { status: 500, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(request: Request, context: RouteContext) {
  const accessContext = await getOrbitAccess();
  if (!accessContext) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const { access, supabase } = accessContext;
  if (access.accountRole !== "founder" || !access.workspace || !access.membershipRole) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { slug } = await context.params;
  const refresh = new URL(request.url).searchParams.get("refresh") === "1";
  try {
    const result = refresh
      ? await discoverPluginTools(supabase, access.workspace.id, slug)
      : await getCachedOrDiscoverPluginTools(supabase, access.workspace.id, slug);
    return NextResponse.json(
      {
        ok: true,
        plugin: slug,
        cached: "cached" in result ? result.cached : false,
        tools: result.tools.map((tool) => ({
          name: tool.name,
          title: tool.title,
          description: tool.description,
          inputSchema: tool.inputSchema,
          annotations: tool.annotations,
          requiresApproval: true,
        })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return runtimeFailure(error);
  }
}
