export type SendPackLead = {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  niche: string | null;
  stage: string;
  pain_point: string | null;
  notes: string | null;
  lead_score: number | null;
  currency: string;
};

export type SendPackPricingPlan = {
  id: string;
  name: string;
  service_category: string;
  summary: string;
  pricing_type: "fixed" | "range" | "custom";
  base_price: number | null;
  min_price: number | null;
  max_price: number | null;
  currency: string;
  max_discount_percent: number;
  installment_options: string[];
  included_features: string[];
  add_ons: string[];
  offer_valid_days: number;
  requires_approval: boolean;
  status: "draft" | "active" | "archived";
  version: number;
};

export type SendPackContentAsset = {
  id: string;
  title: string;
  asset_type: string;
  asset_url: string | null;
  body: string;
  audience_tags: string[];
  industry_tags: string[];
  service_categories: string[];
  lead_stages: string[];
  channels: string[];
  goal: string;
  language: string;
  cta: string;
  linked_pricing_plan_id: string | null;
  status: "draft" | "approved" | "expired" | "archived";
  sent_count: number;
  reply_count: number;
  meeting_count: number;
  won_count: number;
};

export type RecommendedSendPack = {
  plan: SendPackPricingPlan;
  asset: SendPackContentAsset | null;
  channel: "email" | "whatsapp" | "manual";
  subject: string | null;
  messageBody: string;
  proposalTitle: string;
  proposalScope: Array<{ item: string; source: string }>;
  pricingSnapshot: Record<string, unknown>;
  contentSnapshot: Record<string, unknown>;
  recommendationBasis: Record<string, unknown>;
  confidence: number;
  requiresApproval: boolean;
};

const CASHVERTISING_GATE = [
  "buyer_clarity",
  "biggest_benefit",
  "specificity",
  "proof",
  "truthful_scarcity",
  "risk_reduction",
  "easy_next_action",
] as const;

function tokens(...values: Array<string | null | undefined>) {
  return new Set(
    values
      .join(" ")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(/\s+/)
      .filter((value) => value.length >= 3),
  );
}

function overlap(left: Set<string>, right: Set<string>) {
  let score = 0;
  for (const value of left) if (right.has(value)) score += 1;
  return score;
}

function planScore(lead: SendPackLead, plan: SendPackPricingPlan) {
  const leadTokens = tokens(lead.niche, lead.pain_point, lead.notes);
  const planTokens = tokens(
    plan.name,
    plan.service_category,
    plan.summary,
    ...plan.included_features,
  );
  const currencyFit = plan.currency === lead.currency ? 8 : 0;
  return overlap(leadTokens, planTokens) * 12 + currencyFit + (plan.pricing_type === "custom" ? 0 : 4);
}

export function rankPricingPlans(lead: SendPackLead, plans: SendPackPricingPlan[]) {
  return plans
    .filter((plan) => plan.status === "active")
    .map((plan) => ({ plan, score: planScore(lead, plan) }))
    .sort((left, right) => right.score - left.score || left.plan.name.localeCompare(right.plan.name));
}

function assetScore(
  lead: SendPackLead,
  plan: SendPackPricingPlan,
  channel: RecommendedSendPack["channel"],
  asset: SendPackContentAsset,
) {
  if (asset.status !== "approved") return -1;
  if (channel !== "manual" && !asset.channels.includes(channel)) return -1;

  const leadTokens = tokens(lead.niche, lead.pain_point, lead.notes);
  const assetTokens = tokens(
    asset.title,
    asset.body,
    asset.cta,
    ...asset.audience_tags,
    ...asset.industry_tags,
  );
  let score = overlap(leadTokens, assetTokens) * 10;
  if (asset.linked_pricing_plan_id === plan.id) score += 35;
  if (asset.service_categories.some((value) => value.toLowerCase() === plan.service_category.toLowerCase())) score += 24;
  if (asset.lead_stages.includes(lead.stage)) score += 14;
  if (asset.goal === "request_decision" || asset.goal === "build_trust") score += 6;
  const performanceBase = Math.max(asset.sent_count, 1);
  score += Math.min(10, Math.round((asset.reply_count / performanceBase) * 20));
  return score;
}

export function rankContentAssets(
  lead: SendPackLead,
  plan: SendPackPricingPlan,
  channel: RecommendedSendPack["channel"],
  assets: SendPackContentAsset[],
) {
  return assets
    .map((asset) => ({ asset, score: assetScore(lead, plan, channel, asset) }))
    .filter((result) => result.score >= 0)
    .sort((left, right) => right.score - left.score || left.asset.title.localeCompare(right.asset.title));
}

export function recommendedChannel(lead: SendPackLead): RecommendedSendPack["channel"] {
  if (lead.whatsapp || lead.phone) return "whatsapp";
  if (lead.email) return "email";
  return "manual";
}

function money(value: number | null, currency: string) {
  if (value === null) return "Custom quote";
  return `${currency} ${new Intl.NumberFormat("en-PK", { maximumFractionDigits: 0 }).format(value)}`;
}

