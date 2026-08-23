import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

export const CONTENT_CHANNELS = ["instagram", "facebook", "linkedin", "tiktok"] as const;
export type ContentChannel = (typeof CONTENT_CHANNELS)[number];

const generatedItemSchema = z.object({
  channel: z.enum(CONTENT_CHANNELS),
  format: z.string().min(2).max(60),
  goal: z.enum(["awareness", "authority", "engagement", "proof", "offer", "lead_generation"]),
  title: z.string().min(2).max(180),
  hook: z.string().min(2).max(500),
  body: z.string().min(10).max(8000),
  cta: z.string().max(500),
  media_brief: z.string().max(1500),
  scheduled_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  proof_index: z.number().int().min(0).nullable(),
});

const generatedBatchSchema = z.object({
  focus: z.string().min(2).max(300),
  strategy_notes: z.string().min(2).max(2000),
  items: z.array(generatedItemSchema).min(1).max(20),
});

type BrandProfile = {
  audience: string;
  voice: string;
  pillars: string[];
  offers: string[];
  proof_rules: string;
  default_cta: string;
  timezone: string;
  daily_target_count: number;
};

type ProofRow = {
  id: string;
  title: string;
  result: string;
  permission_scope: string;
};

type LearningRow = {
  insight: string;
  action: string;
  confidence: number | string;
};

export function contentGenerationConfigured() {
  return Boolean(process.env.OPENAI_API_KEY);
}

export function contentGenerationModel() {
  return process.env.OPENAI_CONTENT_MODEL?.trim() || "gpt-5.6-luna";
}

export function localDate(timezone: string, date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function localDateTimeToUtc(date: string, time: string, timezone: string) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const guessedUtc = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(guessedUtc).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]),
  );
  const representedUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  const timezoneOffset = representedUtc - guessedUtc.getTime();
  return new Date(guessedUtc.getTime() - timezoneOffset).toISOString();
}

function extractResponseText(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  if (typeof record.output_text === "string") return record.output_text;
  const output = Array.isArray(record.output) ? record.output : [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = Array.isArray((item as Record<string, unknown>).content)
      ? ((item as Record<string, unknown>).content as unknown[])
      : [];
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const partRecord = part as Record<string, unknown>;
      if (partRecord.type === "output_text" && typeof partRecord.text === "string") {
        return partRecord.text;
      }
    }
  }
  return null;
}

async function generateWithOpenAI(input: string, targetCount: number) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("AI generation is not configured.");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: contentGenerationModel(),
      store: false,
      reasoning: { effort: "low" },
      input,
      text: {
        format: {
          type: "json_schema",
          name: "orbit_daily_content_batch",
          strict: true,
          schema: {
            type: "object",
            properties: {
              focus: { type: "string", minLength: 2, maxLength: 300 },
              strategy_notes: { type: "string", minLength: 2, maxLength: 2000 },
              items: {
                type: "array",
                minItems: targetCount,
                maxItems: targetCount,
                items: {
                  type: "object",
                  properties: {
                    channel: { type: "string", enum: CONTENT_CHANNELS },
                    format: { type: "string", minLength: 2, maxLength: 60 },
                    goal: {
                      type: "string",
                      enum: ["awareness", "authority", "engagement", "proof", "offer", "lead_generation"],
                    },
                    title: { type: "string", minLength: 2, maxLength: 180 },
                    hook: { type: "string", minLength: 2, maxLength: 500 },
                    body: { type: "string", minLength: 10, maxLength: 8000 },
                    cta: { type: "string", maxLength: 500 },
                    media_brief: { type: "string", maxLength: 1500 },
                    scheduled_time: {
                      type: "string",
                      pattern: "^([01]\\d|2[0-3]):[0-5]\\d$",
                    },
                    proof_index: {
                      anyOf: [
                        { type: "integer", minimum: 0 },
                        { type: "null" },
                      ],
                    },
                  },
                  required: [
                    "channel",
                    "format",
                    "goal",
                    "title",
                    "hook",
                    "body",
                    "cta",
                    "media_brief",
                    "scheduled_time",
                    "proof_index",
                  ],
                  additionalProperties: false,
                },
              },
            },
            required: ["focus", "strategy_notes", "items"],
            additionalProperties: false,
          },
        },
      },
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`AI generation failed (${response.status}): ${detail.slice(0, 300)}`);
  }

  const payload: unknown = await response.json();
  const text = extractResponseText(payload);
  if (!text) throw new Error("AI generation returned no structured text.");

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(text);
  } catch {
    throw new Error("AI generation returned invalid JSON.");
  }

  return generatedBatchSchema.parse(parsedJson);
}

