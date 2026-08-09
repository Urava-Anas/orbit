import type { Metadata } from "next";
import { randomUUID } from "node:crypto";
import Link from "next/link";
import {
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  Clock3,
  History,
  Plus,
  RotateCcw,
  Send,
  Sparkles,
} from "lucide-react";
import { FoundryActionButton } from "@/components/foundry/FoundryActionButton";
import { EmptyFoundryState, FoundryNotice, HealthBadge } from "@/components/foundry/FoundryUI";
import {
  formatFoundryDate,
  foundryDepartmentLabel,
  requireFounderFoundry,
} from "@/lib/foundry";
import { createJourneyTask } from "./journey-actions";

export const metadata: Metadata = {
  title: "Foundry Tasks",
  robots: { index: false, follow: false },
};

type Props = {
  searchParams: Promise<{ studentId?: string; notice?: string; error?: string }>;
};

type Student = {
  id: string;
  foundry_id: string;
  full_name: string;
  department: string;
  health_status: "green" | "yellow" | "red" | "gold";
  lifecycle_status: string;
};

type Task = {
  id: string;
  title: string;
  instructions_roman_urdu: string;
  department: string;
  difficulty: string;
  skill_dimension: string | null;
  points: number;
  status: string;
  level_number: number;
  created_at: string;
};

type Assignment = {
  id: string;
  student_id: string;
  status: string;
  starts_at: string;
  due_at: string;
  recovery_for_assignment_id: string | null;
  foundry_tasks: Task | null;
};

function taskState(assignment: Assignment, now: number) {
  if (assignment.status === "completed") return "done" as const;
  if (["cancelled", "missed"].includes(assignment.status)) return "done" as const;
  if (new Date(assignment.starts_at).getTime() > now) return "upcoming" as const;
  return "current" as const;
}

