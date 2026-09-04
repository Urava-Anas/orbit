import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspace } from "@/lib/workspace";
import {
  finalizeCarrierFactoryBatch,
  processCarrierFactoryWork,
  startCarrierFactory,
} from "@/lib/apex-lead-factory/runner";
import {
  getLatestCarrierFactoryBatch,
  listCarrierFactoryLeads,
} from "@/lib/apex-lead-factory/read";

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

function canControl(role: string) {
  return role === "owner" || role === "admin";
}

/**
 * Paginated read surface for the completed daily carrier dossiers. The API never
 * returns the entire 1,000-lead batch in one response.
 */
export async function GET(request: Request) {
  const { workspace, role } = await requireWorkspace();
  if (!canControl(role)) {
    return NextResponse.json(
      { status: "forbidden", message: "Apex Carrier Factory is owner/admin only." },
      { status: 403, headers: headers() },
    );
  }

  const url = new URL(request.url);
  const batchId = url.searchParams.get("batchId");
  const page = Number(url.searchParams.get("page") ?? "1");
  const pageSize = Number(url.searchParams.get("pageSize") ?? "25");
  const tierParam = url.searchParams.get("tier");
  const tier = tierParam === "A" || tierParam === "B" || tierParam === "C" ? tierParam : undefined;

  try {
    const latest = await getLatestCarrierFactoryBatch(workspace.id);
    const resolvedBatchId = batchId ?? latest?.id ?? null;
    if (!resolvedBatchId) {
      return NextResponse.json({ status: "ok", batch: null, leads: [] }, { status: 200, headers: headers() });
    }

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(resolvedBatchId)) {
      return NextResponse.json(
        { status: "invalid_input", message: "batchId must be a UUID." },
        { status: 400, headers: headers() },
      );
    }

    const result = await listCarrierFactoryLeads({
      workspaceId: workspace.id,
      batchId: resolvedBatchId,
      page: Number.isFinite(page) ? page : 1,
      pageSize: Number.isFinite(pageSize) ? pageSize : 25,
      tier,
    });

    return NextResponse.json(
      {
        status: "ok",
        batch: latest?.id === resolvedBatchId ? latest : { id: resolvedBatchId },
        ...result,
      },
      { status: 200, headers: headers() },
    );
  } catch (error) {
    console.error("Apex Carrier Factory read failed", {
      workspaceId: workspace.id,
      error: error instanceof Error ? error.message : "unknown error",
    });
    return NextResponse.json(
      { status: "unavailable", message: "Carrier Factory dossiers could not be read safely." },
      { status: 503, headers: headers() },
    );
  }
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
  if (!canControl(role)) {
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
