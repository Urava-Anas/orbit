import "server-only";

import { decryptIntegrationSecret } from "@/lib/integration-connections";
import { createAdminClient } from "@/lib/supabase/admin";

type MetaAsset = {
  kind?: string;
  id?: string;
  page_id?: string | null;
};

type InsightMetric = {
  name?: string;
  value?: number | string;
  values?: Array<{ value?: number | string }>;
};

type InsightsResponse = {
  data?: InsightMetric[];
  error?: { message?: string };
};

function graphVersion() {
  return process.env.META_GRAPH_API_VERSION?.trim() || "v25.0";
}

async function metaCredential(workspaceId: string) {
  const admin = createAdminClient();
  if (!admin) throw new Error("Instagram insights database access is unavailable.");

  const { data: connection, error: connectionError } = await admin
    .from("integration_connections")
    .select("status,selected_assets,metadata")
    .eq("workspace_id", workspaceId)
    .eq("provider", "meta")
    .maybeSingle();
  if (connectionError || !connection || connection.status !== "connected") {
    throw new Error("Meta is not connected for Instagram insights.");
  }

  const metadata = (connection.metadata ?? {}) as Record<string, unknown>;
  const capabilities = Array.isArray(metadata.verifiedCapabilities)
    ? metadata.verifiedCapabilities.map(String)
    : [];
  if (!capabilities.includes("instagram.insights.read")) {
    throw new Error("The Meta connection has not verified Instagram insights permission.");
  }

  const assets = Array.isArray(connection.selected_assets) ? (connection.selected_assets as MetaAsset[]) : [];
  const instagramAccounts = assets.filter((asset) => asset.kind === "instagram_account" && asset.id && asset.page_id);
  if (instagramAccounts.length !== 1) {
    throw new Error(instagramAccounts.length ? "Select one Instagram account before metrics ingestion." : "No linked Instagram account is available for metrics.");
  }

  const instagram = instagramAccounts[0];
  const { data: credential, error: credentialError } = await admin
    .from("integration_asset_credentials")
    .select("credential_ciphertext")
    .eq("workspace_id", workspaceId)
    .eq("provider", "meta")
    .eq("asset_kind", "facebook_page")
    .eq("asset_id", instagram.page_id as string)
    .maybeSingle();
  if (credentialError || !credential?.credential_ciphertext) throw new Error("Instagram insights credential is unavailable. Reconnect Meta.");

  return {
    admin,
    token: decryptIntegrationSecret(credential.credential_ciphertext),
  };
}

function metricValue(metric: InsightMetric | undefined) {
  const raw = metric?.value ?? metric?.values?.[0]?.value ?? 0;
  const value = Number(raw || 0);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

export async function captureInstagramMediaInsights(input: {
  workspaceId: string;
  contentId: string;
  publicationId: string;
  providerPostId: string;
}) {
  const { admin, token } = await metaCredential(input.workspaceId);
  const metrics = ["impressions", "reach", "likes", "comments", "shares", "saved", "total_interactions"];
  const query = new URLSearchParams({ metric: metrics.join(","), access_token: token });
  const response = await fetch(
    `https://graph.facebook.com/${graphVersion()}/${encodeURIComponent(input.providerPostId)}/insights?${query.toString()}`,
    { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(20_000) },
  );
  const payload = (await response.json().catch(() => ({}))) as InsightsResponse;
  if (!response.ok || payload.error) {
    throw new Error(payload.error?.message || `Instagram insights returned HTTP ${response.status}`);
  }

  const rows = payload.data ?? [];
  const byName = new Map(rows.filter((item) => item.name).map((item) => [String(item.name), item]));
  const likes = metricValue(byName.get("likes"));
  const comments = metricValue(byName.get("comments"));
  const shares = metricValue(byName.get("shares"));
  const saved = metricValue(byName.get("saved"));
  const totalInteractions = metricValue(byName.get("total_interactions"));
  const engagements = totalInteractions || likes + comments + shares + saved;

  const { error } = await admin.from("content_metric_snapshots").insert({
    workspace_id: input.workspaceId,
    content_id: input.contentId,
    publication_id: input.publicationId,
    impressions: metricValue(byName.get("impressions")),
    reach: metricValue(byName.get("reach")),
    engagements,
    clicks: 0,
    leads: 0,
    raw_metrics: {
      provider: "instagram",
      provider_post_id: input.providerPostId,
      metrics: rows,
      normalized: { likes, comments, shares, saved, total_interactions: totalInteractions },
      attribution_note: "Organic Instagram media insights do not by themselves prove clicks or leads; those remain zero without a separate attribution source.",
    },
    captured_at: new Date().toISOString(),
  });
  if (error) throw new Error(`Instagram metric snapshot could not be saved: ${error.message}`);

  return { impressions: metricValue(byName.get("impressions")), reach: metricValue(byName.get("reach")), engagements };
}
