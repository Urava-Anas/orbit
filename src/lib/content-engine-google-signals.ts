import "server-only";

import {
  decryptIntegrationSecret,
  encryptIntegrationSecret,
} from "@/lib/integration-connections";
import { localDate } from "@/lib/content-engine";
import { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>;
type GoogleProvider = "google_search_console" | "google_analytics";

type Connection = {
  workspace_id: string;
  provider: GoogleProvider;
  status: string;
  access_token_ciphertext: string | null;
  refresh_token_ciphertext: string | null;
  token_expires_at: string | null;
  selected_assets: unknown;
  metadata: Record<string, unknown> | null;
};

type Asset = { kind?: string; id?: string; name?: string };
type SearchRow = { keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number };
type AnalyticsRow = {
  dimensionValues?: Array<{ value?: string }>;
  metricValues?: Array<{ value?: string }>;
};

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function googleClientCredentials() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID ?? process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Google OAuth refresh credentials are not configured.");
  return { clientId, clientSecret };
}

async function googleFetch(url: string, accessToken: string, init: RequestInit = {}) {
  return fetch(url, {
    ...init,
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

async function validGoogleAccessToken(admin: AdminClient, connection: Connection) {
  if (!connection.access_token_ciphertext) throw new Error("Google access credential is unavailable.");
  const expires = connection.token_expires_at ? new Date(connection.token_expires_at).getTime() : Number.POSITIVE_INFINITY;
  if (expires > Date.now() + 2 * 60_000) {
    return decryptIntegrationSecret(connection.access_token_ciphertext);
  }
  if (!connection.refresh_token_ciphertext) {
    throw new Error("Google access expired and no refresh credential is available. Reconnect the Google source.");
  }

  const { clientId, clientSecret } = googleClientCredentials();
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: decryptIntegrationSecret(connection.refresh_token_ciphertext),
      grant_type: "refresh_token",
    }),
  });
  if (!response.ok) throw new Error(`Google token refresh failed (HTTP ${response.status}).`);
  const payload = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!payload.access_token) throw new Error("Google token refresh returned no access token.");

  const expiresAt = new Date(Date.now() + Math.max(60, payload.expires_in ?? 3600) * 1000).toISOString();
  const { error } = await admin
    .from("integration_connections")
    .update({
      access_token_ciphertext: encryptIntegrationSecret(payload.access_token),
      token_expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("workspace_id", connection.workspace_id)
    .eq("provider", connection.provider);
  if (error) throw new Error("Refreshed Google access could not be stored securely.");
  return payload.access_token;
}

function assets(connection: Connection, kind: string) {
  const rows = Array.isArray(connection.selected_assets) ? (connection.selected_assets as Asset[]) : [];
  return rows.filter((asset) => asset.kind === kind && asset.id).slice(0, 5);
}

function capabilities(connection: Connection) {
  const metadata = (connection.metadata ?? {}) as Record<string, unknown>;
  return Array.isArray(metadata.verifiedCapabilities) ? metadata.verifiedCapabilities.map(String) : [];
}

async function alreadyLearned(admin: AdminClient, workspaceId: string, learnedOn: string, provider: GoogleProvider) {
  const { data, error } = await admin
    .from("content_learning_notes")
    .select("id,source_metrics")
    .eq("workspace_id", workspaceId)
    .eq("learned_on", learnedOn)
    .limit(30);
  if (error) throw new Error("Existing Content Engine source signals could not be checked.");
  return (data ?? []).some((row) => {
    const source = (row.source_metrics ?? {}) as Record<string, unknown>;
    return source.provider === provider;
  });
}

async function insertSignal(
  admin: AdminClient,
  input: {
    workspaceId: string;
    learnedOn: string;
    signalType: "search" | "traffic";
    insight: string;
    action: string;
    confidence: number;
    sourceMetrics: Record<string, unknown>;
  },
) {
  const { data, error } = await admin
    .from("content_learning_notes")
    .insert({
      workspace_id: input.workspaceId,
      learned_on: input.learnedOn,
      signal_type: input.signalType,
      insight: input.insight.slice(0, 2000),
      action: input.action.slice(0, 2000),
      confidence: Math.max(0, Math.min(1, input.confidence)),
      source_metrics: input.sourceMetrics,
      created_by: null,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error("Content Engine source signal could not be saved.");

  const { error: auditError } = await admin.from("content_review_events").insert({
    workspace_id: input.workspaceId,
    batch_id: null,
    content_id: null,
    event_type: "learning_recorded",
    actor_id: null,
    details: {
      learning_note_id: data.id,
      learned_on: input.learnedOn,
      source: input.sourceMetrics.provider,
      aggregate_only: true,
    },
  });
  if (auditError) console.error("Google Content Engine signal saved without audit companion", { workspaceId: input.workspaceId, auditError });
}

async function syncSearchConsole(admin: AdminClient, connection: Connection, timezone: string) {
  const learnedOn = localDate(timezone);
  if (await alreadyLearned(admin, connection.workspace_id, learnedOn, connection.provider)) return "existing" as const;
  if (!capabilities(connection).includes("search_console.read")) return "capability_missing" as const;
  const properties = assets(connection, "search_console_property");
  if (!properties.length) return "asset_missing" as const;

  const accessToken = await validGoogleAccessToken(admin, connection);
  const end = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  const start = new Date(end.getTime() - 27 * 24 * 60 * 60 * 1000);
  const rows: Array<{ query: string; clicks: number; impressions: number; ctr: number; property: string }> = [];

  for (const property of properties) {
    const response = await googleFetch(
      `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property.id as string)}/searchAnalytics/query`,
      accessToken,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: dateOnly(start),
          endDate: dateOnly(end),
          dimensions: ["query"],
          type: "web",
          dataState: "final",
          rowLimit: 10,
        }),
      },
    );
    if (!response.ok) throw new Error(`Search Console query failed (HTTP ${response.status}).`);
    const payload = (await response.json()) as { rows?: SearchRow[] };
    for (const row of payload.rows ?? []) {
      const query = row.keys?.[0]?.trim();
      if (!query) continue;
      rows.push({
        query,
        clicks: Number(row.clicks ?? 0),
        impressions: Number(row.impressions ?? 0),
        ctr: Number(row.ctr ?? 0),
        property: property.name || property.id || "Search Console property",
      });
    }
  }

  rows.sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions);
  const top = rows.slice(0, 8);
  if (!top.length) return "no_data" as const;
  const topics = top.slice(0, 5).map((row) => row.query);
  await insertSignal(admin, {
    workspaceId: connection.workspace_id,
    learnedOn,
    signalType: "search",
    insight: `Current organic search demand is strongest around: ${topics.join(" · ")}.`,
    action: "Use these verified search-demand phrases as topic inspiration for the next content batch. Do not claim rankings, market size or causation from this signal alone.",
    confidence: Math.min(0.9, 0.55 + Math.min(0.35, top.reduce((sum, row) => sum + row.clicks, 0) / 200)),
    sourceMetrics: {
      provider: "google_search_console",
      aggregate_only: true,
      window_days: 28,
      data_state: "final",
      properties: [...new Set(top.map((row) => row.property))],
      top_queries: top,
    },
  });
  return "inserted" as const;
}

