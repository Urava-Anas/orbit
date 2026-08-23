export const ORBIT_TRIAL_DAYS = 15;
export const ORBIT_TRIAL_PLAN_KEY = "business" as const;

export type OrbitPlanKey = "founder" | "business" | "autopilot" | "enterprise";
export type OrbitBillingInterval = "monthly" | "yearly";

export type OrbitPlan = {
  key: OrbitPlanKey;
  name: string;
  eyebrow: string;
  description: string;
  monthlyPrice: number | null;
  yearlyPrice: number | null;
  memberLimit: number | null;
  workspaceLimit: number | null;
  automationLevel: "standard" | "advanced" | "high" | "custom";
  supportLevel: "standard" | "priority" | "priority-onboarding" | "dedicated";
  recommended?: boolean;
  features: readonly string[];
};

export const ORBIT_PLANS: readonly OrbitPlan[] = [
  {
    key: "founder",
    name: "Founder",
    eyebrow: "Start lean",
    description: "For a founder who wants one operating layer instead of scattered tools.",
    monthlyPrice: 29,
    yearlyPrice: 290,
    memberLimit: 3,
    workspaceLimit: 1,
    automationLevel: "standard",
    supportLevel: "standard",
    features: [
      "1 organisation workspace",
      "Up to 3 team members",
      "Founder command centre",
      "Leads, sales and delivery",
      "Finance, proof and publishing",
      "Standard integrations",
    ],
  },
  {
    key: "business",
    name: "Business",
    eyebrow: "Run the company",
    description: "For a growing team that needs visibility, accountability and automation.",
    monthlyPrice: 79,
    yearlyPrice: 790,
    memberLimit: 10,
    workspaceLimit: 1,
    automationLevel: "advanced",
    supportLevel: "priority",
    recommended: true,
    features: [
      "Everything in Founder",
      "Up to 10 team members",
      "Advanced founder dashboards",
      "Department workflows",
      "Automation and approval flows",
      "Advanced reporting",
      "Priority support",
    ],
  },
  {
    key: "autopilot",
    name: "Autopilot",
    eyebrow: "Reduce human work",
    description: "For operations that want Orbit doing more of the repeatable work automatically.",
    monthlyPrice: 199,
    yearlyPrice: 1990,
    memberLimit: 25,
    workspaceLimit: 1,
    automationLevel: "high",
    supportLevel: "priority-onboarding",
    features: [
      "Everything in Business",
      "Up to 25 team members",
      "Higher automation capacity",
      "AI-assisted operations",
      "Advanced approval controls",
      "Priority onboarding",
      "Automation support",
    ],
  },
  {
    key: "enterprise",
    name: "Enterprise",
    eyebrow: "Built around you",
    description: "For larger organisations that need custom governance, scale and implementation.",
    monthlyPrice: null,
    yearlyPrice: null,
    memberLimit: null,
    workspaceLimit: null,
    automationLevel: "custom",
    supportLevel: "dedicated",
    features: [
      "Flexible organisation workspaces",
      "Custom team capacity",
      "Custom permissions and governance",
      "Custom automation architecture",
      "Dedicated onboarding",
      "Dedicated support",
    ],
  },
] as const;

export const ORBIT_PLAN_BY_KEY = Object.fromEntries(
  ORBIT_PLANS.map((plan) => [plan.key, plan]),
) as Record<OrbitPlanKey, OrbitPlan>;

export const ORBIT_FEATURE_COMPARISON = [
  { label: "Organisation workspaces", founder: "1", business: "1", autopilot: "1", enterprise: "Flexible" },
  { label: "Team members", founder: "3", business: "10", autopilot: "25", enterprise: "Custom" },
  { label: "Founder command centre", founder: true, business: true, autopilot: true, enterprise: true },
  { label: "Core operating modules", founder: true, business: true, autopilot: true, enterprise: true },
  { label: "Department workflows", founder: "Standard", business: "Advanced", autopilot: "Advanced", enterprise: "Custom" },
  { label: "Automation", founder: "Standard", business: "Advanced", autopilot: "High", enterprise: "Custom" },
  { label: "Approval controls", founder: "Core", business: "Advanced", autopilot: "Advanced", enterprise: "Custom" },
  { label: "Reporting", founder: "Standard", business: "Advanced", autopilot: "Advanced", enterprise: "Custom" },
  { label: "Support", founder: "Standard", business: "Priority", autopilot: "Priority + onboarding", enterprise: "Dedicated" },
] as const;

export function planPrice(plan: OrbitPlan, interval: OrbitBillingInterval) {
  return interval === "yearly" ? plan.yearlyPrice : plan.monthlyPrice;
}

export function monthlyEquivalent(plan: OrbitPlan) {
  if (plan.yearlyPrice === null) return null;
  return Math.round((plan.yearlyPrice / 12) * 100) / 100;
}

export function yearlySaving(plan: OrbitPlan) {
  if (plan.monthlyPrice === null || plan.yearlyPrice === null) return null;
  return plan.monthlyPrice * 12 - plan.yearlyPrice;
}
