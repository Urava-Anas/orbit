export const AUTOPILOT_STORAGE_KEY = "orbit.lead-engine.autopilot.v1";
export const AUTOPILOT_SNAPSHOT_VERSION = 1;

export type AutopilotState =
  | "off"
  | "checking"
  | "running"
  | "pausing"
  | "blocked"
  | "degraded";

export type PreflightStatus = "pass" | "warning" | "fail";
export type AuthorityLevel = "green" | "amber" | "red";
export type QueueStatus =
  | "queued"
  | "running"
  | "retrying"
  | "waiting_approval"
  | "quarantined"
  | "completed";

export type LoopStage = {
  id: string;
  label: string;
  shortLabel: string;
  count: number;
};

export type PreflightCheck = {
  id: string;
  label: string;
  detail: string;
  status: PreflightStatus;
  required: boolean;
};

export type QueueJob = {
  id: string;
  idempotencyKey: string;
  title: string;
  lead: string;
  stageId: string;
  authority: AuthorityLevel;
  status: QueueStatus;
  attempts: number;
  maxAttempts: number;
  continueWhenOff?: boolean;
  lastError?: string;
};

export type AuditEntry = {
  id: string;
  action: string;
  detail: string;
  at: string;
};

export type AutopilotSnapshot = {
  version: typeof AUTOPILOT_SNAPSHOT_VERSION;
  state: AutopilotState;
  cycle: number;
  activeStageIndex: number;
  studioCapacity: number;
  jobs: QueueJob[];
  audit: AuditEntry[];
  lastChangedAt: string;
};

export const LOOP_STAGES: LoopStage[] = [
  { id: "sources", label: "Lead sources", shortLabel: "Sources", count: 31 },
  { id: "verify", label: "Verify & deduplicate", shortLabel: "Verify", count: 26 },
  { id: "score", label: "Score for fit", shortLabel: "Score", count: 18 },
  { id: "outreach", label: "Personalised outreach", shortLabel: "Outreach", count: 12 },
  { id: "follow-up", label: "Bounded follow-up", shortLabel: "Follow-up", count: 8 },
  { id: "close", label: "Close within policy", shortLabel: "Close", count: 4 },
  { id: "delivery", label: "Studio delivery", shortLabel: "Delivery", count: 6 },
  { id: "payment", label: "Collect payment", shortLabel: "Payment", count: 3 },
  { id: "proof", label: "Permissioned proof", shortLabel: "Proof", count: 2 },
  { id: "content", label: "Content & referrals", shortLabel: "Content", count: 5 },
  { id: "new-leads", label: "Create new leads", shortLabel: "New leads", count: 9 },
];

export const DEFAULT_PREFLIGHT_CHECKS: PreflightCheck[] = [
  {
    id: "sources",
    label: "Connected sources",
    detail: "7 sources healthy",
    status: "pass",
    required: true,
  },
  {
    id: "offer",
    label: "Approved offer",
    detail: "Website growth system",
    status: "pass",
    required: true,
  },
  {
    id: "pricing",
    label: "Pricing range",
    detail: "PKR 80k–180k locked",
    status: "pass",
    required: true,
  },
  {
    id: "messages",
    label: "Message policy",
    detail: "Cashvertising gate active",
    status: "pass",
    required: true,
  },
  {
    id: "capacity",
    label: "Studio capacity",
    detail: "72% · balanced pace",
    status: "pass",
    required: true,
  },
  {
    id: "hours",
    label: "Working hours",
    detail: "Outreach window open",
    status: "pass",
    required: false,
  },
  {
    id: "channels",
    label: "Channel health",
    detail: "All providers responding",
    status: "pass",
    required: true,
  },
];

