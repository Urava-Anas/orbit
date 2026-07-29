import type { Metadata } from "next";
import { randomUUID } from "node:crypto";
import Link from "next/link";
import {
  ArrowUpRight,
  BookOpen,
  Clock3,
  Plus,
  RotateCcw,
  Send,
  Sparkles,
} from "lucide-react";
import {
  EmptyFoundryState,
  FoundryNotice,
  HealthBadge,
} from "@/components/foundry/FoundryUI";
import { FoundryActionButton } from "@/components/foundry/FoundryActionButton";
import {
  formatFoundryDate,
  foundryDepartmentLabel,
  listFoundryTasks,
} from "@/lib/foundry";
import { createFoundryTask } from "../actions";

export const metadata: Metadata = {
  title: "Foundry Tasks",
  robots: { index: false, follow: false },
};

type Props = {
  searchParams: Promise<{ notice?: string; error?: string }>;
};

export default async function FoundryTasksPage({ searchParams }: Props) {
  const messages = await searchParams;
  const { tasks, assignments, students } = await listFoundryTasks();
  const activeAssignments = assignments.filter(
    (assignment) => assignment.status !== "completed",
  );
  const recoveryCount = assignments.filter(
    (assignment) =>
      assignment.recovery_for_assignment_id ||
      assignment.foundry_tasks?.difficulty === "recovery",
  ).length;

  return (
    <div className="foundry-page">
      <FoundryNotice error={messages.error} notice={messages.notice} />
      <section className="foundry-page-title">
        <div>
          <span className="foundry-kicker">Practice → feedback → improve</span>
          <h1>Tasks</h1>
          <p>Har student ko ek clear next step. Miss ho to pehle easier recovery.</p>
        </div>
        <Link
          className="foundry-button foundry-button-primary"
          href="/dashboard/foundry/submissions"
        >
          Review submissions
          <Send aria-hidden="true" size={16} />
        </Link>
      </section>

      <section className="foundry-summary-strip">
        <span>
          <BookOpen aria-hidden="true" size={18} />
          <b>{tasks.length}</b> task templates
        </span>
        <span>
          <Clock3 aria-hidden="true" size={18} />
          <b>{activeAssignments.length}</b> active assignments
        </span>
        <span>
          <RotateCcw aria-hidden="true" size={18} />
          <b>{recoveryCount}</b> recovery tasks
        </span>
      </section>

      <section className="foundry-split-layout is-tasks">
        <article className="foundry-card">
          <div className="foundry-card-head">
            <div>
              <span className="foundry-card-eyebrow">Student queue</span>
              <h2>Assigned work</h2>
            </div>
            <span className="foundry-count">{assignments.length}</span>
          </div>
          {assignments.length ? (
            <div className="assignment-board">
              {assignments.map((assignment) => (
                <article
                  className={`assignment-card ${
                    assignment.foundry_tasks?.difficulty === "recovery"
                      ? "is-recovery"
                      : ""
                  }`}
                  key={assignment.id}
                >
                  <div className="assignment-card-head">
                    <HealthBadge
                      health={assignment.foundry_students?.health_status ?? "yellow"}
                    />
                    <span className={`task-state task-state-${assignment.status}`}>
                      {assignment.status.replaceAll("_", " ")}
                    </span>
                  </div>
                  <h3>{assignment.foundry_tasks?.title ?? "Assigned task"}</h3>
                  <p>
                    {assignment.foundry_students?.full_name ?? "Student"} ·{" "}
                    {assignment.foundry_students?.foundry_id}
                  </p>
                  <div className="assignment-card-meta">
                    <span>
                      <Clock3 aria-hidden="true" size={14} />
                      {formatFoundryDate(assignment.due_at)}
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
                  {assignment.foundry_students?.id ? (
                    <Link
                      className="foundry-text-link"
                      href={`/dashboard/foundry/students/${assignment.foundry_students.id}/portal`}
                    >
                      Student view <ArrowUpRight aria-hidden="true" size={14} />
                    </Link>
                  ) : null}
                </article>
              ))}
            </div>
          ) : (
            <EmptyFoundryState
              title="No active assignments"
              detail="Right-side form se pehla simple task assign karein."
            />
          )}
        </article>

        <aside className="foundry-card">
          <div className="foundry-card-head">
            <div>
              <span className="foundry-card-eyebrow">One clear action</span>
              <h2>Create & assign</h2>
            </div>
            <Plus aria-hidden="true" size={20} />
          </div>
          <form action={createFoundryTask} className="foundry-form">
            <input name="requestId" type="hidden" value={randomUUID()} />
            <label>
              Student
              <select name="studentId" required>
                <option value="">Select student</option>
                {students.map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.foundry_id} · {student.full_name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Task title
              <input name="title" placeholder="Pehla portfolio card" required />
            </label>
            <label>
              Roman Urdu steps
              <textarea
                name="instructions"
                placeholder="1) App kholein. 2) ... 3) Screenshot save karein. 4) Submit karein."
                required
                rows={6}
              />
            </label>
            <div className="foundry-form-grid">
              <label>
                Department
                <select defaultValue="unassigned" name="department">
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
                Due (PKT)
                <input name="dueAt" required type="datetime-local" />
              </label>
            </div>
            <FoundryActionButton
              className="foundry-button foundry-button-dark"
              pendingLabel="Publishing task…"
            >
              Publish & assign
            </FoundryActionButton>
          </form>
        </aside>
      </section>

      <section className="foundry-card">
        <div className="foundry-card-head">
          <div>
            <span className="foundry-card-eyebrow">Reusable library</span>
            <h2>Task templates</h2>
          </div>
          <BookOpen aria-hidden="true" size={20} />
        </div>
        <div className="task-template-grid">
          {tasks.map((task) => (
            <article key={task.id}>
              <span className={`task-state task-state-${task.difficulty}`}>
                {task.difficulty}
              </span>
              <h3>{task.title}</h3>
              <p>{task.instructions_roman_urdu}</p>
              <small>
                {foundryDepartmentLabel(task.department)} · {task.points} points
              </small>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
