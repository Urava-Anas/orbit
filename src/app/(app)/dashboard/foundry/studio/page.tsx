import type { Metadata } from "next";
import { randomUUID } from "node:crypto";
import Link from "next/link";
import {
  ArrowUpRight,
  BriefcaseBusiness,
  CheckCircle2,
  Clock3,
  FolderKanban,
  Plus,
  Sparkles,
} from "lucide-react";
import { FoundryActionButton } from "@/components/foundry/FoundryActionButton";
import { EmptyFoundryState, FoundryNotice, HealthBadge } from "@/components/foundry/FoundryUI";
import { formatFoundryDate, foundryDepartmentLabel, requireFounderFoundry } from "@/lib/foundry";
import { assignStudioWork, updateStudioWorkStatus } from "./actions";

export const metadata: Metadata = {
  title: "Foundry Studio Work",
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

type Project = {
  id: string;
  name: string;
  status: string;
  start_date: string | null;
  due_date: string | null;
};

type Assignment = {
  id: string;
  student_id: string;
  project_id: string;
  project_name_snapshot: string;
  level_number: number;
  role_title: string;
  deliverable: string;
  starts_at: string;
  due_at: string;
  status: "planned" | "active" | "completed" | "cancelled";
};

function bucket(item: Assignment, now: number) {
  if (["completed", "cancelled"].includes(item.status)) return "past" as const;
  if (item.status === "planned" && new Date(item.starts_at).getTime() > now) {
    return "upcoming" as const;
  }
  return "current" as const;
}

export default async function FoundryStudioPage({ searchParams }: Props) {
  const query = await searchParams;
  const { supabase, workspace } = await requireFounderFoundry();
  const [studentsResult, projectsResult, assignmentsResult] = await Promise.all([
    supabase
      .from("foundry_students")
      .select("id, foundry_id, full_name, department, health_status, lifecycle_status")
      .eq("workspace_id", workspace.id)
      .not("lifecycle_status", "in", '("inactive","graduated","rejected")')
      .order("foundry_id"),
    supabase
      .from("projects")
      .select("id, name, status, start_date, due_date")
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("foundry_studio_assignments")
      .select(
        "id, student_id, project_id, project_name_snapshot, level_number, role_title, deliverable, starts_at, due_at, status",
      )
      .eq("workspace_id", workspace.id)
      .order("starts_at", { ascending: false }),
  ]);

  const students = (studentsResult.data ?? []) as Student[];
  const projects = (projectsResult.data ?? []) as Project[];
  const assignments = (assignmentsResult.data ?? []) as Assignment[];
  const selected =
    students.find((student) => student.id === query.studentId) ?? students[0] ?? null;
  const selectedAssignments = selected
    ? assignments.filter((item) => item.student_id === selected.id)
    : [];
  const now = Date.now();
  const current = selectedAssignments.filter((item) => bucket(item, now) === "current");
  const upcoming = selectedAssignments.filter((item) => bucket(item, now) === "upcoming");
  const past = selectedAssignments.filter((item) => bucket(item, now) === "past");

  return (
    <div className="foundry-page">
      <FoundryNotice error={query.error} notice={query.notice} />

      <section className="foundry-page-title">
        <div>
          <span className="foundry-kicker">Learning → real project delivery</span>
          <h1>Studio Work</h1>
          <p>
            Assign members to real Orbit projects with a level, role, deliverable and
            time window. The assignment appears on the same Journey Map.
          </p>
        </div>
        <Link className="foundry-button foundry-button-primary" href="/dashboard/projects">
          Open Orbit projects
          <FolderKanban aria-hidden="true" size={17} />
        </Link>
      </section>

      {students.length ? (
        <section className="foundry-card">
          <div className="foundry-card-head">
            <div>
              <span className="foundry-card-eyebrow">Choose member</span>
              <h2>Who are you assigning to Studio?</h2>
            </div>
            <BriefcaseBusiness aria-hidden="true" size={20} />
          </div>
          <div className="progress-student-grid">
            {students.map((student) => (
              <Link
                className={`progress-student-card ${
                  selected?.id === student.id ? "is-studio-ready" : ""
                }`}
                href={`/dashboard/foundry/studio?studentId=${student.id}`}
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
              <Sparkles aria-hidden="true" size={18} />
              <b>{current.length}</b> current
            </span>
            <span>
              <Clock3 aria-hidden="true" size={18} />
              <b>{upcoming.length}</b> upcoming
            </span>
            <span>
              <CheckCircle2 aria-hidden="true" size={18} />
              <b>{past.length}</b> past
            </span>
          </section>

          <section className="foundry-split-layout">
            <article className="foundry-card">
              <div className="foundry-card-head">
                <div>
                  <span className="foundry-card-eyebrow">Project history</span>
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

              {(["current", "upcoming", "past"] as const).map((group) => {
                const items = group === "current" ? current : group === "upcoming" ? upcoming : past;
                return (
                  <section key={group} style={{ marginTop: 16 }}>
                    <div className="foundry-card-head">
                      <div>
                        <span className="foundry-card-eyebrow">{group}</span>
                        <h3>{group === "past" ? "Completed / closed work" : `${group[0].toUpperCase()}${group.slice(1)} work`}</h3>
                      </div>
                      <span className="foundry-count">{items.length}</span>
                    </div>
                    {items.length ? (
                      <div className="assignment-board">
                        {items.map((item) => (
                          <article className="assignment-card" key={item.id}>
                            <div className="assignment-card-head">
                              <span className="foundry-id">Level {item.level_number}</span>
                              <span className={`task-state task-state-${item.status}`}>
                                {item.status}
                              </span>
                            </div>
                            <h3>{item.project_name_snapshot}</h3>
                            <p>
                              <strong>{item.role_title}</strong> · {item.deliverable}
                            </p>
                            <div className="assignment-card-meta">
                              <span>Starts {formatFoundryDate(item.starts_at)}</span>
                              <span>Due {formatFoundryDate(item.due_at)}</span>
                            </div>
                            {!['completed','cancelled'].includes(item.status) ? (
                              <div className="foundry-class-actions">
                                {item.status === "planned" ? (
                                  <form action={updateStudioWorkStatus}>
                                    <input name="assignmentId" type="hidden" value={item.id} />
                                    <input name="studentId" type="hidden" value={selected.id} />
                                    <FoundryActionButton
                                      className="foundry-class-action is-live"
                                      name="status"
                                      pendingLabel="Starting…"
                                      value="active"
                                    >
                                      Start
                                    </FoundryActionButton>
                                  </form>
                                ) : null}
                                <form action={updateStudioWorkStatus}>
                                  <input name="assignmentId" type="hidden" value={item.id} />
                                  <input name="studentId" type="hidden" value={selected.id} />
                                  <FoundryActionButton
                                    className="foundry-class-action"
                                    name="status"
                                    pendingLabel="Completing…"
                                    value="completed"
                                  >
                                    Complete
                                  </FoundryActionButton>
                                </form>
                                <form action={updateStudioWorkStatus}>
                                  <input name="assignmentId" type="hidden" value={item.id} />
                                  <input name="studentId" type="hidden" value={selected.id} />
                                  <FoundryActionButton
                                    className="foundry-class-action is-danger"
                                    name="status"
                                    pendingLabel="Cancelling…"
                                    value="cancelled"
                                  >
                                    Cancel
                                  </FoundryActionButton>
                                </form>
                              </div>
                            ) : null}
                          </article>
                        ))}
                      </div>
                    ) : (
                      <EmptyFoundryState
                        title={`No ${group} Studio work`}
                        detail="This part of the member's project history is clear."
                      />
                    )}
                  </section>
                );
              })}
            </article>

            <aside className="foundry-card">
              <div className="foundry-card-head">
                <div>
                  <span className="foundry-card-eyebrow">Real assignment</span>
                  <h2>Assign project work</h2>
                </div>
                <Plus aria-hidden="true" size={20} />
              </div>

              {projects.length ? (
                <form action={assignStudioWork} className="foundry-form">
                  <input name="requestId" type="hidden" value={randomUUID()} />
                  <input name="studentId" type="hidden" value={selected.id} />
                  <label>
                    Orbit project
                    <select name="projectId" required>
                      <option value="">Select project</option>
                      {projects.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.name} · {project.status}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Level
                    <input defaultValue="1" max="100" min="1" name="levelNumber" required type="number" />
                  </label>
                  <label>
                    Member role
                    <input name="roleTitle" placeholder="UI/UX Designer" required />
                  </label>
                  <label>
                    Deliverable
                    <textarea
                      name="deliverable"
                      placeholder="What exactly should this member deliver on the project?"
                      required
                      rows={4}
                    />
                  </label>
                  <label>
                    Starts (PKT)
                    <input name="startsAt" required type="datetime-local" />
                  </label>
                  <label>
                    Due (PKT)
                    <input name="dueAt" required type="datetime-local" />
                  </label>
                  <FoundryActionButton
                    className="foundry-button foundry-button-dark"
                    pendingLabel="Assigning project…"
                  >
                    Assign & add to map
                  </FoundryActionButton>
                </form>
              ) : (
                <EmptyFoundryState
                  title="No Orbit project exists yet"
                  detail="Studio only assigns real project work. Create a project in Delivery first, then come back here."
                  href="/dashboard/projects"
                  action="Create / open projects"
                />
              )}
            </aside>
          </section>
        </>
      ) : (
        <EmptyFoundryState
          title="No active member"
          detail="Add a member before assigning Studio work."
          href="/dashboard/foundry/students"
          action="Open members"
        />
      )}
    </div>
  );
}