export default async function FoundryTasksPage({ searchParams }: Props) {
  const query = await searchParams;
  const { supabase, workspace } = await requireFounderFoundry();
  const [studentsResult, tasksResult, assignmentsResult] = await Promise.all([
    supabase
      .from("foundry_students")
      .select("id, foundry_id, full_name, department, health_status, lifecycle_status")
      .eq("workspace_id", workspace.id)
      .not("lifecycle_status", "in", '("inactive","graduated","rejected")')
      .order("foundry_id"),
    supabase
      .from("foundry_tasks")
      .select(
        "id, title, instructions_roman_urdu, department, difficulty, skill_dimension, points, status, level_number, created_at",
      )
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("foundry_task_assignments")
      .select(
        "id, student_id, status, starts_at, due_at, recovery_for_assignment_id, foundry_tasks(id, title, instructions_roman_urdu, department, difficulty, skill_dimension, points, status, level_number, created_at)",
      )
      .eq("workspace_id", workspace.id)
      .order("starts_at", { ascending: false }),
  ]);

  const students = (studentsResult.data ?? []) as Student[];
  const tasks = (tasksResult.data ?? []) as Task[];
  const assignments = (assignmentsResult.data ?? []) as unknown as Assignment[];
  const selected =
    students.find((student) => student.id === query.studentId) ?? students[0] ?? null;
  const selectedAssignments = selected
    ? assignments.filter((assignment) => assignment.student_id === selected.id)
    : [];
  const now = Date.now();
  const done = selectedAssignments.filter((item) => taskState(item, now) === "done");
  const current = selectedAssignments.filter((item) => taskState(item, now) === "current");
  const upcoming = selectedAssignments.filter((item) => taskState(item, now) === "upcoming");

  return (
    <div className="foundry-page">
      <FoundryNotice error={query.error} notice={query.notice} />

      <section className="foundry-page-title">
        <div>
          <span className="foundry-kicker">Member → level → task → proof</span>
          <h1>Tasks</h1>
          <p>
            Choose a member first. Orbit then shows the full task history: completed,
            current and future work, each attached to a specific level.
          </p>
        </div>
        <Link className="foundry-button foundry-button-primary" href="/dashboard/foundry/submissions">
          Review submissions
          <Send aria-hidden="true" size={16} />
        </Link>
      </section>

      {students.length ? (
        <section className="foundry-card">
          <div className="foundry-card-head">
            <div>
              <span className="foundry-card-eyebrow">Choose member</span>
              <h2>Whose task journey are you managing?</h2>
            </div>
            <History aria-hidden="true" size={20} />
          </div>
          <div className="progress-student-grid">
            {students.map((student) => (
              <Link
                className={`progress-student-card ${
                  selected?.id === student.id ? "is-studio-ready" : ""
                }`}
                href={`/dashboard/foundry/tasks?studentId=${student.id}`}
                key={student.id}
              >
                <div>
                  <span className="foundry-avatar is-small">
                    {student.full_name
                      .split(" ")
                      .slice(0, 2)
                      .map((part) => part[0])
                      .join("")
                      .toUpperCase()}
                  </span>
                  <span>
                    <small>{student.foundry_id}</small>
                    <strong>{student.full_name}</strong>
                    <em>{foundryDepartmentLabel(student.department)}</em>
                  </span>
                </div>
                <HealthBadge health={student.health_status} />
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {selected ? (
        <>
          <section className="foundry-summary-strip">
            <span>
              <CheckCircle2 aria-hidden="true" size={18} />
              <b>{done.length}</b> done
            </span>
            <span>
              <Sparkles aria-hidden="true" size={18} />
              <b>{current.length}</b> current
            </span>
            <span>
              <Clock3 aria-hidden="true" size={18} />
              <b>{upcoming.length}</b> upcoming
            </span>
          </section>

          <section className="foundry-split-layout is-tasks">
            <article className="foundry-card">
              <div className="foundry-card-head">
                <div>
                  <span className="foundry-card-eyebrow">Full task history</span>
                  <h2>{selected.full_name}</h2>
                </div>
                <Link
                  className="foundry-button foundry-button-quiet"
                  href={`/dashboard/foundry/map?studentId=${selected.id}`}
                >
                  Open map
                  <ArrowUpRight aria-hidden="true" size={14} />
                </Link>
              </div>

              {(["current", "upcoming", "done"] as const).map((group) => {
                const items = group === "current" ? current : group === "upcoming" ? upcoming : done;
                return (
                  <section key={group} style={{ marginTop: 16 }}>
                    <div className="foundry-card-head">
                      <div>
                        <span className="foundry-card-eyebrow">{group}</span>
                        <h3>{group === "done" ? "Completed history" : `${group[0].toUpperCase()}${group.slice(1)} tasks`}</h3>
                      </div>
                      <span className="foundry-count">{items.length}</span>
                    </div>
                    {items.length ? (
                      <div className="assignment-board">
                        {items.map((assignment) => (
                          <article className="assignment-card" key={assignment.id}>
                            <div className="assignment-card-head">
                              <span className="foundry-id">
                                Level {assignment.foundry_tasks?.level_number ?? 1}
                              </span>
                              <span className={`task-state task-state-${assignment.status}`}>
                                {assignment.status.replaceAll("_", " ")}
                              </span>
                            </div>
                            <h3>{assignment.foundry_tasks?.title ?? "Assigned task"}</h3>
                            <p>{assignment.foundry_tasks?.instructions_roman_urdu}</p>
                            <div className="assignment-card-meta">
                              <span>
                                <Clock3 aria-hidden="true" size={14} />
                                Starts {formatFoundryDate(assignment.starts_at)}
                              </span>
                              <span>
                                <Clock3 aria-hidden="true" size={14} />
                                Due {formatFoundryDate(assignment.due_at)}
                              </span>
                              <span>
                                {assignment.foundry_tasks?.difficulty === "recovery" ? (
                                  <RotateCcw aria-hidden="true" size={14} />
                                ) : (
                                  <Sparkles aria-hidden="true" size={14} />
                                )}
                                {assignment.foundry_tasks?.difficulty ?? "starter"}
                              </span>
                            </div>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <EmptyFoundryState
                        title={`No ${group} tasks`}
                        detail="This part of the member task history is clear."
                      />
                    )}
                  </section>
                );
              })}
            </article>

            <aside className="foundry-card">
              <div className="foundry-card-head">
                <div>
                  <span className="foundry-card-eyebrow">New level task</span>
                  <h2>Assign to {selected.full_name}</h2>
                </div>
                <Plus aria-hidden="true" size={20} />
              </div>
              <form action={createJourneyTask} className="foundry-form">
                <input name="requestId" type="hidden" value={randomUUID()} />
                <input name="studentId" type="hidden" value={selected.id} />
                <label>
                  Level
                  <input defaultValue="1" max="100" min="1" name="levelNumber" required type="number" />
                </label>
                <label>
                  Task title
                  <input name="title" placeholder="Build Level 3 user flow" required />
                </label>
                <label>
                  Roman Urdu steps
                  <textarea
                    name="instructions"
                    placeholder="1) Brief parhein. 2) Work banayein. 3) Proof submit karein."
                    required
                    rows={6}
                  />
                </label>
                <div className="foundry-form-grid">
                  <label>
                    Department
                    <select defaultValue={selected.department} name="department">
                      <option value="unassigned">Any / Unassigned</option>
                      <option value="creative_ui">Creative & UI</option>
                      <option value="web_app">Web & App</option>
                      <option value="ai_automation">AI & Automation</option>
                      <option value="sales_calling">Sales & Calling</option>
                      <option value="operations">Operations</option>
                      <option value="content_media">Content & Media</option>
                    </select>
                  </label>
                  <label>
                    Difficulty
                    <select defaultValue="starter" name="difficulty">
                      <option value="starter">Starter</option>
                      <option value="standard">Standard</option>
                      <option value="stretch">Stretch</option>
                      <option value="recovery">Recovery</option>
                    </select>
                  </label>
                  <label>
                    Skill signal
                    <select defaultValue="" name="skillDimension">
                      <option value="">Not scored yet</option>
                      <option value="quality">Quality</option>
                      <option value="deadline">Deadline</option>
                      <option value="communication">Communication</option>
                      <option value="revision">Revision</option>
                      <option value="teamwork">Teamwork</option>
                      <option value="reliability">Reliability</option>
                      <option value="client_readiness">Client readiness</option>
                    </select>
                  </label>
                  <label>
                    Points
                    <input defaultValue="10" max="100" min="0" name="points" type="number" />
                  </label>
                  <label className="is-wide">
                    Available from (PKT)
                    <input name="startsAt" required type="datetime-local" />
                  </label>
                  <label className="is-wide">
                    Due (PKT)
                    <input name="dueAt" required type="datetime-local" />
                  </label>
                </div>
                <FoundryActionButton
                  className="foundry-button foundry-button-dark"
                  pendingLabel="Assigning task…"
                >
                  Assign & add to map
                </FoundryActionButton>
              </form>
            </aside>
          </section>
        </>
      ) : (
        <EmptyFoundryState
          title="No active member"
          detail="Add a member before assigning level tasks."
          href="/dashboard/foundry/students"
          action="Open members"
        />
      )}

      <section className="foundry-card">
        <div className="foundry-card-head">
          <div>
            <span className="foundry-card-eyebrow">Reusable library</span>
            <h2>Task templates</h2>
          </div>
          <BookOpen aria-hidden="true" size={20} />
        </div>
        {tasks.length ? (
          <div className="task-template-grid">
            {tasks.map((task) => (
              <article key={task.id}>
                <span className={`task-state task-state-${task.difficulty}`}>
                  Level {task.level_number} · {task.difficulty}
                </span>
                <h3>{task.title}</h3>
                <p>{task.instructions_roman_urdu}</p>
                <small>
                  {foundryDepartmentLabel(task.department)} · {task.points} points
                </small>
              </article>
            ))}
          </div>
        ) : (
          <EmptyFoundryState
            title="No task templates yet"
            detail="Assigning the first task will also create its reusable template."
          />
        )}
      </section>
    </div>
  );
}
