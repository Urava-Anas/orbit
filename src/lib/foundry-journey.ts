import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type JourneyClass = {
  id: string;
  title: string;
  department: string | null;
  instructor_name: string;
  starts_at: string;
  ends_at: string;
  mode: string;
  join_url: string | null;
  status: string;
  level_number: number;
};

export type JourneyResource = {
  id: string;
  student_id: string | null;
  department: string | null;
  level_number: number;
  title: string;
  resource_url: string | null;
  content: string | null;
  resource_kind: string;
  status: string;
};

export type JourneyTask = {
  id: string;
  title: string;
  instructions_roman_urdu: string;
  difficulty: string;
  points: number;
  level_number: number;
};

export type JourneyAssignment = {
  id: string;
  task_id: string;
  student_id: string;
  status: string;
  starts_at: string;
  due_at: string;
  foundry_tasks: JourneyTask | null;
};

export type JourneyStudioAssignment = {
  id: string;
  student_id: string;
  project_id: string;
  project_name_snapshot: string;
  level_number: number;
  role_title: string;
  deliverable: string;
  starts_at: string;
  due_at: string;
  status: string;
};

export type JourneyNote = {
  id: string;
  class_id: string;
  class_title_snapshot: string;
  class_date: string;
  learning_state: string;
  progress_summary: string | null;
  next_step: string | null;
  resource_url: string | null;
  impact_title: string | null;
  impact_statement: string | null;
  achievement_title: string | null;
  achievement_description: string | null;
  evidence_requirement: string | null;
  xp_reward: number;
};

export type JourneyProgressEvent = {
  id: string;
  event_type: string;
  title: string;
  detail: string | null;
  points: number;
  source_type: string | null;
  source_id: string | null;
  occurred_at: string;
};

export type FoundryJourney = {
  classes: JourneyClass[];
  resources: JourneyResource[];
  assignments: JourneyAssignment[];
  studioAssignments: JourneyStudioAssignment[];
  notes: JourneyNote[];
  progress: JourneyProgressEvent[];
};

export async function loadFoundryJourney(
  supabase: SupabaseClient,
  workspaceId: string,
  studentId: string,
  department: string,
): Promise<FoundryJourney> {
  const [
    classesResult,
    resourcesResult,
    assignmentsResult,
    studioResult,
    notesResult,
    progressResult,
  ] = await Promise.all([
    supabase
      .from("foundry_classes")
      .select(
        "id, title, department, instructor_name, starts_at, ends_at, mode, join_url, status, level_number",
      )
      .eq("workspace_id", workspaceId)
      .or(`department.is.null,department.eq.${department}`)
      .order("level_number")
      .order("starts_at"),
    supabase
      .from("foundry_level_resources")
      .select(
        "id, student_id, department, level_number, title, resource_url, content, resource_kind, status",
      )
      .eq("workspace_id", workspaceId)
      .eq("status", "published")
      .or(`student_id.is.null,student_id.eq.${studentId}`)
      .or(`department.is.null,department.eq.${department}`)
      .order("level_number")
      .order("created_at"),
    supabase
      .from("foundry_task_assignments")
      .select(
        "id, task_id, student_id, status, starts_at, due_at, foundry_tasks(id, title, instructions_roman_urdu, difficulty, points, level_number)",
      )
      .eq("workspace_id", workspaceId)
      .eq("student_id", studentId)
      .order("starts_at"),
    supabase
      .from("foundry_studio_assignments")
      .select(
        "id, student_id, project_id, project_name_snapshot, level_number, role_title, deliverable, starts_at, due_at, status",
      )
      .eq("workspace_id", workspaceId)
      .eq("student_id", studentId)
      .order("starts_at"),
    supabase
      .from("foundry_class_learning_notes")
      .select(
        "id, class_id, class_title_snapshot, class_date, learning_state, progress_summary, next_step, resource_url, impact_title, impact_statement, achievement_title, achievement_description, evidence_requirement, xp_reward",
      )
      .eq("workspace_id", workspaceId)
      .eq("student_id", studentId)
      .order("class_date"),
    supabase
      .from("foundry_progress_events")
      .select(
        "id, event_type, title, detail, points, source_type, source_id, occurred_at",
      )
      .eq("workspace_id", workspaceId)
      .eq("student_id", studentId)
      .order("occurred_at", { ascending: false })
      .limit(100),
  ]);

  const errors = [
    classesResult.error,
    resourcesResult.error,
    assignmentsResult.error,
    studioResult.error,
    notesResult.error,
    progressResult.error,
  ].filter(Boolean);

  if (errors.length) {
    throw new Error(`Foundry journey could not be loaded: ${errors[0]?.message}`);
  }

  return {
    classes: (classesResult.data ?? []) as unknown as JourneyClass[],
    resources: (resourcesResult.data ?? []) as unknown as JourneyResource[],
    assignments: (assignmentsResult.data ?? []) as unknown as JourneyAssignment[],
    studioAssignments: (studioResult.data ?? []) as unknown as JourneyStudioAssignment[],
    notes: (notesResult.data ?? []) as unknown as JourneyNote[],
    progress: (progressResult.data ?? []) as unknown as JourneyProgressEvent[],
  };
}
