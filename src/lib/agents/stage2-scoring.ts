import type {
  LeadIntelligenceResult,
  OutreachChannel,
  StageTwoEvidence,
} from "@/lib/agents/stage2-contracts";

type LeadInput = {
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  source: string;
  stage: string;
  estimated_value: number | string | null;
  niche: string | null;
  lead_score: number | null;
  pain_point: string | null;
  notes: string | null;
  google_maps_url: string | null;
  google_place_id: string | null;
};

type FinderInput = {
  id: string;
  business_name: string;
  formatted_address: string | null;
  website_url: string | null;
  phone: string | null;
  rating: number | string | null;
  review_count: number | null;
  niche: string;
  target_problem: string | null;
  fit_score: number | null;
  problem_score: number | null;
  contactability_score: number | null;
  commercial_score: number | null;
  total_score: number | null;
  score_reason: string | null;
  detected_weakness: string | null;
  recommended_offer: string | null;
  suggested_next_action: string | null;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function numeric(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function hasText(value: string | null | undefined) {
  return Boolean(value?.trim());
}

function chooseChannel(
  lead: LeadInput,
  finder: FinderInput | null,
  requested?: OutreachChannel,
): OutreachChannel {
  const available: Record<OutreachChannel, boolean> = {
    email: hasText(lead.email),
    whatsapp: hasText(lead.whatsapp) || hasText(lead.phone) || hasText(finder?.phone),
    phone: hasText(lead.phone) || hasText(finder?.phone),
    manual: true,
  };

  if (requested && available[requested]) return requested;
  if (available.email) return "email";
  if (available.whatsapp) return "whatsapp";
  if (available.phone) return "phone";
  return "manual";
}

function buildEvidence(lead: LeadInput, finder: FinderInput | null): StageTwoEvidence[] {
  const evidence: StageTwoEvidence[] = [
    { key: "lead_source", value: lead.source, source: "lead" },
    { key: "lead_stage", value: lead.stage, source: "lead" },
  ];

  if (hasText(lead.niche)) evidence.push({ key: "niche", value: lead.niche!, source: "lead" });
  if (hasText(lead.pain_point)) evidence.push({ key: "pain_point", value: lead.pain_point!, source: "lead" });
  if (hasText(lead.email)) evidence.push({ key: "email_available", value: true, source: "lead" });
  if (hasText(lead.whatsapp)) evidence.push({ key: "whatsapp_available", value: true, source: "lead" });
  if (hasText(lead.phone)) evidence.push({ key: "phone_available", value: true, source: "lead" });
  if (numeric(lead.estimated_value) > 0) {
    evidence.push({ key: "estimated_value", value: numeric(lead.estimated_value), source: "lead" });
  }

  if (finder) {
    evidence.push({ key: "lead_finder_match", value: finder.business_name, source: "lead_finder" });
    if (hasText(finder.formatted_address)) {
      evidence.push({ key: "address", value: finder.formatted_address!, source: "lead_finder" });
    }
    if (hasText(finder.website_url)) {
      evidence.push({ key: "website_available", value: true, source: "lead_finder" });
    }
    if (numeric(finder.rating) > 0) {
      evidence.push({ key: "rating", value: numeric(finder.rating), source: "lead_finder" });
    }
    if ((finder.review_count ?? 0) > 0) {
      evidence.push({ key: "review_count", value: finder.review_count!, source: "lead_finder" });
    }
    if (hasText(finder.target_problem)) {
      evidence.push({ key: "target_problem", value: finder.target_problem!, source: "lead_finder" });
    }
    if (hasText(finder.detected_weakness)) {
      evidence.push({ key: "detected_weakness", value: finder.detected_weakness!, source: "lead_finder" });
    }
    if (hasText(finder.recommended_offer)) {
      evidence.push({ key: "recommended_offer", value: finder.recommended_offer!, source: "lead_finder" });
    }
  }

  return evidence;
}

export function scoreLeadForStageTwo(
  lead: LeadInput,
  finder: FinderInput | null,
  options: {
    requestedChannel?: OutreachChannel;
    qualifiedThreshold: number;
    reviewThreshold: number;
  },
): LeadIntelligenceResult {
  const finderHasCompleteScores = Boolean(
    finder &&
      finder.fit_score !== null &&
      finder.problem_score !== null &&
      finder.contactability_score !== null &&
      finder.commercial_score !== null,
  );

  let fitScore: number;
  let problemScore: number;
  let contactabilityScore: number;
  let commercialScore: number;
  let scoringMode: "lead_finder" | "deterministic";

  if (finderHasCompleteScores && finder) {
    fitScore = clamp(finder.fit_score!, 0, 30);
    problemScore = clamp(finder.problem_score!, 0, 30);
    contactabilityScore = clamp(finder.contactability_score!, 0, 20);
    commercialScore = clamp(finder.commercial_score!, 0, 20);
    scoringMode = "lead_finder";
  } else {
    fitScore = 5;
    if (hasText(lead.niche) || hasText(finder?.niche)) fitScore += 10;
    if (hasText(lead.company) || hasText(finder?.business_name)) fitScore += 5;
    if (hasText(lead.google_place_id) || hasText(lead.google_maps_url) || finder) fitScore += 5;
    if (["google", "referral", "website", "instagram", "facebook", "linkedin"].includes(lead.source)) fitScore += 5;
    fitScore = clamp(fitScore, 0, 30);

    problemScore = 0;
    if (hasText(lead.pain_point) || hasText(finder?.target_problem)) problemScore += 18;
    if (hasText(finder?.detected_weakness)) problemScore += 10;
    if (hasText(finder?.score_reason)) problemScore += 2;
    problemScore = clamp(problemScore, 0, 30);

    contactabilityScore = 0;
    if (hasText(lead.email)) contactabilityScore += 8;
    if (hasText(lead.whatsapp)) contactabilityScore += 6;
    if (hasText(lead.phone) || hasText(finder?.phone)) contactabilityScore += 4;
    if (hasText(finder?.website_url)) contactabilityScore += 2;
    contactabilityScore = clamp(contactabilityScore, 0, 20);

    commercialScore = 0;
    const estimatedValue = numeric(lead.estimated_value);
    if (estimatedValue > 0) commercialScore += 8;
    const reviews = finder?.review_count ?? 0;
    if (reviews >= 100) commercialScore += 6;
    else if (reviews >= 25) commercialScore += 4;
    else if (reviews > 0) commercialScore += 2;
    if (numeric(finder?.rating) >= 4) commercialScore += 3;
    if (hasText(finder?.website_url)) commercialScore += 3;
    commercialScore = clamp(commercialScore, 0, 20);
    scoringMode = "deterministic";
  }

  const totalScore = clamp(
    fitScore + problemScore + contactabilityScore + commercialScore,
    0,
    100,
  );

  const qualification =
    totalScore >= options.qualifiedThreshold
      ? "qualified"
      : totalScore >= options.reviewThreshold
        ? "review"
        : "unqualified";

  const painPoint =
    lead.pain_point?.trim() ||
    finder?.target_problem?.trim() ||
    finder?.detected_weakness?.trim() ||
    null;
  const detectedWeakness = finder?.detected_weakness?.trim() || null;
  const recommendedOffer =
    finder?.recommended_offer?.trim() ||
    (painPoint ? `A focused audit and solution around: ${painPoint}` : null);
  const recommendedChannel = chooseChannel(lead, finder, options.requestedChannel);

  const suggestedNextAction =
    qualification === "qualified"
      ? `Prepare personalized ${recommendedChannel} outreach draft.`
      : qualification === "review"
        ? "Hold outreach and route the lead for founder review or collect stronger evidence."
        : "Keep the lead out of active outreach until stronger fit, problem, or contact evidence exists.";

  return {
    fitScore,
    problemScore,
    contactabilityScore,
    commercialScore,
    totalScore,
    qualification,
    painPoint,
    detectedWeakness,
    recommendedOffer,
    recommendedChannel,
    suggestedNextAction,
    evidence: buildEvidence(lead, finder),
    scoringBasis: {
      scoringMode,
      qualifiedThreshold: options.qualifiedThreshold,
      reviewThreshold: options.reviewThreshold,
      finderTotalScore: finder?.total_score ?? null,
      finderScoreReason: finder?.score_reason ?? null,
      weights: { fit: 30, problem: 30, contactability: 20, commercial: 20 },
    },
  };
}

export type { FinderInput as StageTwoFinderInput, LeadInput as StageTwoLeadInput };
