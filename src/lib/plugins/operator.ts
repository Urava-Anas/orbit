import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  authorizePluginOperator,
  getCachedOrDiscoverPluginTools,
  invokePluginTool,
  type RuntimeTool,
} from "@/lib/plugins/mcp";

export function parseOrbitOperatorBearer(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const [scheme, token] = authorization.split(/\s+/, 2);
  if (
    scheme?.toLowerCase() !== "bearer" ||
    !token ||
    !/^orb_live_[A-Za-z0-9_-]{32,120}$/.test(token) ||
    token.length > 160
  ) {
    return null;
  }
  return token;
}

function exposedTool(tool: RuntimeTool) {
  return {
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: tool.inputSchema,
    annotations: tool.annotations,
    requiresApproval: true,
  };
}

export async function listPluginToolsForOperator(input: {
  admin: SupabaseClient;
  token: string;
  slug: string;
}) {
  const auth = await authorizePluginOperator(input.admin, input.token, "plugins.read");
  const { tools } = await getCachedOrDiscoverPluginTools(input.admin, auth.workspaceId, input.slug);
  return {
    workspaceId: auth.workspaceId,
    plugin: input.slug,
    tools: tools.map(exposedTool),
  };
}

export async function invokePluginToolForOperator(input: {
  admin: SupabaseClient;
  token: string;
  slug: string;
  toolName: string;
  arguments: Record<string, unknown>;
  requestId: string;
}) {
  const auth = await authorizePluginOperator(input.admin, input.token, "plugins.invoke");
  return invokePluginTool({
    supabase: input.admin,
    workspaceId: auth.workspaceId,
    slug: input.slug,
    toolName: input.toolName,
    arguments: input.arguments,
    actorUserId: auth.actorUserId,
    actionKeyId: auth.actionKeyId,
    requestId: input.requestId,
  });
}