async function syncAnalytics(admin: AdminClient, connection: Connection, timezone: string) {
  const learnedOn = localDate(timezone);
  if (await alreadyLearned(admin, connection.workspace_id, learnedOn, connection.provider)) return "existing" as const;
  if (!capabilities(connection).includes("analytics.read")) return "capability_missing" as const;
  const properties = assets(connection, "google_analytics_property");
  if (!properties.length) return "asset_missing" as const;

  const accessToken = await validGoogleAccessToken(admin, connection);
  const rows: Array<{ page: string; views: number; users: number; keyEvents: number; property: string }> = [];

  for (const property of properties) {
    const propertyId = String(property.id).replace(/^properties\//, "");
    const response = await googleFetch(
      `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}:runReport`,
      accessToken,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dateRanges: [{ startDate: "28daysAgo", endDate: "yesterday" }],
          dimensions: [{ name: "unifiedPagePathScreen" }],
          metrics: [
            { name: "screenPageViews" },
            { name: "activeUsers" },
            { name: "keyEvents" },
          ],
          limit: "10",
          orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
        }),
      },
    );
    if (!response.ok) throw new Error(`Google Analytics report failed (HTTP ${response.status}).`);
    const payload = (await response.json()) as { rows?: AnalyticsRow[] };
    for (const row of payload.rows ?? []) {
      const page = row.dimensionValues?.[0]?.value?.trim();
      if (!page) continue;
      rows.push({
        page,
        views: Number(row.metricValues?.[0]?.value ?? 0),
        users: Number(row.metricValues?.[1]?.value ?? 0),
        keyEvents: Number(row.metricValues?.[2]?.value ?? 0),
        property: property.name || property.id || "Analytics property",
      });
    }
  }

  rows.sort((a, b) => b.views - a.views || b.keyEvents - a.keyEvents);
  const top = rows.slice(0, 8);
  if (!top.length) return "no_data" as const;
  const pages = top.slice(0, 5).map((row) => row.page);
  await insertSignal(admin, {
    workspaceId: connection.workspace_id,
    learnedOn,
    signalType: "traffic",
    insight: `The website pages attracting the most recent attention are: ${pages.join(" · ")}.`,
    action: "Use these aggregate page-performance signals to identify themes worth extending in upcoming content. Treat them as observed attention, not proof that a topic caused conversions.",
    confidence: Math.min(0.88, 0.52 + Math.min(0.36, top.reduce((sum, row) => sum + row.views, 0) / 5000)),
    sourceMetrics: {
      provider: "google_analytics",
      aggregate_only: true,
      window_days: 28,
      properties: [...new Set(top.map((row) => row.property))],
      top_pages: top,
    },
  });
  return "inserted" as const;
}

