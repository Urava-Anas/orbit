import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createPublicClient } from "@/lib/supabase/public";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const departments = [
  "unassigned",
  "creative_ui",
  "web_app",
  "ai_automation",
  "sales_calling",
  "operations",
  "content_media",
] as const;

const difficultyStates = ["starter", "standard", "stretch", "recovery"] as const;
const skillDimensions = [
  "quality",
  "deadline",
  "communication",
  "revision",
  "teamwork",
  "reliability",
  "client_readiness",
] as const;

const assignTaskSchema = z.object({
  requestId: z.string().uuid(),
  studentId: z.string().uuid(),
  title: z.string().min(2).max(180),
  instructions: z.string().min(10).max(8000),
  department: z.enum(departments),
  difficulty: z.enum(difficultyStates),
  skillDimension: z.enum(skillDimensions).or(z.literal("")),
  points: z.number().int().min(0).max(100),
  dueAt: z.string().datetime({ offset: true }),
});

const updateStudentSchema = z.object({
  requestId: z.string().uuid(),
  studentId: z.string().uuid(),
  healthStatus: z.enum(["green", "yellow", "red", "gold"]),
  nextAction: z.string().max(500),
});

const reviewSubmissionSchema = z.object({
  requestId: z.string().uuid(),
  submissionId: z.string().uuid(),
  decision: z.enum(["accepted", "revision_required"]),
  feedback: z.string().min(3).max(8000),
  score: z.number().int().min(0).max(100),
});

const queueSyncSchema = z.object({
  requestId: z.string().uuid(),
});

type RouteContext = {
  params: Promise<{ action: string }>;
};

type OrbitRpcResponse = Record<string, unknown> & {
  ok?: boolean;
  httpStatus?: number;
  error?: string;
  message?: string;
};

function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const [scheme, token] = authorization.split(/\s+/, 2);
  if (
    scheme?.toLowerCase() !== "bearer" ||
    !token ||
    !/^orb_live_[A-Za-z0-9_-]{32,120}$/.test(token)
  ) {
    return null;
  }
  return token;
}

function unauthorized() {
  return NextResponse.json(
    {
      ok: false,
      error: "invalid_authorization",
      message: "A valid Orbit bearer key is required.",
    },
    { status: 401 },
  );
}

function rpcResponse(data: unknown) {
  const payload = (data ?? {
    ok: false,
    error: "empty_orbit_response",
    message: "Orbit returned no result.",
  }) as OrbitRpcResponse;
  const status =
    typeof payload.httpStatus === "number"
      ? Math.min(Math.max(payload.httpStatus, 400), 599)
      : payload.ok === false
        ? 400
        : 200;
  return NextResponse.json(payload, { status });
}

function rpcFailure(code?: string) {
  return NextResponse.json(
    {
      ok: false,
      error: "orbit_action_gateway_failed",
      message: "Orbit could not process this action request.",
      databaseCode: code ?? null,
    },
    { status: 500 },
  );
}

async function readBody(request: Request) {
  try {
    return await request.json();
  } catch {
    throw new Error("invalid_json");
  }
}

export async function GET(request: Request, context: RouteContext) {
  const { action } = await context.params;
  const token = bearerToken(request);
  if (!token) return unauthorized();

  const supabase = createPublicClient();
  const requestId = randomUUID();
  const url = new URL(request.url);

  if (action === "health") {
    const { data, error } = await supabase.rpc("orbit_gpt_health", {
      action_token: token,
      action_request_id: requestId,
    });
    return error ? rpcFailure(error.code) : rpcResponse(data);
  }

  if (action === "summary") {
    const { data, error } = await supabase.rpc("orbit_gpt_summary", {
      action_token: token,
      action_request_id: requestId,
    });
    return error ? rpcFailure(error.code) : rpcResponse(data);
  }

  if (action === "students") {
    const parsedLimit = Number(url.searchParams.get("limit") ?? 50);
    const { data, error } = await supabase.rpc("orbit_gpt_students", {
      action_token: token,
      action_request_id: requestId,
      target_health: url.searchParams.get("health") || null,
      target_lifecycle: url.searchParams.get("lifecycle") || null,
      target_limit: Number.isFinite(parsedLimit) ? parsedLimit : 50,
    });
    return error ? rpcFailure(error.code) : rpcResponse(data);
  }

  if (action === "audit") {
    const parsedLimit = Number(url.searchParams.get("limit") ?? 25);
    const { data, error } = await supabase.rpc("orbit_gpt_audit", {
      action_token: token,
      action_request_id: requestId,
      target_limit: Number.isFinite(parsedLimit) ? parsedLimit : 25,
    });
    return error ? rpcFailure(error.code) : rpcResponse(data);
  }

  return NextResponse.json(
    { ok: false, error: "unknown_action", message: "Unknown Orbit action." },
    { status: 404 },
  );
}

export async function POST(request: Request, context: RouteContext) {
  const { action } = await context.params;
  const token = bearerToken(request);
  if (!token) return unauthorized();

  let payload: unknown;
  try {
    payload = await readBody(request);
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json", message: "A valid JSON body is required." },
      { status: 400 },
    );
  }

  const supabase = createPublicClient();

  try {
    if (action === "assign-task") {
      const parsed = assignTaskSchema.parse(payload);
      const { data, error } = await supabase.rpc("orbit_gpt_assign_task", {
        action_token: token,
        action_request_id: parsed.requestId,
        target_student_id: parsed.studentId,
        task_title: parsed.title,
        task_instructions: parsed.instructions,
        task_department: parsed.department,
        task_difficulty: parsed.difficulty,
        task_skill_dimension: parsed.skillDimension,
        task_points: parsed.points,
        assignment_due_at: parsed.dueAt,
      });
      return error ? rpcFailure(error.code) : rpcResponse(data);
    }

    if (action === "update-student") {
      const parsed = updateStudentSchema.parse(payload);
      const { data, error } = await supabase.rpc("orbit_gpt_update_student", {
        action_token: token,
        action_request_id: parsed.requestId,
        target_student_id: parsed.studentId,
        target_health_status: parsed.healthStatus,
        target_next_action: parsed.nextAction,
      });
      return error ? rpcFailure(error.code) : rpcResponse(data);
    }

    if (action === "review-submission") {
      const parsed = reviewSubmissionSchema.parse(payload);
      const { data, error } = await supabase.rpc("orbit_gpt_review_submission", {
        action_token: token,
        action_request_id: parsed.requestId,
        target_submission_id: parsed.submissionId,
        review_decision: parsed.decision,
        review_feedback: parsed.feedback,
        review_score: parsed.score,
      });
      return error ? rpcFailure(error.code) : rpcResponse(data);
    }

    if (action === "queue-sync") {
      const parsed = queueSyncSchema.parse(payload);
      const { data, error } = await supabase.rpc("orbit_gpt_queue_sync", {
        action_token: token,
        action_request_id: parsed.requestId,
      });
      return error ? rpcFailure(error.code) : rpcResponse(data);
    }

    return NextResponse.json(
      { ok: false, error: "unknown_action", message: "Unknown Orbit action." },
      { status: 404 },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          ok: false,
          error: "invalid_payload",
          message: "Orbit action parameters are invalid.",
          issues: error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
        { status: 400 },
      );
    }
    return NextResponse.json(
      {
        ok: false,
        error: "orbit_action_failed",
        message: "Orbit could not complete this request.",
      },
      { status: 500 },
    );
  }
}
