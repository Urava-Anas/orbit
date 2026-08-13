import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { orbitBaseUrl } from "@/lib/integration-connections";
import { parsePluginManifest, type OrbitPluginManifestV1 } from "@/lib/plugins/contracts";

const MCP_PROTOCOL_VERSION = "2026-07-28";
const MCP_CLIENT_INFO = { name: "Orbit Plugin Runtime", version: "1.0.0" } as const;
const TOOL_NAME_PATTERN = /^[A-Za-z0-9_.:-]{1,128}$/;
const HEADER_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9-]{0,62}[A-Za-z0-9]$/;
const MAX_ARGUMENT_BYTES = 64 * 1024;
const MAX_SCHEMA_BYTES = 96 * 1024;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_TOOLS = 100;
const REQUEST_TIMEOUT_MS = 15_000;
const TOOL_CACHE_MS = 5 * 60 * 1000;
const MAX_CALLS_PER_MINUTE = 30;

export type RuntimeTool = {
  name: string;
  title: string | null;
  description: string | null;
  inputSchema: Record<string, unknown>;
  annotations: Record<string, unknown>;
};

export type PluginRuntimeContext = {
  workspaceId: string;
  installationId: string;
  pluginId: string;
  slug: string;
  manifest: OrbitPluginManifestV1;
  endpoint: URL;
};

export class PluginRuntimeError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly httpStatus = 400,
  ) {
    super(message);
    this.name = "PluginRuntimeError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function digestPluginValue(value: unknown) {
  return createHash("sha256").update(stableJson(value), "utf8").digest("hex");
}

function byteLength(value: unknown) {
  return Buffer.byteLength(JSON.stringify(value) ?? "", "utf8");
}

function isPrivateIpv4(address: string) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) return true;
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && parts[2] === 2) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && parts[2] === 100) ||
    (a === 203 && b === 0 && parts[2] === 113) ||
    a >= 224
  );
}

function isPrivateIpv6(address: string) {
  const normalized = address.toLowerCase();
  if (normalized === "::" || normalized === "::1") return true;
  if (normalized.startsWith("::ffff:")) {
    const mapped = normalized.slice("::ffff:".length);
    return isIP(mapped) === 4 ? isPrivateIpv4(mapped) : true;
  }
  const first = Number.parseInt(normalized.split(":")[0] || "0", 16);
  if (!Number.isFinite(first)) return true;
  return (
    (first & 0xfe00) === 0xfc00 ||
    (first & 0xffc0) === 0xfe80 ||
    (first & 0xff00) === 0xff00 ||
    normalized.startsWith("2001:db8:") ||
    normalized.startsWith("2001:db8::")
  );
}

function isPrivateAddress(address: string) {
  const family = isIP(address);
  if (family === 4) return isPrivateIpv4(address);
  if (family === 6) return isPrivateIpv6(address);
  return true;
}

async function assertSafeMcpEndpoint(endpoint: URL) {
  if (endpoint.protocol !== "https:") throw new PluginRuntimeError("MCP endpoints must use HTTPS.", "mcp_https_required", 403);
  if (endpoint.username || endpoint.password) throw new PluginRuntimeError("MCP endpoint credentials are not allowed in URLs.", "mcp_url_credentials_forbidden", 403);
  if (endpoint.port && endpoint.port !== "443") throw new PluginRuntimeError("MCP endpoints must use standard HTTPS port 443.", "mcp_port_forbidden", 403);
  const hostname = endpoint.hostname.toLowerCase();
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
    throw new PluginRuntimeError("Local MCP endpoints are not allowed in production.", "mcp_localhost_forbidden", 403);
  }

  if (isIP(hostname)) {
    if (isPrivateAddress(hostname)) throw new PluginRuntimeError("Private or reserved MCP endpoint addresses are blocked.", "mcp_private_network_forbidden", 403);
    return;
  }

  let addresses: Awaited<ReturnType<typeof lookup>>;
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new PluginRuntimeError("MCP endpoint DNS lookup failed.", "mcp_dns_failed", 502);
  }
  if (!addresses.length || addresses.some((record) => isPrivateAddress(record.address))) {
    throw new PluginRuntimeError("MCP endpoint resolved to a private or reserved network.", "mcp_private_network_forbidden", 403);
  }
}

function perRequestMeta() {
  return {
    "io.modelcontextprotocol/protocolVersion": MCP_PROTOCOL_VERSION,
    "io.modelcontextprotocol/clientInfo": MCP_CLIENT_INFO,
    "io.modelcontextprotocol/clientCapabilities": {},
  };
}