export async function syncConnectedGoogleContentSignals() {
  const admin = createAdminClient();
  if (!admin) throw new Error("Content Engine signal database is unavailable.");

  const { data: connectionRows, error } = await admin
    .from("integration_connections")
    .select("workspace_id,provider,status,access_token_ciphertext,refresh_token_ciphertext,token_expires_at,selected_assets,metadata")
    .in("provider", ["google_search_console", "google_analytics"])
    .eq("status", "connected")
    .order("workspace_id", { ascending: true })
    .limit(100);
  if (error) throw new Error("Connected Google Content Engine sources could not be listed.");

  const connections = (connectionRows ?? []) as Connection[];
  const workspaceIds = [...new Set(connections.map((connection) => connection.workspace_id))];
  const { data: profileRows, error: profileError } = workspaceIds.length
    ? await admin
        .from("content_brand_profiles")
        .select("workspace_id,timezone")
        .in("workspace_id", workspaceIds)
    : { data: [], error: null };
  if (profileError) throw new Error("Content Engine workspace timezones could not be loaded.");
  const timezoneByWorkspace = new Map((profileRows ?? []).map((row) => [String(row.workspace_id), String(row.timezone || "UTC")]));

  const results: Array<{ workspaceId: string; provider: GoogleProvider; status: string }> = [];
  for (const connection of connections) {
    const timezone = timezoneByWorkspace.get(connection.workspace_id) || "UTC";
    try {
      const status = connection.provider === "google_search_console"
        ? await syncSearchConsole(admin, connection, timezone)
        : await syncAnalytics(admin, connection, timezone);
      results.push({ workspaceId: connection.workspace_id, provider: connection.provider, status });
    } catch (syncError) {
      console.error("Content Engine aggregate Google signal sync failed safely", {
        workspaceId: connection.workspace_id,
        provider: connection.provider,
        error: syncError,
      });
      results.push({ workspaceId: connection.workspace_id, provider: connection.provider, status: "failed" });
    }
  }

  return results;
}
