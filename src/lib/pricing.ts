export const PRICING_CURRENCIES = ["PKR", "USD", "GBP", "EUR", "AED", "SAR"] as const;
export const PRICING_TYPES = ["fixed", "range", "custom"] as const;
export const PRICING_STATUSES = ["draft", "active", "archived"] as const;

export type PricingCurrency = (typeof PRICING_CURRENCIES)[number];
export type PricingType = (typeof PRICING_TYPES)[number];
export type PricingStatus = (typeof PRICING_STATUSES)[number];

export type PricingPolicyInput = {
  status: PricingStatus;
  pricingType: PricingType;
  minPrice: number | null;
  maxPrice: number | null;
  basePrice: number | null;
  maxDiscountPercent: number;
  requiresApproval: boolean;
};

export type PricingAuthorityDecision = {
  authority: "amber" | "red";
  allowed: boolean;
  reason: string;
};

export function evaluatePricingAuthority(
  plan: PricingPolicyInput,
  proposedPrice: number | null,
): PricingAuthorityDecision {
  if (plan.status !== "active") {
    return { authority: "red", allowed: false, reason: "Only active pricing plans may feed a proposal." };
  }

  if (plan.pricingType === "custom" || plan.requiresApproval) {
    return { authority: "red", allowed: false, reason: "This plan requires founder approval." };
  }

  if (proposedPrice === null || !Number.isFinite(proposedPrice) || proposedPrice < 0) {
    return { authority: "red", allowed: false, reason: "A valid proposal price is required." };
  }

  if (plan.minPrice === null || proposedPrice < plan.minPrice) {
    return { authority: "red", allowed: false, reason: "The proposal is below the approved price floor." };
  }

  if (plan.maxPrice !== null && proposedPrice > plan.maxPrice) {
    return { authority: "red", allowed: false, reason: "The proposal is above the approved price ceiling." };
  }

  if (plan.basePrice !== null && proposedPrice < plan.basePrice) {
    const discount = ((plan.basePrice - proposedPrice) / plan.basePrice) * 100;
    if (discount > plan.maxDiscountPercent) {
      return { authority: "red", allowed: false, reason: "The discount exceeds the approved limit." };
    }
  }

  return { authority: "amber", allowed: true, reason: "Price is inside the founder-approved policy." };
}

export function pricingPlanKey(name: string) {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
