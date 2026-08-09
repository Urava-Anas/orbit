export const sourceSlugs = [
  "website",
  "instagram",
  "facebook",
  "google",
  "whatsapp",
  "referrals",
  "lead-finder",
] as const;

export type SourceSlug = (typeof sourceSlugs)[number];

export type SourceMetric = {
  label: string;
  value: string;
  detail: string;
};

export type SourceAsset = {
  slug: string;
  name: string;
  identifier: string;
  status: "Live" | "Connected" | "Watch" | "Draft";
  health: "Healthy" | "Needs attention" | "Setup required";
  leads: number;
  conversion: string;
  lastSync: string;
  owner: string;
  summary: string;
  liveHref?: string;
};

export type SourceControl = {
  id: string;
  title: string;
  detail: string;
  enabled: boolean;
};

export type SourceDefinition = {
  slug: SourceSlug;
  label: string;
  unit: string;
  singular: string;
  description: string;
  accent: string;
  summary: SourceMetric[];
  controls: SourceControl[];
  assets: SourceAsset[];
  tabs: string[];
  attention: Array<{ title: string; detail: string; level: "Warning" | "Info" }>;
  activity: Array<{ title: string; detail: string; time: string; status: "Success" | "Watch" }>;
};

export const leadSources: SourceDefinition[] = [
  {
    slug: "website",
    label: "Website",
    unit: "websites",
    singular: "website",
    description: "Control every website, its leads, conversion health, content and connected systems.",
    accent: "blue",
    summary: [
      { label: "Websites", value: "3", detail: "2 live · 1 draft" },
      { label: "Leads · 30 days", value: "12", detail: "+18% from last period" },
      { label: "Conversion", value: "5.4%", detail: "Across all active forms" },
      { label: "Needs attention", value: "1", detail: "One draft lacks tracking" },
    ],
    controls: [
      { id: "website-monitor", title: "Website health monitor", detail: "Uptime, SSL, forms and broken-page checks", enabled: true },
      { id: "website-routing", title: "Lead routing", detail: "Send every verified form lead to Unified Inbox", enabled: true },
      { id: "website-conversion", title: "Conversion guard", detail: "Flag broken forms or a sudden conversion drop", enabled: true },
    ],
    assets: [
      {
        slug: "urava-main",
        name: "Urava Main Website",
        identifier: "urava-main-site.vercel.app",
        status: "Live",
        health: "Healthy",
        leads: 7,
        conversion: "6.8%",
        lastSync: "2 min ago",
        owner: "Urava Studio",
        summary: "Primary trust, services and conversion website for Urava.",
        liveHref: "https://urava-main-site.vercel.app",
      },
      {
        slug: "orbit-product",
        name: "Orbit Product",
        identifier: "orbit-two-delta.vercel.app",
        status: "Live",
        health: "Healthy",
        leads: 5,
        conversion: "4.2%",
        lastSync: "5 min ago",
        owner: "Urava Labs",
        summary: "Public Orbit product experience and product-interest capture.",
        liveHref: "https://orbit-two-delta.vercel.app/lead-engine",
      },
      {
        slug: "proof-library",
        name: "Proof Library",
        identifier: "Proof experience · draft",
        status: "Draft",
        health: "Setup required",
        leads: 0,
        conversion: "—",
        lastSync: "Not connected",
        owner: "Urava Studio",
        summary: "Case studies and approved proof designed to compound trust.",
      },
    ],
    tabs: ["Overview", "Leads", "Analytics", "Pages & Content", "SEO", "Forms", "Automations", "Integrations", "Access", "Activity"],
    attention: [
      { title: "Proof Library tracking is incomplete", detail: "Connect analytics and one conversion event before publishing.", level: "Warning" },
      { title: "All live forms are receiving submissions", detail: "Last end-to-end verification completed today.", level: "Info" },
    ],
    activity: [
      { title: "Lead captured", detail: "Urava Main Website · service enquiry", time: "10:20 AM", status: "Success" },
      { title: "Health check passed", detail: "Orbit Product · SSL, routes and forms", time: "10:05 AM", status: "Success" },
      { title: "Tracking missing", detail: "Proof Library · conversion event", time: "Yesterday", status: "Watch" },
    ],
  },
  {
    slug: "instagram",
    label: "Instagram",
    unit: "accounts",
    singular: "account",
    description: "Manage accounts, content, DMs, lead capture and attribution without leaving Orbit.",
    accent: "pink",
    summary: [
      { label: "Accounts", value: "2", detail: "1 active · 1 planned" },
      { label: "Leads · 30 days", value: "8", detail: "5 from DMs" },
      { label: "Profile actions", value: "46", detail: "+12% this month" },
      { label: "Needs attention", value: "1", detail: "One planned account" },
    ],
    controls: [
      { id: "instagram-dm", title: "DM capture", detail: "Turn qualified conversations into lead records", enabled: true },
      { id: "instagram-attribution", title: "Link attribution", detail: "Track profile and campaign link conversions", enabled: true },
      { id: "instagram-review", title: "Content quality gate", detail: "Require proof, clarity and one clear next action", enabled: true },
    ],
    assets: [
      {
        slug: "urava-official",
        name: "Urava Official",
        identifier: "@urava.online",
        status: "Connected",
        health: "Healthy",
        leads: 8,
        conversion: "3.9%",
        lastSync: "4 min ago",
        owner: "Internet HQ",
        summary: "Urava authority, proof, offers and inbound conversations.",
        liveHref: "https://www.instagram.com/urava.online/",
      },
      {
        slug: "founder-voice",
        name: "Founder Voice",
        identifier: "Founder account · planned",
        status: "Draft",
        health: "Setup required",
        leads: 0,
        conversion: "—",
        lastSync: "Not connected",
        owner: "Mian Anas Arain",
        summary: "Founder-led authority and relationship channel.",
      },
    ],
    tabs: ["Overview", "Leads", "Analytics", "Content", "DMs", "Automations", "Integrations", "Access", "Activity"],
    attention: [
      { title: "Founder Voice is not connected", detail: "Keep it dormant until its job and publishing policy are locked.", level: "Warning" },
      { title: "DM capture is healthy", detail: "Qualified conversations route to Unified Inbox.", level: "Info" },
    ],
    activity: [
      { title: "DM qualified", detail: "Website enquiry added to Unified Inbox", time: "11:02 AM", status: "Success" },
      { title: "Profile link opened", detail: "Urava Official · services page", time: "10:37 AM", status: "Success" },
      { title: "Draft held", detail: "Missing proof permission", time: "Yesterday", status: "Watch" },
    ],
  },
  {
    slug: "facebook",
    label: "Facebook",
    unit: "pages",
    singular: "page",
    description: "Control pages, messages, posts, campaigns and lead routing from one workspace.",
    accent: "facebook",
    summary: [
      { label: "Pages", value: "2", detail: "1 active · 1 planned" },
      { label: "Leads · 30 days", value: "5", detail: "3 from messages" },
      { label: "Page actions", value: "31", detail: "+9% this month" },
      { label: "Needs attention", value: "1", detail: "Foundry page is planned" },
    ],
    controls: [
      { id: "facebook-message", title: "Message capture", detail: "Create a lead when a conversation meets ICP rules", enabled: true },
      { id: "facebook-comments", title: "Comment triage", detail: "Flag purchase intent and support issues", enabled: true },
      { id: "facebook-publishing", title: "Publishing policy", detail: "Run approved posts inside campaign limits", enabled: true },
    ],
    assets: [
      {
        slug: "urava-business",
        name: "Urava Business Page",
        identifier: "Urava · Software company",
        status: "Connected",
        health: "Healthy",
        leads: 5,
        conversion: "3.1%",
        lastSync: "6 min ago",
        owner: "Internet HQ",
        summary: "Business trust, local discovery and inbound messages.",
        liveHref: "https://www.facebook.com/61591507679936/",
      },
      {
        slug: "urava-foundry",
        name: "Urava Foundry Page",
        identifier: "Admissions channel · planned",
        status: "Draft",
        health: "Setup required",
        leads: 0,
        conversion: "—",
        lastSync: "Not connected",
        owner: "Urava Foundry",
        summary: "Separate admissions and student-proof channel when demand justifies it.",
      },
    ],
    tabs: ["Overview", "Leads", "Analytics", "Posts", "Messages", "Automations", "Integrations", "Access", "Activity"],
    attention: [{ title: "Foundry page remains intentionally dormant", detail: "Do not split attention until the main Urava page has a stable cadence.", level: "Warning" }],
    activity: [
      { title: "Message qualified", detail: "Local business website enquiry", time: "9:52 AM", status: "Success" },
      { title: "Comment routed", detail: "Course question sent to Foundry queue", time: "Yesterday", status: "Success" },
    ],
  },
  {
    slug: "google",
    label: "Google",
    unit: "channels",
    singular: "channel",
    description: "Control search presence, business profiles, reviews and conversion tracking.",
    accent: "google",
    summary: [
      { label: "Channels", value: "3", detail: "Profile · Search · Tracking" },
      { label: "Leads · 30 days", value: "9", detail: "6 organic · 3 profile" },
      { label: "Search actions", value: "74", detail: "+21% this month" },
      { label: "Needs attention", value: "1", detail: "Two pages not indexed" },
    ],
    controls: [
      { id: "google-reviews", title: "Review monitor", detail: "Flag new reviews and draft policy-safe replies", enabled: true },
      { id: "google-search", title: "Search health", detail: "Track indexing, queries and technical issues", enabled: true },
      { id: "google-attribution", title: "Conversion attribution", detail: "Connect calls, forms and website actions", enabled: true },
    ],
    assets: [
      {
        slug: "business-profile",
        name: "Urava Business Profile",
        identifier: "Google Business Profile",
        status: "Connected",
        health: "Healthy",
        leads: 3,
        conversion: "5.8%",
        lastSync: "8 min ago",
        owner: "Internet HQ",
        summary: "Local trust, map discovery, calls, website actions and reviews.",
        liveHref: "https://share.google/ACV2Ar0l1gER5fReL",
      },
      {
        slug: "search-console",
        name: "Urava Search Presence",
        identifier: "Search Console",
        status: "Connected",
        health: "Needs attention",
        leads: 6,
        conversion: "4.7%",
        lastSync: "18 min ago",
        owner: "Urava Studio",
        summary: "Search queries, index coverage and organic conversion opportunities.",
      },
      {
        slug: "campaign-tracking",
        name: "Campaign Tracking",
        identifier: "Analytics conversion events",
        status: "Connected",
        health: "Healthy",
        leads: 9,
        conversion: "5.1%",
        lastSync: "12 min ago",
        owner: "Orbit Autopilot",
        summary: "Source attribution and conversion measurement across campaigns.",
      },
    ],
    tabs: ["Overview", "Leads", "Analytics", "Profiles", "Reviews", "Search", "Automations", "Integrations", "Access", "Activity"],
    attention: [{ title: "Two proof pages are not indexed", detail: "Inspect canonical metadata before requesting indexing again.", level: "Warning" }],
    activity: [
      { title: "Organic lead attributed", detail: "Website services page", time: "10:14 AM", status: "Success" },
      { title: "Indexing issue detected", detail: "Two proof pages", time: "8:40 AM", status: "Watch" },
    ],
  },
  {
    slug: "whatsapp",
    label: "WhatsApp",
    unit: "inboxes",
    singular: "inbox",
    description: "Control conversations, templates, qualification, assignment and response standards.",
    accent: "whatsapp",
    summary: [
      { label: "Inboxes", value: "2", detail: "Sales · Foundry" },
      { label: "Leads · 30 days", value: "7", detail: "4 qualified" },
      { label: "Median response", value: "11m", detail: "Inside the 15m target" },
      { label: "Needs attention", value: "1", detail: "One unread hot lead" },
    ],
    controls: [
      { id: "whatsapp-qualification", title: "Conversation qualification", detail: "Detect need, budget, urgency and decision authority", enabled: true },
      { id: "whatsapp-assignment", title: "Owner assignment", detail: "Route sales and admissions conversations separately", enabled: true },
      { id: "whatsapp-followup", title: "Bounded follow-ups", detail: "Stop automatically after policy limit or opt-out", enabled: true },
    ],
    assets: [
      {
        slug: "sales-inbox",
        name: "Urava Sales Inbox",
        identifier: "Client enquiries",
        status: "Connected",
        health: "Needs attention",
        leads: 5,
        conversion: "11.4%",
        lastSync: "1 min ago",
        owner: "Urava Studio",
        summary: "Primary conversion inbox for service leads and client follow-up.",
      },
      {
        slug: "foundry-admissions",
        name: "Foundry Admissions",
        identifier: "Student enquiries",
        status: "Connected",
        health: "Healthy",
        leads: 2,
        conversion: "8.0%",
        lastSync: "3 min ago",
        owner: "Urava Foundry",
        summary: "Separate admissions queue with simple Roman Urdu guidance.",
      },
    ],
    tabs: ["Overview", "Leads", "Analytics", "Inbox", "Templates", "Automations", "Integrations", "Access", "Activity"],
    attention: [{ title: "One hot lead is unread", detail: "Sales Inbox exceeded its 15-minute response target.", level: "Warning" }],
    activity: [
      { title: "Lead qualified", detail: "Website system enquiry", time: "10:07 AM", status: "Success" },
      { title: "Response SLA crossed", detail: "Sales Inbox · hot lead", time: "9:58 AM", status: "Watch" },
    ],
  },
  {
    slug: "referrals",
    label: "Referrals",
    unit: "programs",
    singular: "program",
    description: "Control referral partners, introductions, rewards, ownership and proof permission.",
    accent: "violet",
    summary: [
      { label: "Programs", value: "2", detail: "Partners · Community" },
      { label: "Leads · 30 days", value: "3", detail: "All verified" },
      { label: "Close rate", value: "33%", detail: "Highest-quality source" },
      { label: "Needs attention", value: "0", detail: "No exceptions" },
    ],
    controls: [
      { id: "referral-attribution", title: "Referral attribution", detail: "Preserve the introducer on every lead and deal", enabled: true },
      { id: "referral-permission", title: "Permission gate", detail: "Never publish partner or client proof without consent", enabled: true },
      { id: "referral-reward", title: "Reward review", detail: "Founder confirms payouts and non-standard commitments", enabled: true },
    ],
    assets: [
      {
        slug: "partner-network",
        name: "Partner Network",
        identifier: "Local business introductions",
        status: "Live",
        health: "Healthy",
        leads: 2,
        conversion: "50%",
        lastSync: "Today",
        owner: "Founder",
        summary: "High-trust introductions from business and community partners.",
      },
      {
        slug: "community-referrals",
        name: "Student & Community",
        identifier: "Foundry and alumni introductions",
        status: "Live",
        health: "Healthy",
        leads: 1,
        conversion: "0%",
        lastSync: "Today",
        owner: "Urava Foundry",
        summary: "Introductions generated through students, alumni and trusted community members.",
      },
    ],
    tabs: ["Overview", "Leads", "Analytics", "Partners", "Rewards", "Automations", "Access", "Activity"],
    attention: [{ title: "No referral exceptions", detail: "All active introductions have a verified owner and permission state.", level: "Info" }],
    activity: [{ title: "Introduction verified", detail: "Partner Network · local consultant", time: "Yesterday", status: "Success" }],
  },
  {
    slug: "lead-finder",
    label: "Lead Finder",
    unit: "campaigns",
    singular: "campaign",
    description: "Control discovery campaigns, ICP filters, verification, scoring and safe handoff.",
    accent: "coral",
    summary: [
      { label: "Campaigns", value: "2", detail: "Local business · Immigration" },
      { label: "Leads · 30 days", value: "14", detail: "6 qualified" },
      { label: "Verification", value: "86%", detail: "12 of 14 verified" },
      { label: "Needs attention", value: "2", detail: "Contact data unverified" },
    ],
    controls: [
      { id: "finder-dedupe", title: "Deduplication", detail: "Block repeated companies, domains and contacts", enabled: true },
      { id: "finder-score", title: "ICP scoring", detail: "Score fit, intent, proof gap and delivery feasibility", enabled: true },
      { id: "finder-safety", title: "Contact safety", detail: "Verify contact data and respect do-not-contact state", enabled: true },
    ],
    assets: [
      {
        slug: "local-business",
        name: "Local Business Discovery",
        identifier: "Sheikhupura · Lahore corridor",
        status: "Live",
        health: "Needs attention",
        leads: 8,
        conversion: "12.5%",
        lastSync: "7 min ago",
        owner: "Orbit Autopilot",
        summary: "Finds local businesses with weak or incomplete digital presence.",
      },
      {
        slug: "immigration-icp",
        name: "Immigration Firms ICP",
        identifier: "Pakistan · consultancy segment",
        status: "Live",
        health: "Healthy",
        leads: 6,
        conversion: "16.7%",
        lastSync: "9 min ago",
        owner: "Urava Studio",
        summary: "Finds immigration firms with clear conversion and trust-system gaps.",
      },
    ],
    tabs: ["Overview", "Leads", "Analytics", "Searches", "Scoring", "Automations", "Integrations", "Access", "Activity"],
    attention: [{ title: "Two contacts are unverified", detail: "Keep them out of outreach until a verified business channel exists.", level: "Warning" }],
    activity: [
      { title: "Lead qualified", detail: "Immigration Firms ICP · score 84", time: "10:11 AM", status: "Success" },
      { title: "Contact quarantined", detail: "Local Business · verification failed", time: "9:48 AM", status: "Watch" },
    ],
  },
];

export function getLeadSource(slug: string) {
  return leadSources.find((source) => source.slug === slug);
}

export function getSourceAsset(sourceSlug: string, assetSlug: string) {
  return getLeadSource(sourceSlug)?.assets.find((asset) => asset.slug === assetSlug);
}
