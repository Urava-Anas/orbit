import "server-only";

import { decryptIntegrationSecret } from "@/lib/integration-connections";
import { createAdminClient } from "@/lib/supabase/admin";

type MetaAsset = {
  kind?: string;
  id?: string;
  name?: string | null;
};

type PublicationJob = {
  id: string;
  workspace_id: string;
  content_id: string;
  provider_post_id: string | null;
};

type Draft = {
  channel: string;
  body: string;
  cta: string | null;
};

type GraphPayload = Record<string, unknown> & {
  id?: string;
  post_id?: string;
  permalink_url?: string;
  error?: { message?: string };
};

function graphVersion() {
  return process.env.META_GRAPH_API_VERSION?.trim() || "v25.0";
}

function graphUrl(path: string) {
  return `https://graph.facebook.com/${graphVersion()}/${path.replace(/^\//, "")}`;
}

async function graphRequest(path: string, init: RequestInit) {
  const response = await fetch(graphUrl(path), {
    ...init,
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
  });
  const payload = (await response.json().catch(() => ({}))) as GraphPayload;
  if (!response.ok || payload.error) {
    throw new Error(payload.error?.message || `Meta Graph API returned HTTP ${response.status}`);
  }
  return payload;
}

function messageFor(draft: Draft) {
  return [draft.body.trim(), draft.cta?.trim()].filter(Boolean).join("\n\n").slice(0, 60_000);
}

async function resolveFacebookCredential(workspaceId: string) {
  const admin = createAdminClient();
  if (!admin) throw new Error("Facebook publishing database access is unavailable.");

  const { data: connection, error } = await admin
    .from("integration_connections")
    .select("status,selected_assets,metadata")
    .eq("workspace_id", workspaceId)
    .eq("provider", "meta")
    .maybeSingle();
  if (error || !connection || connection.status !== "connected") {
    throw new Error("Meta is not connected for this workspace.");
  }

  const metadata = (connection.metadata ?? {}) as Record<string, unknown>;
  const capabilities = Array.isArray(metadata.verifiedCapabilities)
    ? metadata.verifiedCapabilities.map(String)
    : [];
  if (!capabilities.includes("facebook.publish")) {
    throw new Error("The Meta connection has not verified Facebook Page publishing capability.");
  }

  const assets = Array.isArray(connection.selected_assets) ? (connection.selected_assets as MetaAsset[]) : [];
  const pages = assets.filter((asset) => asset.kind === "facebook_page" && asset.id);
  if (!pages.length) throw new Error("No Facebook Page is available for publishing.");
  if (pages.length > 1) {
    throw new Error("More than one Facebook Page is connected. Select one Page before enabling automatic publishing.");
  }
  const page = pages[0];

  const { data: credential, error: credentialError } = await admin
    .from("integration_asset_credentials")
    .select("credential_ciphertext")
    .eq("workspace_id", workspaceId)
    .eq("provider", "meta")
    .eq("asset_kind", "facebook_page")
    .eq("asset_id", page.id as string)
    .maybeSingle();
  if (credentialError || !credential?.credential_ciphertext) {
    throw new Error("The Facebook Page publishing credential is unavailable. Reconnect Meta.");
  }

  return {
    admin,
    pageId: page.id as string,
    pageName: page.name ?? null,
    pageToken: decryptIntegrationSecret(credential.credential_ciphertext),
  };
}

export async function publishFacebookJob(job: PublicationJob) {
  if (job.provider_post_id) {
    return {
      providerPostId: job.provider_post_id,
      providerPostUrl: null as string | null,
      pageName: null as string | null,
      reused: true,
    };
  }

  const { admin, pageId, pageName, pageToken } = await resolveFacebookCredential(job.workspace_id);
  const [{ data: draft, error: draftError }, { data: asset }] = await Promise.all([
    admin
      .from("content_drafts")
      .select("channel,body,cta")
      .eq("workspace_id", job.workspace_id)
      .eq("id", job.content_id)
      .maybeSingle(),
    admin
      .from("content_assets")
      .select("public_url,status,asset_type")
      .eq("workspace_id", job.workspace_id)
      .eq("content_id", job.content_id)
      .eq("status", "ready")
      .eq("asset_type", "image")
      .not("public_url", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (draftError || !draft) throw new Error("Approved Facebook content could not be loaded.");
  if (draft.channel !== "facebook") throw new Error("Facebook worker received a non-Facebook content item.");

  const message = messageFor(draft as Draft);
  let published: GraphPayload;
  if (asset?.public_url) {
    published = await graphRequest(`${pageId}/photos`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        url: asset.public_url,
        caption: message,
        published: "true",
        access_token: pageToken,
      }),
    });
  } else {
    published = await graphRequest(`${pageId}/feed`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ message, access_token: pageToken }),
    });
  }

  const providerPostId = typeof published.post_id === "string"
    ? published.post_id
    : typeof published.id === "string"
      ? published.id
      : null;
  if (!providerPostId) throw new Error("Facebook did not return a published post ID.");

  let providerPostUrl: string | null = null;
  try {
    const query = new URLSearchParams({ fields: "permalink_url", access_token: pageToken });
    const details = await graphRequest(`${providerPostId}?${query.toString()}`, { method: "GET" });
    providerPostUrl = typeof details.permalink_url === "string" ? details.permalink_url : null;
  } catch {
    // Provider post ID is sufficient confirmation; permalink enrichment is optional.
  }

  return { providerPostId, providerPostUrl, pageName, reused: false };
}
