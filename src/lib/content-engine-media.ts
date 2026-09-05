import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

const DRAFT_BUCKET = "content-engine-drafts";
const PUBLISH_BUCKET = "content-engine-publish";
const IMAGE_MODEL = "gpt-image-2";

type DraftMediaInput = {
  id: string;
  workspace_id: string;
  channel: string;
  format: string;
  title: string;
  hook: string | null;
  body: string;
  cta: string | null;
  media_brief: string | null;
};

type ImageResponse = {
  data?: Array<{ b64_json?: string }>;
  error?: { message?: string; code?: string; type?: string };
};

type MediaGenerationClaim = {
  asset_id: string;
  claimed: boolean;
  reused: boolean;
  asset_status: string;
};

function safeSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function visualPrompt(draft: DraftMediaInput) {
  const brief = draft.media_brief?.trim() || "Create a strong editorial visual that makes the post idea immediately understandable.";
  return `Create the finished visual asset for an Instagram feed post by Urava, a business systems and automation company.

POST IDEA
Title: ${draft.title}
Hook: ${draft.hook || "No separate hook"}
Body context: ${draft.body.slice(0, 1800)}
CTA context: ${draft.cta || "No CTA text required in the image"}
Creative brief: ${brief}

ART DIRECTION
- Premium, modern, editorial business design; polished enough for a founder-led technology brand.
- Strong hierarchy, confident composition, generous negative space, realistic depth and intentional lighting.
- Avoid generic stock-photo energy, fake dashboards, random code, excessive neon, clutter and cheesy AI imagery.
- Do not invent client logos, partner logos, awards, testimonials, prices, metrics, screenshots or claims.
- If the concept benefits from text, use only one short, legible headline derived from the title/hook. Never add paragraphs, tiny labels or invented copy.
- No watermarks. No social-media chrome. No fake interface controls.
- Compose for a square Instagram feed image and keep critical elements away from edges.
- The visual should still make sense if the generated text layer is imperfect; imagery/composition carry the idea.

Return one finished image only.`;
}

async function generateImageBytes(prompt: string) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("AI media generation is not configured.");

  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: IMAGE_MODEL,
        prompt,
        n: 1,
        size: "1024x1024",
        quality: "medium",
        output_format: "jpeg",
        output_compression: 88,
        background: "opaque",
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(150_000),
    });
  } catch (error) {
    console.error("OpenAI Content Engine image request failed before a provider response", error);
    throw new Error("AI media generation timed out or could not reach the provider.");
  }

  const payload = (await response.json().catch(() => ({}))) as ImageResponse;
  if (!response.ok) {
    console.error("OpenAI Content Engine image generation failed", {
      status: response.status,
      code: payload.error?.code ?? null,
      type: payload.error?.type ?? null,
      requestId: response.headers.get("x-request-id"),
    });
    throw new Error(`AI media generation failed with provider status ${response.status}.`);
  }

  const encoded = payload.data?.[0]?.b64_json;
  if (!encoded) throw new Error("AI media generation returned no usable image data.");
  return Buffer.from(encoded, "base64");
}