export const AUTHORITY_RULES: Array<{
  level: AuthorityLevel;
  title: string;
  rule: string;
  actions: string[];
}> = [
  {
    level: "green",
    title: "Orbit executes",
    rule: "Routine and reversible",
    actions: ["Verify & deduplicate", "Score leads", "Schedule", "Bounded follow-up"],
  },
  {
    level: "amber",
    title: "Policy executes",
    rule: "Only inside founder limits",
    actions: ["Personalised outreach", "Proposal within range", "Approved nurture"],
  },
  {
    level: "red",
    title: "Founder confirms",
    rule: "Money, risk or irreversible",
    actions: ["Price exception", "Contract or refund", "Sensitive access", "Publish proof"],
  },
];

export const REPLY_CLASSES = [
  { label: "Interested", count: 4, action: "Book discovery", tone: "green" },
  { label: "Objection", count: 2, action: "Answer with proof", tone: "amber" },
  { label: "Later", count: 3, action: "Enter nurture", tone: "blue" },
  { label: "Not relevant", count: 1, action: "Archive cleanly", tone: "muted" },
  { label: "Opt-out", count: 0, action: "Do not contact", tone: "red" },
] as const;

export const CASHVERTISING_GATE = [
  "Buyer clarity",
  "Biggest benefit",
  "Specificity",
  "Proof",
  "Truthful scarcity",
  "Risk reduction",
  "Easy next action",
] as const;

const INITIAL_JOBS: QueueJob[] = [
  {
    id: "job-verify-12842",
    idempotencyKey: "lead-12842:verify:v1",
    title: "Verify decision-maker contact",
    lead: "Demo logistics partner",
    stageId: "verify",
    authority: "green",
    status: "running",
    attempts: 1,
    maxAttempts: 3,
  },
  {
    id: "job-score-12841",
    idempotencyKey: "lead-12841:score:v1",
    title: "Score against Studio ICP",
    lead: "Demo education group",
    stageId: "score",
    authority: "green",
    status: "queued",
    attempts: 0,
    maxAttempts: 3,
  },
  {
    id: "job-outreach-12837",
    idempotencyKey: "lead-12837:outreach:policy-4",
    title: "Send benefit-first outreach",
    lead: "Demo clinic network",
    stageId: "outreach",
    authority: "amber",
    status: "queued",
    attempts: 0,
    maxAttempts: 3,
  },
  {
    id: "job-followup-12826",
    idempotencyKey: "lead-12826:follow-up:2",
    title: "Retry WhatsApp follow-up",
    lead: "Demo property advisor",
    stageId: "follow-up",
    authority: "green",
    status: "retrying",
    attempts: 1,
    maxAttempts: 3,
    lastError: "Provider timeout · retry scheduled",
  },
  {
    id: "job-price-12818",
    idempotencyKey: "lead-12818:price-exception:v1",
    title: "Approve price below policy",
    lead: "Demo immigration partner",
    stageId: "close",
    authority: "red",
    status: "waiting_approval",
    attempts: 0,
    maxAttempts: 1,
  },
  {
    id: "job-delivery-0042",
    idempotencyKey: "project-0042:delivery:milestone-3",
    title: "Continue paid delivery milestone",
    lead: "Demo retained client",
    stageId: "delivery",
    authority: "green",
    status: "running",
    attempts: 1,
    maxAttempts: 3,
    continueWhenOff: true,
  },
  {
    id: "job-proof-0029",
    idempotencyKey: "client-0029:proof-permission:v1",
    title: "Request proof permission",
    lead: "Demo completed client",
    stageId: "proof",
    authority: "red",
    status: "waiting_approval",
    attempts: 0,
    maxAttempts: 1,
  },
  {
    id: "job-email-12819",
    idempotencyKey: "lead-12819:email-verify:v1",
    title: "Email verification failed",
    lead: "Demo local business",
    stageId: "verify",
    authority: "green",
    status: "quarantined",
    attempts: 3,
    maxAttempts: 3,
    lastError: "Mailbox rejected all verification attempts",
  },
];

