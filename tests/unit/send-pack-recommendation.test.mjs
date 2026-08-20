import test from "node:test";
import assert from "node:assert/strict";
import {
  buildRecommendedSendPack,
  isLeadReadyForSendPack,
  rankContentAssets,
  rankPricingPlans,
} from "../../src/lib/send-packs.ts";

const lead = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Ayesha",
  company: "London Bites",
  email: "owner@example.test",
  phone: "+923001234567",
  whatsapp: "+923001234567",
  niche: "restaurant",
  stage: "qualified",
  pain_point: "needs more direct online orders and WhatsApp ordering",
  notes: "Local restaurant",
  lead_score: 84,
  currency: "PKR",
};

const websitePlan = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Restaurant Ordering Website",
  service_category: "Websites",
  summary: "A conversion-focused restaurant website with WhatsApp ordering.",
  pricing_type: "fixed",
  base_price: 60_000,
  min_price: 60_000,
  max_price: 60_000,
  currency: "PKR",
  max_discount_percent: 10,
  installment_options: ["50% to start", "50% before launch"],
  included_features: ["Mobile menu", "WhatsApp ordering", "Google conversion tracking"],
  add_ons: ["Monthly content"],
  offer_valid_days: 14,
  requires_approval: false,
  status: "active",
  version: 2,
};

const automationPlan = {
  ...websitePlan,
  id: "33333333-3333-4333-8333-333333333333",
  name: "Internal Operations Automation",
  service_category: "Automation",
  summary: "Back-office workflow automation for internal teams.",
  included_features: ["Workflow mapping"],
};

const restaurantPoster = {
  id: "44444444-4444-4444-8444-444444444444",
  title: "More Restaurant Orders with WhatsApp",
  asset_type: "poster",
  asset_url: "https://assets.example.test/restaurant-orders.png",
  body: "Turn menu visitors into direct restaurant orders.",
  audience_tags: ["local business owner"],
  industry_tags: ["restaurant"],
  service_categories: ["Websites"],
  lead_stages: ["qualified"],
  channels: ["whatsapp", "email"],
  goal: "request_decision",
  language: "en",
  cta: "Reply yes to see the starting plan.",
  linked_pricing_plan_id: websitePlan.id,
  status: "approved",
  sent_count: 10,
  reply_count: 4,
  meeting_count: 2,
  won_count: 1,
};

test("recommendation chooses the plan and asset that match the lead", () => {
  assert.equal(rankPricingPlans(lead, [automationPlan, websitePlan])[0].plan.id, websitePlan.id);
  assert.equal(rankContentAssets(lead, websitePlan, "whatsapp", [restaurantPoster])[0].asset.id, restaurantPoster.id);
});

test("send pack freezes pricing, content and Cashvertising controls", () => {
  const pack = buildRecommendedSendPack({
    lead,
    plans: [automationPlan, websitePlan],
    assets: [restaurantPoster],
  });
  assert.equal(pack.plan.id, websitePlan.id);
  assert.equal(pack.asset?.id, restaurantPoster.id);
  assert.equal(pack.channel, "whatsapp");
  assert.equal(pack.pricingSnapshot.version, 2);
  assert.match(pack.messageBody, /Approved price: PKR 60,000/);
  assert.match(pack.messageBody, /Nothing outside this approved scope/);
  assert.ok(pack.messageBody.length <= 1024, "WhatsApp body must fit the approved template variable");
  assert.deepEqual(pack.recommendationBasis.cashvertisingGate, [
    "buyer_clarity",
    "biggest_benefit",
    "specificity",
    "proof",
    "truthful_scarcity",
    "risk_reduction",
    "easy_next_action",
  ]);
});

test("unqualified low-score leads cannot prepare a send pack", () => {
  assert.equal(isLeadReadyForSendPack({ ...lead, stage: "raw", lead_score: 42 }), false);
  assert.equal(isLeadReadyForSendPack({ ...lead, stage: "raw", lead_score: 75 }), true);
});
