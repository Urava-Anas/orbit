import { NextResponse } from "next/server";
import { z } from "zod";
import { lookupAndPersistCarrierCore } from "@/lib/carrier-intelligence/service";
import { loadCarrier360Profile } from "@/lib/carrier-intelligence/read";
import { requireWorkspace } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

const requestSchema = z
  .object({
    query: z.string().trim().min(1).max(40),
    kind: z.enum(["mc", "dot"]).optional(),
  })
  .strict();

type LookupQuota = {
  allowed: boolean;
  remaining: number;
  resetAt: string;
};

function baseHeaders() {
  return {
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
}

function quotaHeaders(quota: LookupQuota) {
  return {
    "X-RateLimit-Remaining": String(quota.remaining),
    "X-RateLimit-Reset": quota.resetAt,
  };
}

async function consumeLookupQuota(
  supabase: Awaited<ReturnType<typeof requireWorkspace>>["supabase"],
  workspaceId: string,
): Promise<LookupQuota | null> {
  const { data, error } = await supabase.rpc("consume_apex_carrier_lookup_quota", {
    p_workspace_id: workspaceId,
    p_limit: 20,
    p_window_seconds: 60,
  });

  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row) return null;

  return {
    allowed: row.allowed === true,
    remaining: Math.max(0, Number(row.remaining ?? 0)),
    resetAt: String(row.reset_at ?? new Date(Date.now() + 60_000).toISOString()),
  };
}

function outcomeStatus(outcome: Awaited<ReturnType<typeof lookupAndPersistCarrierCore>>) {
  switch (outcome.status) {
    case "invalid_input":
      return 400;
    case "not_found":
      return 404;
    case "source_gap":
      return 424;
    case "manual_review":
      return 409;
    case "source_unavailable":
      return 503;
    case "ok":
      return 200;
  }
}

/**
 * Founder/admin-only Phase-1 API boundary.
 *
 * `requireWorkspace()` derives workspace tenancy from the authenticated Orbit
 * session. There is deliberately no workspaceId, carrierId, leadId or approval
 * decision accepted from the request body.
 */
export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > 4_096) {
    return NextResponse.json(
      { status: "invalid_input", message: "Carrier lookup request is too large." },
      { status: 413, headers: baseHeaders() },
    );
  }

  const { workspace, role, supabase } = await requireWorkspace();
  if (role !== "owner" && role !== "admin") {
    return NextResponse.json(
      { status: "forbidden", message: "Carrier Intelligence pilot access is restricted." },
      { status: 403, headers: baseHeaders() },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { status: "invalid_input", message: "Carrier lookup body must be valid JSON." },
      { status: 400, headers: baseHeaders() },
    );
  }

  const parsed = requestSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { status: "invalid_input", message: "Enter a valid MC or USDOT number." },
      { status: 400, headers: baseHeaders() },
    );
  }

  const quota = await consumeLookupQuota(supabase, workspace.id);
  if (!quota) {
    return NextResponse.json(
      { status: "source_unavailable", message: "Carrier lookup quota service unavailable." },
      { status: 503, headers: baseHeaders() },
    );
  }
  if (!quota.allowed) {
    return NextResponse.json(
      { status: "rate_limited", message: "Too many carrier lookups. Try again shortly." },
      { status: 429, headers: { ...baseHeaders(), ...quotaHeaders(quota) } },
    );
  }

  try {
    const outcome = await lookupAndPersistCarrierCore({
      workspaceId: workspace.id,
      query: parsed.data.query,
      preferredKind: parsed.data.kind,
    });

    if (outcome.status !== "ok") {
      return NextResponse.json(outcome, {
        status: outcomeStatus(outcome),
        headers: { ...baseHeaders(), ...quotaHeaders(quota) },
      });
    }

    const profile = await loadCarrier360Profile(workspace.id, outcome.carrierId);
    if (!profile) {
      return NextResponse.json(
        {
          status: "manual_review",
          message: "Carrier was persisted but Carrier 360 could not be reconstructed.",
        },
        {
          status: 500,
          headers: { ...baseHeaders(), ...quotaHeaders(quota) },
        },
      );
    }

    return NextResponse.json(
      {
        status: "ok",
        carrierId: outcome.carrierId,
        resolvedDotNumber: outcome.resolvedDotNumber,
        created: outcome.created,
        refreshed: outcome.sourceRecordInserted,
        profile,
      },
      { status: 200, headers: { ...baseHeaders(), ...quotaHeaders(quota) } },
    );
  } catch (error) {
    console.error("Carrier 360 lookup failed", {
      workspaceId: workspace.id,
      error: error instanceof Error ? error.message : "unknown error",
    });

    return NextResponse.json(
      {
        status: "source_unavailable",
        message: "Carrier 360 lookup could not be completed safely.",
      },
      { status: 503, headers: { ...baseHeaders(), ...quotaHeaders(quota) } },
    );
  }
}