function encodeHeaderValue(value: string | number | boolean) {
  const text = typeof value === "boolean" ? String(value) : String(value);
  const safe = /^[\x20-\x7E\t]*$/.test(text) && text.trim() === text && !(text.startsWith("=?base64?") && text.endsWith("?="));
  if (safe) return text;
  return `=?base64?${Buffer.from(text, "utf8").toString("base64")}?=`;
}

type HeaderBinding = { header: string; path: string[] };

function collectHeaderBindings(schema: unknown, path: string[] = [], found: HeaderBinding[] = []) {
  if (!isRecord(schema)) return found;
  const marker = schema["x-mcp-header"];
  if (typeof marker === "string") {
    if (!HEADER_NAME_PATTERN.test(marker) || marker.toLowerCase().startsWith("mcp-")) {
      throw new PluginRuntimeError("MCP tool declared an invalid x-mcp-header value.", "mcp_invalid_tool_header", 502);
    }
    found.push({ header: marker, path });
    if (found.length > 20) throw new PluginRuntimeError("MCP tool declares too many custom headers.", "mcp_too_many_tool_headers", 502);
  }
  const properties = schema.properties;
  if (isRecord(properties)) {
    for (const [key, child] of Object.entries(properties)) {
      if (!/^[A-Za-z0-9_.-]{1,80}$/.test(key)) continue;
      collectHeaderBindings(child, [...path, key], found);
    }
  }
  return found;
}

function valueAtPath(input: Record<string, unknown>, path: string[]) {
  let current: unknown = input;
  for (const part of path) {
    if (!isRecord(current) || !(part in current)) return undefined;
    current = current[part];
  }
  return current;
}

function customHeadersForTool(tool: RuntimeTool, args: Record<string, unknown>) {
  const headers: Record<string, string> = {};
  for (const binding of collectHeaderBindings(tool.inputSchema)) {
    const value = valueAtPath(args, binding.path);
    if (value === undefined || value === null) continue;
    if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
      throw new PluginRuntimeError("MCP custom header parameters must be scalar values.", "mcp_header_value_invalid", 400);
    }
    headers[`Mcp-Param-${binding.header}`] = encodeHeaderValue(value);
  }
  return headers;
}

async function readLimitedResponse(response: Response) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new PluginRuntimeError("MCP response exceeded Orbit's size limit.", "mcp_response_too_large", 502);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf8");
}

function parseSseFinal(text: string, requestId: string) {
  const dataLines = text
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .filter(Boolean);
  for (let index = dataLines.length - 1; index >= 0; index -= 1) {
    try {
      const parsed = JSON.parse(dataLines[index]);
      if (isRecord(parsed) && String(parsed.id ?? "") === requestId) return parsed;
    } catch {
      continue;
    }
  }
  throw new PluginRuntimeError("MCP SSE response did not contain a final JSON-RPC result.", "mcp_sse_incomplete", 502);
}