const INITIAL_AUDIT: AuditEntry[] = [
  {
    id: "audit-4",
    action: "Queue retry scheduled",
    detail: "WhatsApp follow-up · attempt 2 of 3",
    at: "2026-08-09T10:18:00.000Z",
  },
  {
    id: "audit-3",
    action: "Founder gate created",
    detail: "Price exception moved to red authority",
    at: "2026-08-09T10:15:00.000Z",
  },
  {
    id: "audit-2",
    action: "Duplicate suppressed",
    detail: "Google lead already existed in Website source",
    at: "2026-08-09T10:12:00.000Z",
  },
  {
    id: "audit-1",
    action: "Autopilot preflight passed",
    detail: "7 checks passed · campaign policy v4",
    at: "2026-08-09T10:10:00.000Z",
  },
];

export function createInitialAutopilotSnapshot(): AutopilotSnapshot {
  return {
    version: AUTOPILOT_SNAPSHOT_VERSION,
    state: "running",
    cycle: 12,
    activeStageIndex: 1,
    studioCapacity: 72,
    jobs: INITIAL_JOBS.map((job) => ({ ...job })),
    audit: INITIAL_AUDIT.map((entry) => ({ ...entry })),
    lastChangedAt: "2026-08-09T10:18:00.000Z",
  };
}

export function isAutopilotSnapshot(value: unknown): value is AutopilotSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<AutopilotSnapshot>;
  return (
    snapshot.version === AUTOPILOT_SNAPSHOT_VERSION &&
    typeof snapshot.state === "string" &&
    typeof snapshot.cycle === "number" &&
    typeof snapshot.activeStageIndex === "number" &&
    typeof snapshot.studioCapacity === "number" &&
    Array.isArray(snapshot.jobs) &&
    Array.isArray(snapshot.audit)
  );
}

export function evaluatePreflight(checks: PreflightCheck[]): AutopilotState {
  if (checks.some((check) => check.required && check.status === "fail")) return "blocked";
  if (checks.some((check) => check.status !== "pass")) return "degraded";
  return "running";
}

export function requestAutopilotStart(
  snapshot: AutopilotSnapshot,
  at: string,
): AutopilotSnapshot {
  if (!["off", "blocked"].includes(snapshot.state)) return snapshot;
  return appendAudit(
    { ...snapshot, state: "checking", lastChangedAt: at },
    "Preflight started",
    "Checking policy, capacity and channel health",
    at,
  );
}

export function completeAutopilotStart(
  snapshot: AutopilotSnapshot,
  checks: PreflightCheck[],
  at: string,
): AutopilotSnapshot {
  if (snapshot.state !== "checking") return snapshot;
  const nextState = evaluatePreflight(checks);
  const detail =
    nextState === "running"
      ? `${checks.length} checks passed · engine running`
      : nextState === "degraded"
        ? "Engine started with bounded channel limits"
        : "A required safety check failed";
  return appendAudit(
    { ...snapshot, state: nextState, lastChangedAt: at },
    nextState === "blocked" ? "Preflight blocked" : "Preflight completed",
    detail,
    at,
  );
}

export function requestAutopilotStop(
  snapshot: AutopilotSnapshot,
  at: string,
): AutopilotSnapshot {
  if (!["running", "degraded", "blocked", "checking"].includes(snapshot.state)) return snapshot;
  return appendAudit(
    { ...snapshot, state: "pausing", lastChangedAt: at },
    "Safe stop requested",
    "Discovery and unsent outreach are draining; paid work stays protected",
    at,
  );
}

export function completeAutopilotStop(
  snapshot: AutopilotSnapshot,
  at: string,
): AutopilotSnapshot {
  if (snapshot.state !== "pausing") return snapshot;
  const jobs = snapshot.jobs.map((job) => {
    if (job.continueWhenOff || job.status !== "running") return job;
    return { ...job, status: "queued" as const };
  });
  return appendAudit(
    { ...snapshot, jobs, state: "off", lastChangedAt: at },
    "Autopilot stopped safely",
    "Inbound replies and paid delivery remain protected",
    at,
  );
}