function generationPrompt(
  workspaceName: string,
  profile: BrandProfile,
  proofs: ProofRow[],
  learnings: LearningRow[],
  targetCount: number,
) {
  const proofContext = proofs.length
    ? proofs.map((proof, index) => `${index}. ${proof.title}: ${proof.result} [permission=${proof.permission_scope}]`).join("\n")
    : "No approved proof is available. Do not invent customers, results, testimonials, numbers, awards or claims of performance.";
  const learningContext = learnings.length
    ? learnings.map((note) => `- ${note.insight}${note.action ? ` Next action: ${note.action}` : ""}`).join("\n")
    : "No performance learnings yet. Use a balanced first-day mix.";

  return `You are Orbit Content Engine producing today's founder-review batch for ${workspaceName}.

BRAND BRAIN
Audience: ${profile.audience || "Founders and operators evaluating the organisation's work."}
Voice: ${profile.voice}
Content pillars: ${profile.pillars.join(", ") || "product, useful insight, build-in-public, proof, offer"}
Priority offers: ${profile.offers.join(", ") || "No offer has been locked yet; avoid aggressive selling."}
Default CTA: ${profile.default_cta}
Proof rules: ${profile.proof_rules}

APPROVED PROOF
${proofContext}

RECENT LEARNINGS
${learningContext}

Create exactly ${targetCount} distinct pieces for a single day. Use only Instagram, Facebook, LinkedIn and TikTok. Adapt the writing and format to each channel instead of copy-pasting. Include a useful mix of authority, engagement, product/build-in-public, proof only when approved proof exists, and a restrained offer/lead-generation piece when an offer exists.

Hard rules:
- Never invent facts, clients, results, testimonials, prices, urgency, scarcity, partnerships or metrics.
- If proof_index is not null it must refer to one of the approved proof entries above and the content may not exceed that proof.
- LinkedIn organic content must not be labelled as a carousel; use post or document when a multi-page concept is useful.
- TikTok should be a short-form video concept with a concrete media brief.
- Keep hooks specific and human. Avoid generic AI marketing language, filler and excessive hashtags.
- Every piece must have one clear goal and one clear CTA.
- Spread scheduled_time across the working day; do not place two pieces at the same time.
- This is a review batch. Nothing is published by this generation step.`;
}

export async function generateDailyContentBatch({
  supabase,
  workspaceId,
  workspaceName,
  actorId,
  batchDate,
}: {
  supabase: SupabaseClient;
  workspaceId: string;
  workspaceName: string;
  actorId: string | null;
  batchDate?: string;
}) {
  const { data: profileRow, error: profileError } = await supabase
    .from("content_brand_profiles")
    .select("audience,voice,pillars,offers,proof_rules,default_cta,timezone,daily_target_count")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (profileError) throw new Error("Brand Brain could not be loaded.");
  if (!profileRow) throw new Error("Complete Brand Brain before generating a daily batch.");

  const profile = profileRow as BrandProfile;
  const date = batchDate || localDate(profile.timezone);

  const { data: existingBatch } = await supabase
    .from("content_batches")
    .select("id,status")
    .eq("workspace_id", workspaceId)
    .eq("batch_date", date)
    .maybeSingle();

  if (existingBatch) {
    const { count } = await supabase
      .from("content_drafts")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("batch_id", existingBatch.id);
    if ((count ?? 0) > 0) return { batchId: existingBatch.id as string, reused: true };
  }

  const [{ data: proofRows, error: proofError }, { data: learningRows, error: learningError }] = await Promise.all([
    supabase
      .from("proofs")
      .select("id,title,result,permission_scope")
      .eq("workspace_id", workspaceId)
      .eq("status", "approved")
      .in("permission_scope", ["anonymous", "public"])
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("content_learning_notes")
      .select("insight,action,confidence")
      .eq("workspace_id", workspaceId)
      .order("learned_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  if (proofError) throw new Error("Approved proof could not be loaded.");
  if (learningError) throw new Error("Content learnings could not be loaded.");

  const proofs = (proofRows ?? []) as ProofRow[];
  const learnings = (learningRows ?? []) as LearningRow[];
  const targetCount = Math.max(1, Math.min(20, Number(profile.daily_target_count) || 5));
  const generated = await generateWithOpenAI(
    generationPrompt(workspaceName, profile, proofs, learnings, targetCount),
    targetCount,
  );

  const { data: batch, error: batchError } = await supabase
    .from("content_batches")
    .upsert(
      {
        workspace_id: workspaceId,
        batch_date: date,
        status: "review",
        focus: generated.focus,
        strategy_notes: generated.strategy_notes,
        generated_at: new Date().toISOString(),
        created_by: actorId,
      },
      { onConflict: "workspace_id,batch_date" },
    )
    .select("id")
    .single();

  if (batchError || !batch) throw new Error("Daily batch could not be saved.");

  const drafts = generated.items.map((item, index) => {
    const proof = item.proof_index === null ? null : proofs[item.proof_index] ?? null;
    return {
      workspace_id: workspaceId,
      batch_id: batch.id,
      proof_id: proof?.id ?? null,
      source_type: proof ? "proof" : "brand",
      channel: item.channel,
      format: item.format,
      goal: item.goal,
      title: item.title,
      hook: item.hook,
      body: item.body,
      cta: item.cta,
      media_brief: item.media_brief,
      scheduled_for: localDateTimeToUtc(date, item.scheduled_time, profile.timezone),
      status: "review",
      sort_order: index,
      generation_metadata: {
        model: contentGenerationModel(),
        generated_at: new Date().toISOString(),
        local_time: item.scheduled_time,
        timezone: profile.timezone,
      },
      created_by: actorId,
    };
  });

  const { error: draftError } = await supabase.from("content_drafts").insert(drafts);
  if (draftError) {
    await supabase.from("content_batches").update({ status: "blocked" }).eq("id", batch.id).eq("workspace_id", workspaceId);
    throw new Error("Generated content could not be saved.");
  }

  return { batchId: batch.id as string, reused: false };
}

export function providerForChannel(channel: string) {
  if (channel === "instagram" || channel === "facebook") return "meta";
  if (channel === "linkedin") return "linkedin";
  if (channel === "tiktok") return "tiktok";
  if (channel === "website") return "website";
  return "manual";
}