async function mcpPost(
  endpoint: URL,
  method: string,
  params: Record<string, unknown>,
  extraHeaders: Record<string, string> = {},
) {
  await assertSafeMcpEndpoint(endpoint);
  const id = randomUUID();
  const paramsWithMeta = { ...params, _meta: perRequestMeta() };
  const body = { jsonrpc: "2.0", id, method, params: paramsWithMeta };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      redirect: "error",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "MCP-Protocol-Version": MCP_PROTOCOL_VERSION,
        "Mcp-Method": method,
        Origin: orbitBaseUrl(),
        ...extraHeaders,
      },
      body: JSON.stringify(body),
    });
    const raw = await readLimitedResponse(response);
    if (!response.ok) {
      throw new PluginRuntimeError(`MCP server returned HTTP ${response.status}.`, "mcp_http_error", response.status >= 500 ? 502 : 400);
    }
    const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
    let payload: unknown;
    try {
      payload = contentType.includes("text/event-stream") ? parseSseFinal(raw, id) : JSON.parse(raw);
    } catch (error) {
      if (error instanceof PluginRuntimeError) throw error;
      throw new PluginRuntimeError("MCP server returned invalid JSON.", "mcp_invalid_json", 502);
    }
    if (!isRecord(payload) || payload.jsonrpc !== "2.0" || String(payload.id ?? "") !== id) {
      throw new PluginRuntimeError("MCP server returned an invalid JSON-RPC envelope.", "mcp_invalid_envelope", 502);
    }
    if (isRecord(payload.error)) {
      throw new PluginRuntimeError(
        typeof payload.error.message === "string" ? payload.error.message.slice(0, 300) : "MCP server rejected the request.",
        `mcp_rpc_${String(payload.error.code ?? "error")}`,
        502,
      );
    }
    if (!("result" in payload)) throw new PluginRuntimeError("MCP server returned no result.", "mcp_missing_result", 502);
    return payload.result;
  } catch (error) {
    if (error instanceof PluginRuntimeError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new PluginRuntimeError("MCP request timed out.", "mcp_timeout", 504);
    }
    throw new PluginRuntimeError("MCP request failed.", "mcp_transport_failed", 502);
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeTool(raw: unknown): RuntimeTool | null {
  if (!isRecord(raw) || typeof raw.name !== "string" || !TOOL_NAME_PATTERN.test(raw.name)) return null;
  const inputSchema = isRecord(raw.inputSchema) ? raw.inputSchema : {};
  if (byteLength(inputSchema) > MAX_SCHEMA_BYTES) return null;
  try {
    collectHeaderBindings(inputSchema);
  } catch {
    return null;
  }
  return {
    name: raw.name,
    title: typeof raw.title === "string" ? raw.title.slice(0, 160) : null,
    description: typeof raw.description === "string" ? raw.description.slice(0, 2_000) : null,
    inputSchema,
    annotations: isRecord(raw.annotations) ? raw.annotations : {},
  };
}

async function requireRuntimeContext(
  supabase: SupabaseClient,
  workspaceId: string,
  slug: string,
): Promise<PluginRuntimeContext> {
  const { data: catalog, error: catalogError } = await supabase
    .from("plugin_catalog")
    .select("id,slug,status,verified,current_version,manifest")
    .eq("slug", slug)
    .maybeSingle();
  if (catalogError || !catalog) throw new PluginRuntimeError("Plugin was not found.", "plugin_not_found", 404);
  if (catalog.status !== "published" || catalog.verified !== true) {
    throw new PluginRuntimeError("Remote plugin execution requires a verified published plugin.", "plugin_not_verified", 403);
  }
  const manifest = parsePluginManifest(catalog.manifest);
  if (manifest.id !== catalog.slug || manifest.version !== catalog.current_version || !manifest.mcp) {
    throw new PluginRuntimeError("This plugin does not expose an MCP runtime.", "plugin_mcp_unavailable", 409);
  }
  const { data: installation, error: installError } = await supabase
    .from("plugin_installations")
    .select("id,status,version,granted_permissions")
    .eq("workspace_id", workspaceId)
    .eq("plugin_id", catalog.id)
    .maybeSingle();
  if (installError || !installation) throw new PluginRuntimeError("Plugin is not installed.", "plugin_not_installed", 409);
  if (installation.status !== "installed") {
    throw new PluginRuntimeError("Plugin execution is blocked until the installation is enabled and all required apps are connected.", "plugin_not_ready", 409);
  }
  if (installation.version !== manifest.version) throw new PluginRuntimeError("Plugin installation version is stale.", "plugin_version_stale", 409);
  const granted = new Set(Array.isArray(installation.granted_permissions) ? installation.granted_permissions : []);
  if (manifest.permissions.some((permission) => !granted.has(permission))) {
    throw new PluginRuntimeError("Plugin permission grant is incomplete.", "plugin_permission_mismatch", 403);
  }

  const requiredProviders = manifest.apps.filter((app) => app.required).map((app) => app.provider);
  if (requiredProviders.length) {
    const { data: bindings, error: bindingError } = await supabase
      .from("plugin_app_bindings")
      .select("provider")
      .eq("workspace_id", workspaceId)
      .eq("installation_id", installation.id);
    if (bindingError) throw new PluginRuntimeError("Plugin app bindings could not be verified.", "plugin_binding_check_failed", 500);
    const bound = new Set((bindings ?? []).map((row) => row.provider));
    if (requiredProviders.some((provider) => !bound.has(provider))) {
      throw new PluginRuntimeError("A required plugin app is not connected.", "plugin_required_app_missing", 409);
    }
  }

  const endpoint = new URL(manifest.mcp.url);
  await assertSafeMcpEndpoint(endpoint);
  return { workspaceId, installationId: installation.id, pluginId: catalog.id, slug: catalog.slug, manifest, endpoint };
}

async function fetchTools(context: PluginRuntimeContext) {
  const discoverResult = await mcpPost(context.endpoint, "server/discover", {});
  if (!isRecord(discoverResult)) throw new PluginRuntimeError("MCP discovery response is invalid.", "mcp_discovery_invalid", 502);
  const supportedVersions = Array.isArray(discoverResult.supportedVersions) ? discoverResult.supportedVersions : [];
  if (!supportedVersions.includes(MCP_PROTOCOL_VERSION)) {
    throw new PluginRuntimeError("MCP server does not support Orbit's required protocol version.", "mcp_protocol_unsupported", 409);
  }
  const capabilities = isRecord(discoverResult.capabilities) ? discoverResult.capabilities : {};
  if (!("tools" in capabilities)) throw new PluginRuntimeError("MCP server does not advertise tool capability.", "mcp_tools_unsupported", 409);

  const listResult = await mcpPost(context.endpoint, "tools/list", {});
  if (!isRecord(listResult) || !Array.isArray(listResult.tools)) {
    throw new PluginRuntimeError("MCP tool list is invalid.", "mcp_tools_invalid", 502);
  }
  if (listResult.tools.length > MAX_TOOLS) throw new PluginRuntimeError("MCP server exposes too many tools.", "mcp_tool_limit", 502);
  const tools = listResult.tools.map(normalizeTool).filter((tool): tool is RuntimeTool => Boolean(tool));
  if (tools.length !== listResult.tools.length) {
    // Invalid or unsafe tool definitions are excluded rather than trusted.
  }
  return tools.sort((a, b) => a.name.localeCompare(b.name));
}

async function persistTools(context: PluginRuntimeContext, tools: RuntimeTool[]) {
  const admin = createAdminClient();
  if (!admin) throw new PluginRuntimeError("Orbit plugin audit storage is unavailable.", "plugin_admin_unavailable", 503);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + TOOL_CACHE_MS).toISOString();
  const rows = tools.map((tool) => ({
    workspace_id: context.workspaceId,
    installation_id: context.installationId,
    plugin_id: context.pluginId,
    tool_name: tool.name,
    title: tool.title,
    description: tool.description,
    input_schema: tool.inputSchema,
    annotations: tool.annotations,
    source_hash: digestPluginValue(tool),
    enabled: true,
    discovered_at: now.toISOString(),
    expires_at: expiresAt,
  }));

  const { error: deleteError } = await admin
    .from("plugin_runtime_tools")
    .delete()
    .eq("workspace_id", context.workspaceId)
    .eq("installation_id", context.installationId);
  if (deleteError) throw new PluginRuntimeError("Old plugin tool cache could not be cleared.", "plugin_tool_cache_failed", 500);
  if (rows.length) {
    const { error } = await admin.from("plugin_runtime_tools").insert(rows);
    if (error) throw new PluginRuntimeError("Plugin tool cache could not be saved.", "plugin_tool_cache_failed", 500);
  }
}

