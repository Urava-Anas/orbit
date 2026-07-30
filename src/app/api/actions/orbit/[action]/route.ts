import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  authenticateOrbitAction,
  beginOrbitActionCall,
  completeOrbitActionCall,
  OrbitActionError,
  type OrbitActionScope,
} from "@/lib/orbit-actions";

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

const actionScopes: Record<string, OrbitActionScope> = {
  health: "foundry.read",
  summary: "foundry.read",
  students: "students.read",
  audit: "audit.read",
  "assign-task": "tasks.write",
  "update-student": "students.write",
  "review-submission": "submissions.write",
  "queue-sync": "integrations.write",
};

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

function jsonError(error: unknown, requestId?: string, callId?: string) {
  if (error instanceof OrbitActionError) {
    return NextResponse.json(
      {
        ok: false,
        error: error.code,
        message: error.message,
        requestId,
        callId,
      },
      { status: error.status },
    );
  }

  console.error("Orbit GPT action failed", error);
  return NextResponse.json(
    {
      ok: false,
      error: "orbit_action_failed",
      message: "Orbit could not complete this action.",
      requestId,
      callId,
    },
    { status: 500 },
  );
}

async function readJson(request: Request) {
  try {
    return await request.json();
  } catch {
    throw new OrbitActionError("A valid JSON body is required.", 400, "invalid_json");
  }
}

