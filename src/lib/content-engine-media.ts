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
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured for media generation.");

  const response = await fetch("https://api.openai.com/v1/images/generations", {
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

  const payload = (await response.json().catch(() => ({}))) as ImageResponse;
  if (!response.ok) {
    const code = payload.error?.code ? ` [${payload.error.code}]` : "";
    throw new Error(`Image generation failed${code}: ${payload.error?.message || `HTTP ${response.status}`}`);
  }

  const encoded = payload.data?.[0]?.b64_json;
  if (!encoded) throw new Error("Image generation returned no image data.");
  return Buffer.from(encoded, "base64");
}

export async function generateInstagramDraftAsset(draft: DraftMediaInput) {
  if (draft.channel !== "instagram") throw new Error("Instagram media generator received a non-Instagram draft.");

  const admin = createAdminClient();
  if (!admin) throw new Error("Content media storage is unavailable.");

  const { data: existing } = await admin
    .from("content_assets")
    .select("id,status,storage_bucket,storage_path")
    .eq("workspace_id", draft.workspace_id)
    .eq("content_id", draft.id)
    .eq("source", "generated")
    .eq("asset_type", "image")
    .in("status", ["generating", "ready"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.status === "ready") return { assetId: existing.id as string, reused: true };
  if (existing?.status === "generating") return { assetId: existing.id as string, reused: true };

  const prompt = visualPrompt(draft);
  const { data: asset, error: assetError } = await admin
    .from("content_assets")
    .insert({
      workspace_id: draft.workspace_id,
      content_id: draft.id,
      asset_type: "image",
      source: "generated",
      status: "generating",
      mime_type: "image/jpeg",
      width: 1024,
      height: 1024,
      prompt,
      generation_metadata: { model: IMAGE_MODEL, size: "1024x1024", quality: "medium", output_format: "jpeg" },
    })
    .select("id")
    .single();
  if (assetError || !asset) throw new Error("Content asset record could not be created.");

  try {
    const image = await generateImageBytes(prompt);
    const objectPath = `${safeSegment(draft.workspace_id)}/${safeSegment(draft.id)}/${asset.id}.jpg`;
    const { error: uploadError } = await admin.storage.from(DRAFT_BUCKET).upload(objectPath, image, {
      contentType: "image/jpeg",
      upsert: false,
      cacheControl: "3600",
    });
    if (uploadError) throw new Error(`Generated image could not be stored: ${uploadError.message}`);

    const { error: updateError } = await admin
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
      .eq("id", asset.id)
      .eq("workspace_id", draft.workspace_id);
    if (updateError) throw new Error("Generated image state could not be saved.");

    return { assetId: asset.id as string, reused: false };
  } catch (error) {
    await admin
      .from("content_assets")
      .update({
        status: "failed",
        generation_metadata: {
          model: IMAGE_MODEL,
          failed_at: new Date().toISOString(),
          error: error instanceof Error ? error.message.slice(0, 1000) : "Unknown media generation failure",
        },
      })
      .eq("id", asset.id)
      .eq("workspace_id", draft.workspace_id);
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
  if (downloadError || !file) throw new Error("Approved image could not be read from draft storage.");

  const targetPath = `${safeSegment(workspaceId)}/${safeSegment(contentId)}/${asset.id}.jpg`;
  const bytes = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await admin.storage.from(PUBLISH_BUCKET).upload(targetPath, bytes, {
    contentType: asset.mime_type || "image/jpeg",
    upsert: true,
    cacheControl: "31536000",
  });
  if (uploadError) throw new Error(`Approved image could not be promoted for publishing: ${uploadError.message}`);

  const { data: publicData } = admin.storage.from(PUBLISH_BUCKET).getPublicUrl(targetPath);
  const publicUrl = publicData.publicUrl;
  if (!publicUrl) throw new Error("Approved image did not receive a public delivery URL.");

  const { error: saveError } = await admin
    .from("content_assets")
    .update({
      storage_bucket: PUBLISH_BUCKET,
      storage_path: targetPath,
      public_url: publicUrl,
      generation_metadata: { promoted_at: new Date().toISOString() },
    })
    .eq("id", asset.id)
    .eq("workspace_id", workspaceId);
  if (saveError) throw new Error("Approved image public URL could not be saved.");

  return publicUrl;
}