function clip(value: string, max: number) {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

export function planPriceLabel(plan: SendPackPricingPlan) {
  if (plan.pricing_type === "custom") return "Custom quote after scope confirmation";
  if (plan.pricing_type === "range") return `${money(plan.min_price, plan.currency)}–${money(plan.max_price, plan.currency)}`;
  return money(plan.base_price, plan.currency);
}

export function buildRecommendedSendPack(input: {
  lead: SendPackLead;
  plans: SendPackPricingPlan[];
  assets: SendPackContentAsset[];
  selectedPlanId?: string | null;
  selectedAssetId?: string | null;
}): RecommendedSendPack {
  const rankedPlans = rankPricingPlans(input.lead, input.plans);
  const selectedPlan = input.selectedPlanId
    ? rankedPlans.find(({ plan }) => plan.id === input.selectedPlanId)?.plan
    : rankedPlans[0]?.plan;
  if (!selectedPlan) throw new Error("No active pricing plan matches this lead.");

  const channel = recommendedChannel(input.lead);
  const rankedAssets = rankContentAssets(input.lead, selectedPlan, channel, input.assets);
  const selectedAsset = input.selectedAssetId
    ? rankedAssets.find(({ asset }) => asset.id === input.selectedAssetId)?.asset ?? null
    : rankedAssets[0]?.asset ?? null;

  const business = input.lead.company?.trim() || input.lead.name;
  const firstName = input.lead.name.trim().split(/\s+/)[0] || "there";
  const pain = clip(input.lead.pain_point?.trim() || "turning attention into consistent enquiries", 180);
  const benefit = clip(selectedPlan.summary.trim() || `a clearer ${selectedPlan.service_category.toLowerCase()} system built around measurable enquiries`, 220);
  const price = planPriceLabel(selectedPlan);
  const assetLine = selectedAsset
    ? `${clip(selectedAsset.title, 120)}${selectedAsset.asset_url ? `: ${clip(selectedAsset.asset_url, 360)}` : ""}`
    : null;
  const validity = selectedPlan.offer_valid_days > 0
    ? `This plan is valid for ${selectedPlan.offer_valid_days} days so the scope and delivery capacity stay accurate.`
    : null;
  const cta = clip(selectedAsset?.cta.trim() || "Reply ‘yes’ and I’ll confirm the exact starting step.", 160);

  const messageBody = [
    `Hi ${firstName},`,
    `Based on what we found at ${business}, the main opportunity is ${pain}.`,
    `Orbit recommends ${selectedPlan.name}: ${benefit}`,
    `Approved price: ${price}.`,
    selectedPlan.included_features.length
      ? `Included: ${selectedPlan.included_features.slice(0, 5).map((feature) => clip(feature, 80)).join(", ")}.`
      : null,
    assetLine ? `Relevant example: ${assetLine}` : null,
    "Nothing outside this approved scope is added without your confirmation.",
    validity,
    cta,
  ].filter(Boolean).join("\n\n");

  const channelSafeMessage = channel === "whatsapp" && messageBody.length > 1024
    ? [
        `Hi ${firstName},`,
        `${business}: Orbit recommends ${selectedPlan.name} for ${clip(pain, 120)}.`,
        `Approved price: ${price}.`,
        assetLine ? `Relevant example: ${clip(assetLine, 260)}` : null,
        "Nothing outside the approved scope is added without your confirmation.",
        cta,
      ].filter(Boolean).join("\n\n")
    : messageBody;

  const planRank = rankedPlans.find(({ plan }) => plan.id === selectedPlan.id)?.score ?? 0;
  const assetRank = selectedAsset
    ? rankedAssets.find(({ asset }) => asset.id === selectedAsset.id)?.score ?? 0
    : 0;
  const confidence = Math.min(96, Math.max(55, 62 + Math.min(22, planRank) + Math.min(12, assetRank)));

  return {
    plan: selectedPlan,
    asset: selectedAsset,
    channel,
    subject: channel === "email" ? `${business} — ${selectedPlan.name}`.slice(0, 240) : null,
    messageBody: channelSafeMessage,
    proposalTitle: `${selectedPlan.name} for ${business}`.slice(0, 240),
    proposalScope: selectedPlan.included_features.map((item) => ({ item, source: "pricing_plan" })),
    pricingSnapshot: {
      pricingPlanId: selectedPlan.id,
      name: selectedPlan.name,
      serviceCategory: selectedPlan.service_category,
      pricingType: selectedPlan.pricing_type,
      basePrice: selectedPlan.base_price,
      minPrice: selectedPlan.min_price,
      maxPrice: selectedPlan.max_price,
      currency: selectedPlan.currency,
      maxDiscountPercent: selectedPlan.max_discount_percent,
      offerValidDays: selectedPlan.offer_valid_days,
      includedFeatures: selectedPlan.included_features,
      installmentOptions: selectedPlan.installment_options,
      addOns: selectedPlan.add_ons,
      version: selectedPlan.version,
    },
    contentSnapshot: selectedAsset ? {
      contentAssetId: selectedAsset.id,
      title: selectedAsset.title,
      assetType: selectedAsset.asset_type,
      assetUrl: selectedAsset.asset_url,
      cta: selectedAsset.cta,
      language: selectedAsset.language,
    } : {},
    recommendationBasis: {
      leadStage: input.lead.stage,
      leadScore: input.lead.lead_score,
      planMatchScore: planRank,
      assetMatchScore: assetRank,
      channelReason: channel === "whatsapp" ? "verified_whatsapp_or_phone" : channel === "email" ? "verified_email" : "no_automated_destination",
      cashvertisingGate: CASHVERTISING_GATE,
    },
    confidence,
    requiresApproval: selectedPlan.requires_approval || selectedPlan.pricing_type === "custom" || channel === "manual",
  };
}

export function isLeadReadyForSendPack(lead: SendPackLead) {
  return ["qualified", "interested", "demo_booked", "proposal"].includes(lead.stage)
    || (lead.lead_score ?? 0) >= 60;
}