export async function discoverPluginTools(supabase: SupabaseClient, workspaceId: string, slug: string) {
  const context = await requireRuntimeContext(supabase, workspaceId, slug);
  const tools = await fetchTools(context);
  await persistTools(context, tools);
  return { context, tools };
}

export async function getCachedOrDiscoverPluginTools(supabase: SupabaseClient, workspaceId: string, slug: string) {
  const context = await requireRuntimeContext(supabase, workspaceId, slug);
  const { data, error } = await supabase
    .from("plugin_runtime_tools")
    .select("tool_name,title,description,input_schema,annotations,expires_at")
    .eq("workspace_id", workspaceId)
    .eq("installation_id", context.installationId)
    .eq("enabled", true)
    .gt("expires_at", new Date().toISOString())
    .order("tool_name", { ascending: true });
  if (!error && data?.length) {
    const tools = data.map((row) => normalizeTool({
      name: row.tool_name,
      title: row.title,
      description: row.description,
      inputSchema: row.input_schema,
      annotations: row.annotations,
    })).filter((tool): tool is RuntimeTool => Boolean(tool));
    if (tools.length) return { context, tools, cached: true };
  }
  const tools = await fetchTools(context);
  await persistTools(context, tools);
  return { context, tools, cached: false };
}

async function assertRateLimit(admin: SupabaseClient, workspaceId: string, actorUserId: string | null) {
  const since = new Date(Date.now() - 60_000).toISOString();
  let query = admin
    .from("plugin_tool_invocations")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .gte("created_at", since);
  if (actorUserId) query = query.eq("actor_user_id", actorUserId);
  const { count, error } = await query;
  if (error) throw new PluginRuntimeError("Plugin rate limit could not be verified.", "plugin_rate_limit_check_failed", 503);
  if ((count ?? 0) >= MAX_CALLS_PER_MINUTE) throw new PluginRuntimeError("Plugin invocation rate limit reached.", "plugin_rate_limited", 429);
}

