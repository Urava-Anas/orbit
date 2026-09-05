import "server-only";

import { decryptIntegrationSecret } from "@/lib/integration-connections";
import { createAdminClient } from "@/lib/supabase/admin";

type MetaAsset = {
  kind?: string;
  id?: string;
  username?: string | null;
  page_id?: string | null;
  page_name?: string | null;
};

type PublicationJob = {
  id: string;
  workspace_id: string;
  content_id: string;
  provider_post_id: string | null;
  provider_container_id: string | null;
  attempts: number;
};

type ContentDraft = {
  id: string;
  channel: string;
  title: string;
  body: string;
  cta: string | null;
};

type PublishResult = {
  providerPostId: string;
  providerPostUrl: string | null;
  username: string | null;
  containerId: string | null;
  reused: boolean;
};

type GraphResult = Record<string, unknown> & { id?: string; error?: { message?: string; code?: number; type?: string } };

function graphVersion() {
  return process.env.META_GRAPH_API_VERSION?.trim() || "v25.0";
}

function graphUrl(path: string) {
  return `https://graph.facebook.com/${graphVersion()}/${path.replace(/^\//, "")}`;
}

async function graphRequest(path: string, init: RequestInit = {}) {
  const response = await fetch(graphUrl(path), {
    ...init,
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
  });
  const payload = (await response.json().catch(() => ({}))) as GraphResult;
  if (!response.ok || payload.error) {
    const message = payload.error?.message || `Meta Graph API returned HTTP ${response.status}`;
    throw new Error(message);
  }
  return payload;
}

function captionFor(draft: ContentDraft) {
  const parts = [draft.body.trim(), draft.cta?.trim()].filter(Boolean);
  return parts.join("\n\n").slice(0, 2200);
}

async function sleep(milliseconds: number) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function resolveInstagramCredential(workspaceId: string) {
  const admin = createAdminClient();
  if (!admin) throw new Error("Instagram publishing database access is unavailable.");

  const { data: connection, error: connectionError } = await admin
    .from("integration_connections")
    .select("status,selected_assets,metadata")
    .eq("workspace_id", workspaceId)
    .eq("provider", "meta")
    .maybeSingle();
  if (connectionError || !connection || connection.status !== "connected") {
    throw new Error("Meta is not connected and publish-ready for this workspace.");
  }

  const metadata = (connection.metadata ?? {}) as Record<string, unknown>;
  const capabilities = Array.isArray(metadata.verifiedCapabilities)
    ? metadata.verifiedCapabilities.map(String)
    : [];
  if (!capabilities.includes("instagram.publish")) {
    throw new Error("The Meta connection has not verified Instagram publishing capability.");
  }

  const assets = Array.isArray(connection.selected_assets) ? (connection.selected_assets as MetaAsset[]) : [];
  const instagramAccounts = assets.filter((asset) => asset.kind === "instagram_account" && asset.id && asset.page_id);
  if (!instagramAccounts.length) throw new Error("No linked Instagram Professional account is available for publishing.");
  if (instagramAccounts.length > 1) {
    throw new Error("More than one Instagram account is connected. Select the Urava account before enabling automatic publishing.");
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
  if (credentialError || !credential?.credential_ciphertext) {
    throw new Error("The linked Facebook Page publishing credential is unavailable. Reconnect Meta.");
  }

  return {
    admin,
    igUserId: instagram.id as string,
    username: instagram.username || null,
    pageToken: decryptIntegrationSecret(credential.credential_ciphertext),
  };
}

async function waitForContainer(containerId: string, pageToken: string) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const query = new URLSearchParams({ fields: "status_code,status", access_token: pageToken });
    const payload = await graphRequest(`${containerId}?${query.toString()}`);
    const statusCode = String(payload.status_code ?? "").toUpperCase();
    if (statusCode === "FINISHED") return;
    if (["ERROR", "EXPIRED"].includes(statusCode)) {
      throw new Error(`Instagram media container ${statusCode.toLowerCase()}: ${String(payload.status ?? "provider rejected media")}`);
    }
    await sleep(1500);
  }
  throw new Error("Instagram media container did not become publishable before the worker timeout.");
}

export async function publishInstagramJob(job: PublicationJob): Promise<PublishResult> {
  if (job.provider_post_id) {
    return {
      providerPostId: job.provider_post_id,
      providerPostUrl: null,
      username: null,
      containerId: job.provider_container_id,
      reused: true,
    };
  }

  const { admin, igUserId, username, pageToken } = await resolveInstagramCredential(job.workspace_id);
  const [{ data: draft, error: draftError }, { data: asset, error: assetError }] = await Promise.all([
    admin
      .from("content_drafts")
      .select("id,channel,title,body,cta")
      .eq("workspace_id", job.workspace_id)
      .eq("id", job.content_id)
      .maybeSingle(),
    admin
      .from("content_assets")
      .select("id,public_url,mime_type,status,asset_type")
      .eq("workspace_id", job.workspace_id)
      .eq("content_id", job.content_id)
      .eq("status", "ready")
      .eq("asset_type", "image")
      .not("public_url", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (draftError || !draft) throw new Error("Approved Instagram content could not be loaded.");
  if (draft.channel !== "instagram") throw new Error("Meta Instagram worker received a non-Instagram content item.");
  if (assetError || !asset?.public_url) throw new Error("Instagram requires a public approved image before publishing.");
  if (asset.mime_type && asset.mime_type !== "image/jpeg") throw new Error("The first Instagram publisher supports approved JPEG assets only.");

  let containerId = job.provider_container_id;
  if (!containerId) {
    const body = new URLSearchParams({
      image_url: asset.public_url,
      caption: captionFor(draft as ContentDraft),
      access_token: pageToken,
    });
    const container = await graphRequest(`${igUserId}/media`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    containerId = typeof container.id === "string" ? container.id : null;
    if (!containerId) throw new Error("Instagram did not return a media container ID.");

    await admin
      .from("content_publications")
      .update({ provider_container_id: containerId, provider_response: { container_created: true } })
      .eq("id", job.id)
      .eq("workspace_id", job.workspace_id);
  }

  await waitForContainer(containerId, pageToken);

  const publishBody = new URLSearchParams({ creation_id: containerId, access_token: pageToken });
  const published = await graphRequest(`${igUserId}/media_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: publishBody,
  });
  const providerPostId = typeof published.id === "string" ? published.id : null;
  if (!providerPostId) throw new Error("Instagram did not return a published media ID.");

  let providerPostUrl: string | null = null;
  try {
    const query = new URLSearchParams({ fields: "permalink", access_token: pageToken });
    const details = await graphRequest(`${providerPostId}?${query.toString()}`);
    providerPostUrl = typeof details.permalink === "string" ? details.permalink : null;
  } catch {
    // Publication is still confirmed by the returned media ID. Permalink enrichment is non-critical.
  }

  return { providerPostId, providerPostUrl, username, containerId, reused: false };
}
