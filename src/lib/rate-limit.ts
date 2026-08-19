import "server-only";

import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: string;
};

function subjectHash(subject: string) {
  return createHash("sha256").update(subject, "utf8").digest("hex");
}

export async function consumeRateLimit(input: {
  scope: string;
  subject: string;
  limit: number;
  windowSeconds: number;
}): Promise<RateLimitResult> {
  const admin = createAdminClient();
  if (!admin) {
    // Production-sensitive endpoints fail closed if the quota store is unavailable.
    return { allowed: false, remaining: 0, resetAt: new Date(Date.now() + 60_000).toISOString() };
  }

  const { data, error } = await admin.rpc("consume_orbit_rate_limit", {
    p_scope: input.scope,
    p_subject_hash: subjectHash(input.subject),
    p_limit: input.limit,
    p_window_seconds: input.windowSeconds,
  });
  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row) {
    return { allowed: false, remaining: 0, resetAt: new Date(Date.now() + 60_000).toISOString() };
  }

  return {
    allowed: row.allowed === true,
    remaining: Math.max(0, Number(row.remaining ?? 0)),
    resetAt: String(row.reset_at ?? new Date(Date.now() + input.windowSeconds * 1000).toISOString()),
  };
}

export function rateLimitHeaders(result: RateLimitResult) {
  return {
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": result.resetAt,
  };
}
