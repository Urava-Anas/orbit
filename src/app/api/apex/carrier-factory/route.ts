import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspace } from "@/lib/workspace";
import {
  finalizeCarrierFactoryBatch,
  processCarrierFactoryWork,
  startCarrierFactory,
} from "@/lib/apex-lead-factory/runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const requestSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("start"),
      batchDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      quota: z.number().int().min(1).max(10_000).optional(),
      scanTarget: z.number().int().min(1_000).max(50_000).optional(),
      queueMultiplier: z.number().int().min(2).max(5).optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("work"),
      batchId: z.string().uuid(),
      limit: z.number().int().min(1).max(50).optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("finalize"),
      batchId: z.string().uuid(),
    })
    .strict(),
]);

function headers() {
  return {
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
}

/**
 * Owner/admin control surface for the internal lead factory.
 *
 * This endpoint generates/enriches internal prospect intelligence only. It does
 * not expose any email, SMS, call, production-deploy or billing action.
 */
export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > 8_192) {
    return NextResponse.json(
      { status: "invalid_input", message: "Carrier factory request is too large." },
      { status: 413, headers: headers() },
    );
  }

  const { workspace, role } = await requireWorkspace();
  if (role !== "owner" && role !== "admin") {
    return NextResponse.json(
      { status: "forbidden", message: "Apex Carrier Factory control is owner/admin only." },
      { status: 403, headers: headers() },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { status: "invalid_input", message: "Carrier factory body must be valid JSON." },
      { status: 400, headers: headers() },
    );
  }

  const parsed = requestSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { status: "invalid_input", message: "Carrier factory request does not match the allowed contract." },
      { status: 400, headers: headers() },
    );
  }

  try {
    if (parsed.data.action === "start") {
      const result = await startCarrierFactory({
        workspaceId: workspace.id,
        batchDate: parsed.data.batchDate,
        quota: parsed.data.quota,
        scanTarget: parsed.data.scanTarget,
        queueMultiplier: parsed.data.queueMultiplier,
      });
      return NextResponse.json({ status: "ok", action: "start", result }, { status: 200, headers: headers() });
    }

    if (parsed.data.action === "work") {
      const workerId = `api:${workspace.id}:${crypto.randomUUID()}`;
      const result = await processCarrierFactoryWork(
        workspace.id,
        parsed.data.batchId,
        workerId,
        parsed.data.limit ?? 25,
      );
      return NextResponse.json({ status: "ok", action: "work", result }, { status: 200, headers: headers() });
    }

    const result = await finalizeCarrierFactoryBatch(workspace.id, parsed.data.batchId);
    return NextResponse.json({ status: "ok", action: "finalize", result }, { status: 200, headers: headers() });
  } catch (error) {
    console.error("Apex Carrier Factory action failed", {
      workspaceId: workspace.id,
      action: parsed.data.action,
      error: error instanceof Error ? error.message : "unknown error",
    });
    return NextResponse.json(
      {
        status: "unavailable",
        message: "Carrier Factory could not complete this action safely. No outbound contact was attempted.",
      },
      { status: 503, headers: headers() },
    );
  }
}
