import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  CircleUserRound,
  ClipboardCheck,
  GraduationCap,
  MonitorSmartphone,
  Sparkles,
  TriangleAlert,
  UserRoundCheck,
  UsersRound,
} from "lucide-react";
import {
  DuePill,
  EmptyFoundryState,
  FoundryProgressBar,
  FoundryStageBadge,
  HealthBadge,
} from "@/components/foundry/FoundryUI";
import {
  formatFoundryDate,
  foundryDepartmentLabel,
  getFoundryDashboard,
} from "@/lib/foundry";
import { currentTimestamp } from "@/lib/format";

export const metadata: Metadata = {
  title: "Urava Foundry OS",
  robots: { index: false, follow: false },
};

export default async function FoundryDashboardPage() {
  const {
    students,
    classes,
    assignments,
    submissions,
    todayAttendance,
    seatCapacity,
  } = await getFoundryDashboard();

  const activeStudents = students.filter(
    (student) =>
      !["inactive", "graduated", "rejected"].includes(student.lifecycle_status),
  );
  const attendedToday = todayAttendance.filter((record) =>
    ["present", "late"].includes(record.status),
  ).length;
  const atRisk = students.filter((student) =>
    ["yellow", "red"].includes(student.health_status),
  );
  const studioReady = students.filter((student) => student.studio_eligible);
  const connectedStudents = students.filter(
    (student) => student.auth_user_id,
  ).length;
  const now = currentTimestamp();
  const nextTwentyFourHours = now + 24 * 60 * 60 * 1000;

  const dueSoon = assignments.filter((assignment) => {
    const due = new Date(assignment.due_at).getTime();
    return (
      due <= nextTwentyFourHours &&
      !["completed", "submitted", "under_review"].includes(assignment.status)
    );
  });

  const attention = [
    ...submissions.map((submission) => ({
      id: `submission-${submission.id}`,
      title: `${submission.foundry_students?.full_name ?? "Student"} ka work review karein`,
      detail:
        submission.foundry_task_assignments?.foundry_tasks?.title ??
        "Submission feedback ka intezar kar rahi hai.",
      href: "/dashboard/foundry/submissions",
      health: "red" as const,
      due: "Review now",
    })),
    ...dueSoon.map((assignment) => ({
      id: `assignment-${assignment.id}`,
      title: `${assignment.foundry_students?.full_name ?? "Student"} ko task help chahiye`,
      detail:
        assignment.foundry_tasks?.title ??
        "Aaj ki deadline se pehle recovery check-in karein.",
      href: "/dashboard/foundry/tasks",
      health:
        new Date(assignment.due_at).getTime() < now
          ? ("red" as const)
          : ("yellow" as const),
      due:
        new Date(assignment.due_at).getTime() < now
          ? "Overdue"
          : formatFoundryDate(assignment.due_at),
    })),
    ...atRisk
      .filter(
        (student) =>
          !dueSoon.some((assignment) => assignment.student_id === student.id),
      )
      .slice(0, 5)
      .map((student) => ({
        id: `student-${student.id}`,
        title: `${student.full_name} ko follow-up dein`,
        detail: student.next_action ?? "Aaj ka next step confirm karein.",
        href: `/dashboard/foundry/students/${student.id}`,
        health: student.health_status === "red" ? ("red" as const) : ("yellow" as const),
        due: "Today",
      })),
  ].slice(0, 8);

  const primaryAction = submissions.length
    ? {
        href: "/dashboard/foundry/submissions",
        label: `Review ${submissions.length} submission${submissions.length === 1 ? "" : "s"}`,
        detail:
          "Student work is waiting for a decision. Fast feedback keeps the learning loop moving.",
      }
    : atRisk.length
      ? {
          href: "/dashboard/foundry/students",
          label: `Support ${atRisk.length} student${atRisk.length === 1 ? "" : "s"}`,
          detail:
            "Open the protection queue and give each learner one clear recovery step.",
        }
      : {
          href: "/dashboard/foundry/students",
          label: "Open student roster",
          detail:
            "No urgent signal is blocking the cohort. Review the roster and prepare the next move.",
        };

  const departments = new Map<
    string,
    { progress: number; count: number; atRisk: number }
  >();
  for (const student of students) {
    const current = departments.get(student.department) ?? {
      progress: 0,
      count: 0,
      atRisk: 0,
    };
    current.progress += student.progress_percent;
    current.count += 1;
    current.atRisk += ["yellow", "red"].includes(student.health_status) ? 1 : 0;
    departments.set(student.department, current);
  }

  return (
    <div className="foundry-page">
      <section className="foundry-hero">
        <div>
          <span className="foundry-kicker">Founder Command · Foundry</span>
          <h1>
            {attention.length
              ? `${attention.length} decisions protect today’s progress`
              : "Foundry is under control today"}
          </h1>
          <p>
            See who is progressing, who needs support and who is ready for real
            work — without opening every student record.
          </p>
        </div>
        <aside className="foundry-hero-focus" aria-label="Recommended founder action">
          <div className="foundry-focus-label">
            <span>
              <i aria-hidden="true" />
              Recommended next move
            </span>
            <small>Orbit priority</small>
          </div>
          <strong>{primaryAction.label}</strong>
          <p>{primaryAction.detail}</p>
          <Link
            className="foundry-button foundry-button-primary"
            href={primaryAction.href}
          >
            Open now
            <ArrowUpRight aria-hidden="true" size={17} />
          </Link>
        </aside>
      </section>

      <section className="foundry-metric-grid" aria-label="Foundry key metrics">
        <article className="foundry-metric">
          <span className="foundry-metric-icon is-red">
            <UsersRound aria-hidden="true" size={20} />
          </span>
          <div>
            <small>Active students</small>
            <strong>{activeStudents.length}</strong>
            <p>{Math.max(0, seatCapacity - activeStudents.length)} seats available</p>
          </div>
        </article>
        <article className="foundry-metric">
          <span className="foundry-metric-icon is-green">
            <UserRoundCheck aria-hidden="true" size={20} />
          </span>
          <div>
            <small>Today’s attendance</small>
            <strong>
              {attendedToday}
              <em>/{todayAttendance.length || "—"}</em>
            </strong>
            <p>Present + late check-ins</p>
          </div>
        </article>
        <article className="foundry-metric">
          <span className="foundry-metric-icon is-yellow">
            <ClipboardCheck aria-hidden="true" size={20} />
          </span>
          <div>
            <small>Awaiting review</small>
            <strong>{submissions.length}</strong>
            <p>Teacher feedback pending</p>
          </div>
        </article>
        <article className="foundry-metric">
          <span className="foundry-metric-icon is-red-soft">
            <TriangleAlert aria-hidden="true" size={20} />
          </span>
          <div>
            <small>Needs support</small>
            <strong>{atRisk.length}</strong>
            <p>Yellow or red health</p>
          </div>
        </article>
        <article className="foundry-metric">
          <span className="foundry-metric-icon is-gold">
            <GraduationCap aria-hidden="true" size={20} />
          </span>
          <div>
            <small>Studio Ready</small>
            <strong>{studioReady.length}</strong>
            <p>Evidence threshold reached</p>
          </div>
        </article>
        <article className="foundry-metric">
          <span className="foundry-metric-icon is-blue">
            <CircleUserRound aria-hidden="true" size={20} />
          </span>
          <div>
            <small>Orbit connected</small>
            <strong>
              {connectedStudents}
              <em>/{students.length}</em>
            </strong>
            <p>Verified student identities</p>
          </div>
        </article>
      </section>

      <section className="foundry-dashboard-grid">
        <article className="foundry-card foundry-attention-card">
          <div className="foundry-card-head">
            <div>
              <span className="foundry-card-eyebrow">Protection queue</span>
              <h2>Needs Attention Today</h2>
            </div>
            <span className="foundry-count">{attention.length}</span>
          </div>
          {attention.length ? (
            <div className="foundry-attention-list">
              {attention.map((item) => (
                <Link className="foundry-attention-row" href={item.href} key={item.id}>
                  <HealthBadge health={item.health} label="" />
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.detail}</p>
                  </div>
                  <DuePill label={item.due} urgent={item.health === "red"} />
                  <ArrowUpRight aria-hidden="true" size={16} />
                </Link>
              ))}
            </div>
          ) : (
            <EmptyFoundryState
              title="Aaj ki protection queue clear hai"
              detail="New late work, review requests aur risk signals yahan automatically aayenge."
            />
          )}
        </article>

        <aside className="foundry-stack">
          <article className="foundry-card">
            <div className="foundry-card-head">
              <div>
                <span className="foundry-card-eyebrow">Schedule</span>
                <h2>Upcoming classes</h2>
              </div>
              <CalendarDays aria-hidden="true" size={20} />
            </div>
            {classes.length ? (
              <div className="foundry-class-list">
                {classes.slice(0, 3).map((foundryClass) => (
                  <Link
                    className="foundry-class-row"
                    href="/dashboard/foundry/classes"
                    key={foundryClass.id}
                  >
                    <time dateTime={foundryClass.starts_at}>
                      {formatFoundryDate(foundryClass.starts_at)}
                    </time>
                    <strong>{foundryClass.title}</strong>
                    <small>
                      {foundryDepartmentLabel(foundryClass.department)} ·{" "}
                      {foundryClass.instructor_name}
                    </small>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyFoundryState
                title="No class scheduled"
                detail="Next class add karte hi student portal par nazar aayegi."
                href="/dashboard/foundry/classes"
                action="Schedule a class"
              />
            )}
          </article>

          <article className="foundry-card foundry-device-card">
            <span className="foundry-metric-icon is-red">
              <MonitorSmartphone aria-hidden="true" size={20} />
            </span>
            <div>
              <small>Mobile-first cohort</small>
              <strong>
                {
                  students.filter((student) =>
                    ["mobile_only", "no_reliable_device"].includes(
                      student.device_access,
                    ),
                  ).length
                }{" "}
                students
              </strong>
              <p>Keep every next step short, Roman Urdu and low-bandwidth.</p>
            </div>
          </article>
        </aside>
      </section>

      <section className="foundry-card">
        <div className="foundry-card-head">
          <div>
            <span className="foundry-card-eyebrow">Learning signal</span>
            <h2>Department performance</h2>
          </div>
          <Sparkles aria-hidden="true" size={20} />
        </div>
        <div className="foundry-department-grid">
          {[...departments.entries()].map(([department, state]) => {
            const average = Math.round(state.progress / state.count);
            return (
              <article className="foundry-department-card" key={department}>
                <div>
                  <strong>{foundryDepartmentLabel(department)}</strong>
                  <span>{state.count} students</span>
                </div>
                <FoundryProgressBar value={average} compact />
                <p>
                  <FoundryStageBadge value={average} showEvidence />
                  {state.atRisk ? <em>{state.atRisk} need help</em> : null}
                </p>
              </article>
            );
          })}
        </div>
        {!departments.size ? (
          <div className="foundry-inline-success">
            <CheckCircle2 aria-hidden="true" size={18} />
            Department assignment ke baad performance yahan nazar aayegi.
          </div>
        ) : null}
      </section>
    </div>
  );
}
