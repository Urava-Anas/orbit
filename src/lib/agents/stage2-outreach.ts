import type {
  LeadIntelligenceResult,
  OutreachDraftResult,
  StageTwoEvidence,
} from "@/lib/agents/stage2-contracts";
import type { StageTwoLeadInput } from "@/lib/agents/stage2-scoring";

function clean(value: string | null | undefined, fallback: string) {
  const normalized = value?.replace(/\s+/g, " ").trim();
  return normalized || fallback;
}

function deterministicDraft(
  lead: StageTwoLeadInput,
  intelligence: LeadIntelligenceResult,
): OutreachDraftResult {
  const business = clean(lead.company, clean(lead.name, "your business"));
  const pain = clean(
    intelligence.painPoint,
    "an opportunity to strengthen how prospects understand and act on your offer",
  );
  const offer = clean(
    intelligence.recommendedOffer,
    "a focused audit with practical improvements",
  );

  const body = [
    `Hi ${clean(lead.name, "there")},`,
    `I came across ${business} and noticed ${pain}.`,
    `We can help with ${offer}. Rather than sending a generic pitch, I can first share a short, specific breakdown of what I would improve and why.`,
    `Would you like me to send that over?`,
  ].join("\n\n");

  return {
    channel: intelligence.recommendedChannel,
    subject:
      intelligence.recommendedChannel === "email"
        ? `A specific idea for ${business}`.slice(0, 240)
        : null,
    body: body.slice(0, 4000),
    personalizationBasis: intelligence.evidence,
    generationMode: "deterministic_fallback",
    modelProvider: null,
    modelName: null,
    externalSendEnabled: false,
  };
}

function buildLocalPrompt(
  lead: StageTwoLeadInput,
  intelligence: LeadIntelligenceResult,
  evidence: StageTwoEvidence[],
) {
  return [
    "You are Orbit's Outreach specialist.",
    "Write one concise cold outreach message grounded only in the supplied evidence.",
    "Do not invent familiarity, metrics, testimonials, guarantees, scarcity, or facts.",
    "Do not say you audited anything unless the evidence explicitly says so.",
    "Use a natural professional tone, identify the observed problem carefully, offer a useful next step, and end with one easy question.",
    "Keep the body below 900 characters. Return only the message body, no markdown or labels.",
    `Lead name: ${lead.name}`,
    `Company: ${lead.company ?? "unknown"}`,
    `Channel: ${intelligence.recommendedChannel}`,
    `Pain point: ${intelligence.painPoint ?? "unknown"}`,
    `Recommended offer: ${intelligence.recommendedOffer ?? "unknown"}`,
    `Evidence JSON: ${JSON.stringify(evidence)}`,
  ].join("\n");
}

async function tryLocalModel(
  lead: StageTwoLeadInput,
  intelligence: LeadIntelligenceResult,
): Promise<OutreachDraftResult | null> {
  if (process.env.ORBIT_LOCAL_MODEL_ENABLED !== "true") return null;

  const baseUrl = process.env.ORBIT_LOCAL_MODEL_BASE_URL?.replace(/\/$/, "");
  const modelName = process.env.ORBIT_LOCAL_MODEL_NAME?.trim();
  if (!baseUrl || !modelName) return null;

  const fallback = deterministicDraft(lead, intelligence);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (process.env.ORBIT_LOCAL_MODEL_API_KEY) {
    headers.Authorization = `Bearer ${process.env.ORBIT_LOCAL_MODEL_API_KEY}`;
  }

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: modelName,
        temperature: 0.3,
        messages: [
          {
            role: "user",
            content: buildLocalPrompt(lead, intelligence, intelligence.evidence),
          },
        ],
      }),
      signal: AbortSignal.timeout(12_000),
      cache: "no-store",
    });

    if (!response.ok) return null;
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const body = payload.choices?.[0]?.message?.content?.replace(/\s+$/g, "").trim();
    if (!body || body.length < 20 || body.length > 4000) return null;

    return {
      ...fallback,
      body,
      generationMode: "local_model",
      modelProvider: "openai_compatible_local",
      modelName,
      externalSendEnabled: false,
    };
  } catch {
    return null;
  }
}

export async function createStageTwoOutreachDraft(
  lead: StageTwoLeadInput,
  intelligence: LeadIntelligenceResult,
): Promise<OutreachDraftResult> {
  return (await tryLocalModel(lead, intelligence)) ?? deterministicDraft(lead, intelligence);
}