export async function generateInstagramDraftAsset(draft: DraftMediaInput) {
  if (draft.channel !== "instagram") throw new Error("Instagram media generation is limited to Instagram drafts.");

  const admin = createAdminClient();
  if (!admin) throw new Error("Content media storage is unavailable.");

  const prompt = visualPrompt(draft);
  const { data: claimRows, error: claimError } = await admin.rpc("claim_content_media_generation", {
    p_workspace_id: draft.workspace_id,
    p_content_id: draft.id,
    p_prompt: prompt,
    p_generation_metadata: {
      model: IMAGE_MODEL,
      size: "1024x1024",
      quality: "medium",
      output_format: "jpeg",
    },
  });
  const claim = (Array.isArray(claimRows) ? claimRows[0] : claimRows) as MediaGenerationClaim | null;
  if (claimError || !claim?.asset_id) {
    console.error("Content Engine could not claim Instagram media generation", {
      workspaceId: draft.workspace_id,
      contentId: draft.id,
      error: claimError,
    });
    throw new Error("Instagram media generation could not acquire its safe execution lease.");
  }
  if (!claim.claimed) return { assetId: claim.asset_id, reused: true };

  const assetId = claim.asset_id;
  try {
    const image = await generateImageBytes(prompt);
    const objectPath = `${safeSegment(draft.workspace_id)}/${safeSegment(draft.id)}/${assetId}.jpg`;
    const { error: uploadError } = await admin.storage.from(DRAFT_BUCKET).upload(objectPath, image, {
      contentType: "image/jpeg",
      upsert: false,
      cacheControl: "3600",
    });
    if (uploadError) {
      console.error("Generated Content Engine image could not be stored", {
        workspaceId: draft.workspace_id,
        contentId: draft.id,
        assetId,
        error: uploadError,
      });
      throw new Error("Generated image could not be stored safely.");
    }

    const { data: updated, error: updateError } = await admin
      .from("content_assets")
      .update({
        status: "ready",
        storage_bucket: DRAFT_BUCKET,
        storage_path: objectPath,
        generation_metadata: {
          model: IMAGE_MODEL,
          size: "1024x1024",
          quality: "medium",
          output_format: "jpeg",
          generated_at: new Date().toISOString(),
        },
      })
      .eq("id", assetId)
      .eq("workspace_id", draft.workspace_id)
      .eq("status", "generating")
      .select("id")
      .maybeSingle();
    if (updateError || !updated) throw new Error("Generated image state could not be finalized safely.");

    return { assetId, reused: false };
  } catch (error) {
    const safeFailure = error instanceof Error ? error.message.slice(0, 500) : "Unknown media generation failure";
    await admin
      .from("content_assets")
      .update({
        status: "failed",
        generation_metadata: {
          model: IMAGE_MODEL,
          failed_at: new Date().toISOString(),
          error: safeFailure,
        },
      })
      .eq("id", assetId)
      .eq("workspace_id", draft.workspace_id)
      .eq("status", "generating");
    throw error;
  }
}

export async function promoteApprovedAssetForPublishing(workspaceId: string, contentId: string) {
  const admin = createAdminClient();
  if (!admin) throw new Error("Content media storage is unavailable.");

  const { data: asset, error } = await admin
    .from("content_assets")
    .select("id,storage_bucket,storage_path,mime_type,public_url")
    .eq("workspace_id", workspaceId)
    .eq("content_id", contentId)
    .eq("asset_type", "image")
    .eq("status", "ready")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !asset) throw new Error("A ready Instagram image is required before publishing.");
  if (asset.public_url) return asset.public_url as string;
  if (!asset.storage_bucket || !asset.storage_path) throw new Error("Approved image storage reference is incomplete.");

  const { data: file, error: downloadError } = await admin.storage.from(asset.storage_bucket).download(asset.storage_path);
  if (downloadError || !file) {
    console.error("Approved Content Engine image could not be read from draft storage", {
      workspaceId,
      contentId,
      assetId: asset.id,
      error: downloadError,
    });
    throw new Error("Approved image could not be read from draft storage.");
  }

  const targetPath = `${safeSegment(workspaceId)}/${safeSegment(contentId)}/${asset.id}.jpg`;
  const bytes = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await admin.storage.from(PUBLISH_BUCKET).upload(targetPath, bytes, {
    contentType: asset.mime_type || "image/jpeg",
    upsert: true,
    cacheControl: "31536000",
  });
  if (uploadError) {
    console.error("Approved Content Engine image could not be promoted", {
      workspaceId,
      contentId,
      assetId: asset.id,
      error: uploadError,
    });
    throw new Error("Approved image could not be promoted for publishing.");
  }

  const { data: publicData } = admin.storage.from(PUBLISH_BUCKET).getPublicUrl(targetPath);
  const publicUrl = publicData.publicUrl;
  if (!publicUrl) throw new Error("Approved image did not receive a public delivery URL.");

  const { data: saved, error: saveError } = await admin
    .from("content_assets")
    .update({
      storage_bucket: PUBLISH_BUCKET,
      storage_path: targetPath,
      public_url: publicUrl,
      generation_metadata: { promoted_at: new Date().toISOString() },
    })
    .eq("id", asset.id)
    .eq("workspace_id", workspaceId)
    .eq("status", "ready")
    .select("id")
    .maybeSingle();
  if (saveError || !saved) throw new Error("Approved image public URL could not be saved safely.");

  return publicUrl;
}