export function enqueueUniqueJob(
  snapshot: AutopilotSnapshot,
  job: QueueJob,
  at: string,
): { snapshot: AutopilotSnapshot; inserted: boolean } {
  const duplicate = snapshot.jobs.find(
    (candidate) => candidate.idempotencyKey === job.idempotencyKey,
  );
  if (duplicate) {
    return {
      inserted: false,
      snapshot: appendAudit(
        snapshot,
        "Duplicate suppressed",
        `${job.title} reused ${duplicate.idempotencyKey}`,
        at,
      ),
    };
  }
  return {
    inserted: true,
    snapshot: appendAudit(
      { ...snapshot, jobs: [...snapshot.jobs, job], lastChangedAt: at },
      "Job queued",
      `${job.title} · ${job.authority} authority`,
      at,
    ),
  };
}

export function tickAutopilot(
  snapshot: AutopilotSnapshot,
  at: string,
): AutopilotSnapshot {
  if (!["running", "degraded"].includes(snapshot.state)) return snapshot;

  const nextStageIndex = (snapshot.activeStageIndex + 1) % LOOP_STAGES.length;
  const wrapped = nextStageIndex === 0;
  const stage = LOOP_STAGES[nextStageIndex];

  let jobs = snapshot.jobs.map((job) => {
    if (job.status !== "running" || job.continueWhenOff) return job;
    return { ...job, status: "completed" as const };
  });

  const nextJobIndex = jobs.findIndex(
    (job) =>
      job.stageId === stage.id &&
      ["queued", "retrying"].includes(job.status) &&
      job.authority !== "red",
  );

  if (nextJobIndex >= 0) {
    jobs = jobs.map((job, index) =>
      index === nextJobIndex
        ? {
            ...job,
            status: "running" as const,
            attempts: Math.min(job.attempts + 1, job.maxAttempts),
            lastError: undefined,
          }
        : job,
    );
  }

  return appendAudit(
    {
      ...snapshot,
      jobs,
      cycle: wrapped ? snapshot.cycle + 1 : snapshot.cycle,
      activeStageIndex: nextStageIndex,
      lastChangedAt: at,
    },
    `${stage.shortLabel} batch processed`,
    nextJobIndex >= 0 ? jobs[nextJobIndex].title : "No unsafe action was released",
    at,
  );
}

export function getGovernor(studioCapacity: number): {
  mode: "Growth" | "Balanced" | "Constrained" | "Protect";
  outreachPace: number;
  message: string;
} {
  if (studioCapacity >= 95) {
    return {
      mode: "Protect",
      outreachPace: 0,
      message: "New outreach stopped; hot leads and delivery only",
    };
  }
  if (studioCapacity >= 80) {
    return {
      mode: "Constrained",
      outreachPace: 30,
      message: "Discovery reduced; high-value leads first",
    };
  }
  if (studioCapacity >= 60) {
    return {
      mode: "Balanced",
      outreachPace: 65,
      message: "Capacity available with controlled acquisition",
    };
  }
  return {
    mode: "Growth",
    outreachPace: 100,
    message: "Studio can safely accept more qualified work",
  };
}

export function getQueueCounts(jobs: QueueJob[]): Record<QueueStatus, number> {
  return jobs.reduce<Record<QueueStatus, number>>(
    (counts, job) => ({ ...counts, [job.status]: counts[job.status] + 1 }),
    {
      queued: 0,
      running: 0,
      retrying: 0,
      waiting_approval: 0,
      quarantined: 0,
      completed: 0,
    },
  );
}

export function formatKernelTime(iso: string): string {
  return new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(new Date(iso));
}

function appendAudit(
  snapshot: AutopilotSnapshot,
  action: string,
  detail: string,
  at: string,
): AutopilotSnapshot {
  const nextEntry: AuditEntry = {
    id: `audit-${at}-${snapshot.audit.length + 1}`,
    action,
    detail,
    at,
  };
  return { ...snapshot, audit: [nextEntry, ...snapshot.audit].slice(0, 24) };
}
