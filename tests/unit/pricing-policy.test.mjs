import test from "node:test";
import assert from "node:assert/strict";
import { evaluatePricingAuthority, pricingPlanKey } from "../../src/lib/pricing.ts";

const activePlan = {
  status: "active",
  pricingType: "range",
  minPrice: 50_000,
  basePrice: 60_000,
  maxPrice: 75_000,
  maxDiscountPercent: 20,
  requiresApproval: false,
};

test("pricing policy permits a proposal only inside approved bounds", () => {
  assert.deepEqual(evaluatePricingAuthority(activePlan, 55_000), {
    authority: "amber",
    allowed: true,
    reason: "Price is inside the founder-approved policy.",
  });
  assert.equal(evaluatePricingAuthority(activePlan, 49_999).allowed, false);
  assert.equal(evaluatePricingAuthority(activePlan, 75_001).allowed, false);
});

test("pricing policy routes custom and approval-required plans to founder control", () => {
  assert.equal(evaluatePricingAuthority({ ...activePlan, pricingType: "custom" }, null).authority, "red");
  assert.equal(evaluatePricingAuthority({ ...activePlan, requiresApproval: true }, 60_000).allowed, false);
});

test("pricing plan keys are stable and URL-safe", () => {
  assert.equal(pricingPlanKey("Website Growth Plan"), "website-growth-plan");
  assert.equal(pricingPlanKey("  AI + Automation  "), "ai-automation");
});
