import "server-only";

import { decryptIntegrationSecret } from "@/lib/integration-connections";
import { createAdminClient } from "@/lib/supabase/admin";

type PublicationJob = {
  id: string;
  workspace_id: string;
  content_id: string;
  provider_post_id: string | null;
};

type LinkedInAsset = {
  kind?: string;
  id?: string;
  urn?: string;
  name?: string | null;
};

type Draft = {
  channel: string;
  body: string;
  cta: string | null;
};

function apiVersion() {
  return process.env.LINKEDIN_API_VERSION?.trim() || "202607";
}

function messageFor(draft: Draft) {
  return [draft.body.trim(), draft.cta?.trim()].filter(Boolean).join("\n\n").slice(0, 3000);
}

async function resolveLinkedInCredential(workspaceId: string) {
  const admin = createAdminClient();
  if (!admin) throw new Error("LinkedIn publishing database access is unavailable.");

  const { data: connection, error } = await admin
    .from("integration_connections")
    .select("status,access_token_ciphertext,token_expires_at,selected_assets,metadata")
    .eq("workspace_id", workspaceId)
    .eq("provider", "linkedin")
    .maybeSingle();
  if (error || !connection || connection.status !== "connected") {
    throw new Error("LinkedIn is not connected for this workspace.");
  }
  if (!connection.access_token_ciphertext) {
    throw new Error("LinkedIn access credential is unavailable. Reconnect LinkedIn.");
  }
  if (connection.token_expires_at && new Date(connection.token_expires_at).getTime() <= Date.now() + 60_000) {
    throw new Error("LinkedIn access has expired. Reconnect LinkedIn before publishing.");
  }

  const metadata = (connection.metadata ?? {}) as Record<string, unknown>;
  const capabilities = Array.isArray(metadata.verifiedCapabilities)
    ? metadata.verifiedCapabilities.map(String)
    : [];
  if (!capabilities.includes("linkedin.publish.member")) {
    throw new Error("LinkedIn member publishing capability has not been verified.");
  }

  const assets = Array.isArray(connection.selected_assets)
    ? (connection.selected_assets as LinkedInAsset[])
    : [];
  const members = assets.filter((asset) => asset.kind === "linkedin_member" && asset.id);
  if (members.length !== 1) {
    throw new Error(members.length
      ? "Select exactly one LinkedIn member identity before automatic publishing."
      : "No LinkedIn member identity is available for publishing.");
  }
  const member = members[0];

  return {
    admin,
    memberName: member.name ?? null,
    memberUrn: member.urn || `urn:li:person:${member.id}`,
    accessToken: decryptIntegrationSecret(connection.access_token_ciphertext),
  };
}

export async function publishLinkedInJob(job: PublicationJob) {
  if (job.provider_post_id) {
    return {
      providerPostId: job.provider_post_id,
      providerPostUrl: `https://www.linkedin.com/feed/update/${job.provider_post_id}/`,
      memberName: null as string | null,
      reused: true,
    };
  }

  const { admin, memberName, memberUrn, accessToken } = await resolveLinkedInCredential(job.workspace_id);
  const { data: draft, error } = await admin
    .from("content_drafts")
    .select("channel,body,cta,status")
    .eq("workspace_id", job.workspace_id)
    .eq("id", job.content_id)
    .maybeSingle();
  if (error || !draft) throw new Error("Approved LinkedIn content could not be loaded.");
  if (draft.channel !== "linkedin") throw new Error("LinkedIn worker received a non-LinkedIn content item.");
  if (draft.status !== "approved") throw new Error("Founder approval is required before LinkedIn publishing.");

  const commentary = messageFor(draft as Draft);
  if (!commentary) throw new Error("LinkedIn content is empty.");

  const response = await fetch("https://api.linkedin.com/rest/posts", {
    method: "POST",
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "Linkedin-Version": apiVersion(),
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify({
      author: memberUrn,
      commentary,
      visibility: "PUBLIC",
      distribution: {
        feedDistribution: "MAIN_FEED",
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    }),
  });

  if (response.status !== 201) {
    // Never persist or expose provider response bodies because they can contain account details.
    throw new Error(`LinkedIn Posts API rejected the publish request (HTTP ${response.status}).`);
  }
  const providerPostId = response.headers.get("x-restli-id")?.trim() || null;
  if (!providerPostId) throw new Error("LinkedIn did not return a provider post ID.");

  return {
    providerPostId,
    providerPostUrl: `https://www.linkedin.com/feed/update/${providerPostId}/`,
    memberName,
    reused: false,
  };
}
