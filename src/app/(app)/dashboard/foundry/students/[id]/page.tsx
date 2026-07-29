import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  CalendarCheck,
  CircleCheck,
  Clock3,
  Languages,
  MessageSquareText,
  MonitorSmartphone,
  Send,
  Sparkles,
  Target,
  Trophy,
} from "lucide-react";
import {
  EmptyFoundryState,
  FoundryNotice,
  FoundryProgressBar,
  HealthBadge,
} from "@/components/foundry/FoundryUI";
import {
  formatFoundryDate,
  foundryDepartmentLabel,
  foundryLevelLabel,
  getFoundryStudent,
} from "@/lib/foundry";
import { updateFoundryStudent } from "../../actions";

export const metadata: Metadata = {
  title: "Foundry Student Record",
  robots: { index: false, follow: false },
};

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string; error?: string }>;
};

export default async function FoundryStudentPage({ params, searchParams }: Props) {
  const { id } = await params;
  const messages = await searchParams;
  const { student, assignments, submissions, attendance, skills, progress } =
    await getFoundryStudent(id);

  if (!student) notFound();

  const attendanceRate = attendance.length
    ? Math.round(
        (attendance.filter((record) =>
          ["present", "late"].includes(record.status),
        ).length /
          attendance.length) *
          100,
      )
    : 0;

  return (
    <div className="foundry-page">
      <FoundryNotice error={messages.error} notice={messages.notice} />
      <Link className="foundry-back-inline" href="/dashboard/foundry/students">
        <ArrowLeft aria-hidden="true" size={16} />
        Student roster
      </Link>

      <section className="student-record-hero">
        <div className="student-record-identity">
          <span className="foundry-avatar is-large">
            {student.full_name
              .split(" ")
              .slice(0, 2)
              .map((part) => part[0])
              .join("")
              .toUpperCase()}
          </span>
          <div>
            <span className="foundry-id">{student.foundry_id}</span>
            <h1>{student.full_name}</h1>
            <p>
              {foundryDepartmentLabel(student.department)} ·{" "}
              {foundryLevelLabel(student.level)}
            </p>
            <div className="student-record-badges">
              <HealthBadge health={student.health_status} />
              <span
                className={
                  student.auth_user_id
                    ? "foundry-access-state is-connected"
                    : "foundry-access-state"
                }
              >
                {student.auth_user_id ? (
                  <CircleCheck aria-hidden="true" size={14} />
                ) : (
                  <Clock3 aria-hidden="true" size={14} />
                )}
                {student.auth_user_id ? "Orbit connected" : "Waiting for sign-in"}
              </span>
              <span>
                <MonitorSmartphone aria-hidden="true" size={14} />
                {student.device_access.replaceAll("_", " ")}
              </span>
              <span>
                <Languages aria-hidden="true" size={14} />
                {student.preferred_language.replaceAll("_", " ")}
              </span>
            </div>
          </div>
        </div>
        <div className="student-record-progress">
          <div>
            <strong>{student.progress_percent}%</strong>
            <span>Journey complete</span>
          </div>
          <FoundryProgressBar value={student.progress_percent} />
          <Link
            className="foundry-button foundry-button-primary"
            href={`/dashboard/foundry/students/${student.id}/portal`}
          >
            Open student view
            <ArrowUpRight aria-hidden="true" size={16} />
          </Link>
        </div>
      </section>

      <nav className="student-record-tabs" aria-label="Student record sections">
        {[
          "Profile",
          "Goals",
          "Classes",
          "Attendance",
          "Tasks",
          "Feedback",
          "Skills",
          "Studio",
        ].map((label) => (
          <a href={`#${label.toLowerCase()}`} key={label}>
            {label}
          </a>
        ))}
      </nav>

      <section className="student-record-grid">
        <article className="foundry-card" id="profile">
          <div className="foundry-card-head">
            <div>
              <span className="foundry-card-eyebrow">Permanent record</span>
              <h2>Profile & next step</h2>
            </div>
            <Target aria-hidden="true" size={20} />
          </div>
          <form action={updateFoundryStudent} className="foundry-form">
            <input name="studentId" type="hidden" value={student.id} />
            <div className="foundry-form-grid">
              <label>
                Department
                <select defaultValue={student.department} name="department">
                  <option value="unassigned">Unassigned</option>
                  <option value="creative_ui">Creative & UI</option>
                  <option value="web_app">Web & App</option>
                  <option value="ai_automation">AI & Automation</option>
                  <option value="sales_calling">Sales & Calling</option>
                  <option value="operations">Operations</option>
                  <option value="content_media">Content & Media</option>
                </select>
              </label>
              <label>
                Health
                <select defaultValue={student.health_status} name="healthStatus">
                  <option value="green">Green — progressing</option>
                  <option value="yellow">Yellow — needs support</option>
                  <option value="red">Red — urgent</option>
                  <option value="gold">Gold — Studio Ready</option>
                </select>
              </label>
              <label>
                Progress %
                <input
                  defaultValue={student.progress_percent}
                  max="100"
                  min="0"
                  name="progressPercent"
                  type="number"
                />
              </label>
              <label className="is-wide">
                Orbit sign-in email
                <input
                  defaultValue={student.email ?? ""}
                  name="email"
                  placeholder="student@example.com"
                  readOnly={Boolean(student.auth_user_id)}
                  type="email"
                />
                <small>
                  {student.auth_user_id
                    ? "Verified identity connected—email is now locked."
                    : "Exact verified email sign-in par record automatically connect hoga."}
                </small>
              </label>
              <label className="is-wide">
                Learning difficulty
                <input
                  defaultValue={student.learning_difficulty ?? ""}
                  name="learningDifficulty"
                  placeholder="e.g. mobile only, confidence, English"
                />
              </label>
              <label className="is-wide">
                One next action
                <textarea
                  defaultValue={student.next_action ?? ""}
                  name="nextAction"
                  rows={3}
                />
              </label>
            </div>
            <button className="foundry-button foundry-button-dark" type="submit">
              Save student record
            </button>
          </form>
        </article>

        <aside className="foundry-stack">
          <article className="foundry-card" id="goals">
            <div className="foundry-card-head">
              <h2>Goal</h2>
              <Target aria-hidden="true" size={18} />
            </div>
            <p className="foundry-long-copy">
              {student.main_goal ?? "Goal abhi capture nahi hua."}
            </p>
          </article>
          <article className="foundry-card">
            <div className="foundry-card-head">
              <h2>Founder note</h2>
              <MessageSquareText aria-hidden="true" size={18} />
            </div>
            <p className="foundry-long-copy">
              {student.founder_notes ?? "No founder note yet."}
            </p>
          </article>
        </aside>
      </section>

      <section className="student-record-grid">
        <article className="foundry-card" id="tasks">
          <div className="foundry-card-head">
            <div>
              <span className="foundry-card-eyebrow">Practice loop</span>
              <h2>Tasks & submissions</h2>
            </div>
            <BookOpen aria-hidden="true" size={20} />
          </div>
          {assignments.length ? (
            <div className="foundry-data-list">
              {assignments.map((assignment) => {
                const submission = submissions.find(
                  (item) => item.assignment_id === assignment.id,
                );
                return (
                  <div className="foundry-data-row" key={assignment.id}>
                    <span className={`task-state task-state-${assignment.status}`}>
                      {assignment.status.replaceAll("_", " ")}
                    </span>
                    <div>
                      <strong>{assignment.foundry_tasks?.title ?? "Task"}</strong>
                      <p>
                        Due {formatFoundryDate(assignment.due_at)}
                        {submission?.feedback
                          ? ` · Feedback: ${submission.feedback}`
                          : ""}
                      </p>
                    </div>
                    <b>{assignment.foundry_tasks?.points ?? 0} pts</b>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyFoundryState
              title="No task assigned"
              detail="Student ke level ke mutabiq ek clear next task assign karein."
              href="/dashboard/foundry/tasks"
              action="Assign task"
            />
          )}
        </article>

        <article className="foundry-card" id="attendance">
          <div className="foundry-card-head">
            <div>
              <span className="foundry-card-eyebrow">Consistency</span>
              <h2>Attendance</h2>
            </div>
            <span className="foundry-score-ring">{attendanceRate}%</span>
          </div>
          {attendance.length ? (
            <div className="foundry-data-list">
              {attendance.slice(0, 6).map((record) => (
                <div className="foundry-data-row is-compact" key={record.id}>
                  <span className={`attendance-dot is-${record.status}`} />
                  <div>
                    <strong>{record.foundry_classes?.title ?? "Class"}</strong>
                    <p>
                      {record.foundry_classes?.starts_at
                        ? formatFoundryDate(record.foundry_classes.starts_at)
                        : formatFoundryDate(record.marked_at)}
                    </p>
                  </div>
                  <b>{record.status}</b>
                </div>
              ))}
            </div>
          ) : (
            <EmptyFoundryState
              title="Attendance not marked"
              detail="First class check-in ke baad consistency signal yahan aayega."
            />
          )}
        </article>
      </section>

      <section className="student-record-grid">
        <article className="foundry-card" id="skills">
          <div className="foundry-card-head">
            <div>
              <span className="foundry-card-eyebrow">Evidence-based scores</span>
              <h2>Skill scores</h2>
            </div>
            <Trophy aria-hidden="true" size={20} />
          </div>
          {skills.length ? (
            <div className="skill-score-list">
              {skills.map((skill) => (
                <div className="skill-score-row" key={skill.id}>
                  <span>{skill.dimension.replaceAll("_", " ")}</span>
                  <FoundryProgressBar value={skill.score} compact />
                  <strong>{skill.score}</strong>
                </div>
              ))}
            </div>
          ) : (
            <EmptyFoundryState
              title="No skill evidence yet"
              detail="Accepted work ke baad first evidence-based score add karein."
              href="/dashboard/foundry/progress"
              action="Add score"
            />
          )}
        </article>

        <article className="foundry-card" id="studio">
          <div className="foundry-card-head">
            <div>
              <span className="foundry-card-eyebrow">Real work gate</span>
              <h2>Studio readiness</h2>
            </div>
            <Sparkles aria-hidden="true" size={20} />
          </div>
          <div
            className={`studio-readiness-state ${
              student.studio_eligible ? "is-ready" : ""
            }`}
          >
            <span>
              {student.studio_eligible ? (
                <Sparkles aria-hidden="true" size={28} />
              ) : (
                <CalendarCheck aria-hidden="true" size={28} />
              )}
            </span>
            <strong>
              {student.studio_eligible
                ? "Ready for supervised work"
                : "Building evidence"}
            </strong>
            <p>
              Quality, deadline, communication, revision aur reliability mein
              kam az kam 4 evidence-backed scores chahiye.
            </p>
          </div>
        </article>
      </section>

      <section className="foundry-card" id="feedback">
        <div className="foundry-card-head">
          <div>
            <span className="foundry-card-eyebrow">Progress journey</span>
            <h2>Feedback & achievements</h2>
          </div>
          <Send aria-hidden="true" size={19} />
        </div>
        {progress.length ? (
          <div className="foundry-timeline">
            {progress.map((event) => (
              <article key={event.id}>
                <span />
                <div>
                  <time dateTime={event.occurred_at}>
                    {formatFoundryDate(event.occurred_at)}
                  </time>
                  <strong>{event.title}</strong>
                  <p>{event.detail}</p>
                </div>
                <b>+{event.points}</b>
              </article>
            ))}
          </div>
        ) : (
          <EmptyFoundryState
            title="Journey starts with the first submission"
            detail="Task submit, feedback, revision, badge aur Studio readiness events yahan jama honge."
          />
        )}
      </section>
    </div>
  );
}