async function handleRead(request: Request, action: string) {
  const scope = actionScopes[action];
  if (!scope) {
    return NextResponse.json(
      { ok: false, error: "unknown_action", message: "Unknown Orbit action." },
      { status: 404 },
    );
  }

  let callId: string | undefined;
  const requestId = randomUUID();

  try {
    const { admin, key } = await authenticateOrbitAction(request, scope);
    callId = await beginOrbitActionCall({
      admin,
      key,
      operation: action,
      requestId,
      requestSummary: {},
    });

    if (action === "health") {
      const [studentsResult, callsResult] = await Promise.all([
        admin
          .from("foundry_students")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", key.workspace_id),
        admin
          .from("orbit_action_calls")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", key.workspace_id)
          .eq("status", "failed")
          .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
      ]);

      if (studentsResult.error || callsResult.error) {
        throw new OrbitActionError(
          "Orbit health data could not be loaded.",
          500,
          "health_query_failed",
        );
      }

      const result = {
        ok: true,
        status: "healthy",
        checkedAt: new Date().toISOString(),
        metrics: {
          students: studentsResult.count ?? 0,
          failedActionsLast24Hours: callsResult.count ?? 0,
        },
        requestId,
        callId,
      };

      await completeOrbitActionCall({
        admin,
        callId,
        status: "succeeded",
        responseSummary: result.metrics,
      });
      return NextResponse.json(result);
    }

    if (action === "summary") {
      const [studentsResult, submissionsResult, assignmentsResult, deliveriesResult] =
        await Promise.all([
          admin
            .from("foundry_students")
            .select(
              "id, foundry_id, full_name, health_status, progress_percent, lifecycle_status, next_action, auth_user_id, studio_eligible",
            )
            .eq("workspace_id", key.workspace_id)
            .order("foundry_id"),
          admin
            .from("foundry_submissions")
            .select("id, student_id, status, submitted_at")
            .eq("workspace_id", key.workspace_id)
            .in("status", ["submitted", "under_review"]),
          admin
            .from("foundry_task_assignments")
            .select("id, student_id, status, due_at")
            .eq("workspace_id", key.workspace_id)
            .not("status", "in", '("completed","submitted","under_review")'),
          admin
            .from("foundry_external_deliveries")
            .select("id, channel, status, last_error, created_at")
            .eq("workspace_id", key.workspace_id)
            .in("status", ["pending", "processing", "failed"])
            .order("created_at", { ascending: false })
            .limit(20),
        ]);

      if (
        studentsResult.error ||
        submissionsResult.error ||
        assignmentsResult.error ||
        deliveriesResult.error
      ) {
        throw new OrbitActionError(
          "Orbit founder summary could not be loaded.",
          500,
          "summary_query_failed",
        );
      }

      const students = studentsResult.data ?? [];
      const activeStudents = students.filter(
        (student) =>
          !["inactive", "graduated", "rejected"].includes(student.lifecycle_status),
      );
      const atRisk = students.filter((student) =>
        ["yellow", "red"].includes(student.health_status),
      );

      const result = {
        ok: true,
        metrics: {
          students: students.length,
          activeStudents: activeStudents.length,
          connectedStudents: students.filter((student) => student.auth_user_id).length,
          atRiskStudents: atRisk.length,
          studioReadyStudents: students.filter((student) => student.studio_eligible).length,
          submissionsAwaitingReview: submissionsResult.data?.length ?? 0,
          openAssignments: assignmentsResult.data?.length ?? 0,
          integrationItemsNeedingWork: deliveriesResult.data?.length ?? 0,
        },
        needsAttention: atRisk.slice(0, 10).map((student) => ({
          studentId: student.id,
          foundryId: student.foundry_id,
          fullName: student.full_name,
          healthStatus: student.health_status,
          progressPercent: student.progress_percent,
          nextAction: student.next_action,
        })),
        integrationQueue: deliveriesResult.data ?? [],
        requestId,
        callId,
      };

      await completeOrbitActionCall({
        admin,
        callId,
        status: "succeeded",
        responseSummary: result.metrics,
      });
      return NextResponse.json(result);
    }

    if (action === "students") {
      const url = new URL(request.url);
      const health = url.searchParams.get("health");
      const lifecycle = url.searchParams.get("lifecycle");
      const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 50), 1), 100);

      let query = admin
        .from("foundry_students")
        .select(
          "id, foundry_id, full_name, email, department, level, lifecycle_status, health_status, progress_percent, device_access, preferred_language, main_goal, next_action, studio_eligible, auth_user_id, updated_at",
        )
        .eq("workspace_id", key.workspace_id)
        .order("foundry_id")
        .limit(limit);

      if (health) query = query.eq("health_status", health);
      if (lifecycle) query = query.eq("lifecycle_status", lifecycle);

      const { data, error } = await query;
      if (error) {
        throw new OrbitActionError(
          "Orbit students could not be loaded.",
          500,
          "students_query_failed",
        );
      }

      const result = {
        ok: true,
        students: data ?? [],
        count: data?.length ?? 0,
        requestId,
        callId,
      };
      await completeOrbitActionCall({
        admin,
        callId,
        status: "succeeded",
        responseSummary: { count: result.count },
      });
      return NextResponse.json(result);
    }

    if (action === "audit") {
      const url = new URL(request.url);
      const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 25), 1), 100);
      const { data, error } = await admin
        .from("orbit_action_calls")
        .select(
          "id, operation, request_id, request_summary, response_summary, status, error_code, created_at, completed_at",
        )
        .eq("workspace_id", key.workspace_id)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) {
        throw new OrbitActionError(
          "Orbit action audit could not be loaded.",
          500,
          "audit_query_failed",
        );
      }

      const result = {
        ok: true,
        actions: data ?? [],
        count: data?.length ?? 0,
        requestId,
        callId,
      };
      await completeOrbitActionCall({
        admin,
        callId,
        status: "succeeded",
        responseSummary: { count: result.count },
      });
      return NextResponse.json(result);
    }

    throw new OrbitActionError("This Orbit action requires POST.", 405, "method_not_allowed");
  } catch (error) {
    if (callId) {
      const admin = await import("@/lib/supabase/admin").then(({ createAdminClient }) =>
        createAdminClient(),
      );
      await completeOrbitActionCall({
        admin,
        callId,
        status: error instanceof OrbitActionError && error.status < 500 ? "denied" : "failed",
        errorCode: error instanceof OrbitActionError ? error.code : "orbit_action_failed",
      });
    }
    return jsonError(error, requestId, callId);
  }
}