export async function invokePluginTool(input: {
  supabase: SupabaseClient;
  workspaceId: string;
  slug: string;
  toolName: string;
  arguments: Record<string, unknown>;
  actorUserId: string | null;
  actionKeyId?: string | null;
  requestId?: string;
}) {
  if (!TOOL_NAME_PATTERN.test(input.toolName)) throw new PluginRuntimeError("Invalid plugin tool name.", "plugin_tool_name_invalid", 400);
  if (!isRecord(input.arguments) || byteLength(input.arguments) > MAX_ARGUMENT_BYTES) {
    throw new PluginRuntimeError("Plugin tool arguments are invalid or too large.", "plugin_arguments_invalid", 400);
  }
  const requestId = input.requestId ?? randomUUID();
  const { context, tools } = await getCachedOrDiscoverPluginTools(input.supabase, input.workspaceId, input.slug);
  const tool = tools.find((candidate) => candidate.name === input.toolName);
  if (!tool) throw new PluginRuntimeError("Plugin tool is not available.", "plugin_tool_not_found", 404);

  const admin = createAdminClient();
  if (!admin) throw new PluginRuntimeError("Orbit plugin audit storage is unavailable.", "plugin_admin_unavailable", 503);
  await assertRateLimit(admin, input.workspaceId, input.actorUserId);
  const inputDigest = digestPluginValue(input.arguments);
  const startedAt = Date.now();

  const { data: invocation, error: insertError } = await admin
    .from("plugin_tool_invocations")
    .insert({
      request_id: requestId,
      workspace_id: input.workspaceId,
      installation_id: context.installationId,
      plugin_id: context.pluginId,
      action_key_id: input.actionKeyId ?? null,
      actor_user_id: input.actorUserId,
      tool_name: tool.name,
      status: "requested",
      input_digest: inputDigest,
    })
    .select("id")
    .single();
  if (insertError || !invocation) {
    if (insertError?.code === "23505") throw new PluginRuntimeError("Plugin request ID has already been used.", "plugin_request_replayed", 409);
    throw new PluginRuntimeError("Plugin invocation audit could not start.", "plugin_audit_start_failed", 500);
  }

  try {
    const headers = {
      "Mcp-Name": encodeHeaderValue(tool.name),
      ...customHeadersForTool(tool, input.arguments),
    };
    const result = await mcpPost(context.endpoint, "tools/call", { name: tool.name, arguments: input.arguments }, headers);
    const durationMs = Math.min(Date.now() - startedAt, 120_000);
    const outputDigest = digestPluginValue(result);
    await admin.from("plugin_tool_invocations").update({
      status: "succeeded",
      output_digest: outputDigest,
      duration_ms: durationMs,
      completed_at: new Date().toISOString(),
    }).eq("id", invocation.id);
    await admin.from("plugin_installation_events").insert({
      workspace_id: input.workspaceId,
      plugin_id: context.pluginId,
      installation_id: context.installationId,
      event_type: "tool_invoked",
      actor_user_id: input.actorUserId,
      payload: { tool: tool.name, requestId, status: "succeeded", durationMs },
    });
    return { requestId, result };
  } catch (error) {
    const runtimeError = error instanceof PluginRuntimeError ? error : new PluginRuntimeError("Plugin tool invocation failed.", "plugin_invocation_failed", 502);
    const durationMs = Math.min(Date.now() - startedAt, 120_000);
    await admin.from("plugin_tool_invocations").update({
      status: runtimeError.httpStatus === 403 || runtimeError.httpStatus === 409 ? "denied" : "failed",
      duration_ms: durationMs,
      error_code: runtimeError.code.slice(0, 100),
      completed_at: new Date().toISOString(),
    }).eq("id", invocation.id);
    await admin.from("plugin_installation_events").insert({
      workspace_id: input.workspaceId,
      plugin_id: context.pluginId,
      installation_id: context.installationId,
      event_type: "tool_denied",
      actor_user_id: input.actorUserId,
      payload: { tool: tool.name, requestId, status: "failed", code: runtimeError.code },
    });
    throw runtimeError;
  }
}

export async function authorizePluginOperator(admin: SupabaseClient, token: string, scope: "plugins.read" | "plugins.invoke") {
  const { data, error } = await admin.rpc("orbit_plugin_operator_authorize", {
    action_token: token,
    required_scope: scope,
  });
  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row || typeof row.workspace_id !== "string" || typeof row.actor_id !== "string" || typeof row.action_key_id !== "string") {
    throw new PluginRuntimeError("Orbit Operator key is invalid, expired, revoked, or missing plugin access.", "plugin_operator_unauthorized", 401);
  }
  return { workspaceId: row.workspace_id as string, actorUserId: row.actor_id as string, actionKeyId: row.action_key_id as string };
}