async function handleWrite(request: Request, action: string) {
  const scope = actionScopes[action];
  if (!scope) {
    return NextResponse.json(
      { ok: false, error: "unknown_action", message: "Unknown Orbit action." },
      { status: 404 },
    );
  }

  let callId: string | undefined;
  let requestId: string | undefined;

  try {
    const payload = await readJson(request);
    const { admin, key } = await authenticateOrbitAction(request, scope);

    if (action === "assign-task") {
      const parsed = assignTaskSchema.parse(payload);
      requestId = parsed.requestId;
      callId = await beginOrbitActionCall({
        admin,
        key,
        operation: action,
        requestId,
        requestSummary: {
          studentId: parsed.studentId,
          title: parsed.title,
          department: parsed.department,
          difficulty: parsed.difficulty,
          dueAt: parsed.dueAt,
        },
      });

      const { data, error } = await admin.rpc("orbit_action_assign_task", {
        action_workspace_id: key.workspace_id,
        action_actor_id: key.actor_id,
        action_request_id: parsed.requestId,
        target_student_id: parsed.studentId,
        task_title: parsed.title,
        task_instructions_roman_urdu: parsed.instructions,
        task_department: parsed.department,
        task_difficulty: parsed.difficulty,
        task_skill_dimension: parsed.skillDimension,
        task_points: parsed.points,
        assignment_due_at: parsed.dueAt,
      });

      if (error) {
        throw new OrbitActionError(error.message, 400, "task_assignment_failed");
      }

      const result = { ok: true, result: data, requestId, callId };
      await completeOrbitActionCall({
        admin,
        callId,
        status: "succeeded",
        responseSummary: (data as Record<string, unknown> | null) ?? {},
      });
      return NextResponse.json(result);
    }

    if (action === "update-student") {
      const parsed = updateStudentSchema.parse(payload);
      requestId = parsed.requestId;
      callId = await beginOrbitActionCall({
        admin,
        key,
        operation: action,
        requestId,
        requestSummary: {
          studentId: parsed.studentId,
          healthStatus: parsed.healthStatus,
          hasNextAction: Boolean(parsed.nextAction),
        },
      });

      const { data, error } = await admin.rpc("orbit_action_update_student", {
        action_workspace_id: key.workspace_id,
        action_actor_id: key.actor_id,
        action_request_id: parsed.requestId,
        target_student_id: parsed.studentId,
        target_health_status: parsed.healthStatus,
        target_next_action: parsed.nextAction,
      });

      if (error) {
        throw new OrbitActionError(error.message, 400, "student_update_failed");
      }

      const result = { ok: true, result: data, requestId, callId };
      await completeOrbitActionCall({
        admin,
        callId,
        status: "succeeded",
        responseSummary: (data as Record<string, unknown> | null) ?? {},
      });
      return NextResponse.json(result);
    }

    if (action === "review-submission") {
      const parsed = reviewSubmissionSchema.parse(payload);
      requestId = parsed.requestId;
      callId = await beginOrbitActionCall({
        admin,
        key,
        operation: action,
        requestId,
        requestSummary: {
          submissionId: parsed.submissionId,
          decision: parsed.decision,
          score: parsed.score,
        },
      });

      const { data, error } = await admin.rpc("orbit_action_review_submission", {
        action_workspace_id: key.workspace_id,
        action_actor_id: key.actor_id,
        action_request_id: parsed.requestId,
        target_submission_id: parsed.submissionId,
        review_decision: parsed.decision,
        review_feedback: parsed.feedback,
        review_score: parsed.score,
      });

      if (error) {
        throw new OrbitActionError(error.message, 400, "submission_review_failed");
      }

      const result = { ok: true, result: data, requestId, callId };
      await completeOrbitActionCall({
        admin,
        callId,
        status: "succeeded",
        responseSummary: (data as Record<string, unknown> | null) ?? {},
      });
      return NextResponse.json(result);
    }

    if (action === "queue-sync") {
      const parsed = queueSyncSchema.parse(payload);
      requestId = parsed.requestId;
      callId = await beginOrbitActionCall({
        admin,
        key,
        operation: action,
        requestId,
        requestSummary: {},
      });

      const { data, error } = await admin.rpc("orbit_action_queue_sync", {
        action_workspace_id: key.workspace_id,
        action_actor_id: key.actor_id,
        action_request_id: parsed.requestId,
      });

      if (error) {
        throw new OrbitActionError(error.message, 400, "sync_queue_failed");
      }

      const result = { ok: true, result: data, requestId, callId };
      await completeOrbitActionCall({
        admin,
        callId,
        status: "succeeded",
        responseSummary: (data as Record<string, unknown> | null) ?? {},
      });
      return NextResponse.json(result);
    }

    throw new OrbitActionError("This Orbit action requires GET.", 405, "method_not_allowed");
  } catch (error) {
    if (callId) {
      const admin = await import("@/lib/supabase/admin").then(({ createAdminClient }) =>
        createAdminClient(),
      );
      await completeOrbitActionCall({
        admin,
        callId,
        status: error instanceof OrbitActionError && error.status < 500 ? "denied" : "failed",
        errorCode:
          error instanceof z.ZodError
            ? "invalid_payload"
            : error instanceof OrbitActionError
              ? error.code
              : "orbit_action_failed",
      });
    }

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
          requestId,
          callId,
        },
        { status: 400 },
      );
    }

    return jsonError(error, requestId, callId);
  }
}

export async function GET(request: Request, context: RouteContext) {
  const { action } = await context.params;
  return handleRead(request, action);
}

export async function POST(request: Request, context: RouteContext) {
  const { action } = await context.params;
  return handleWrite(request, action);
}
