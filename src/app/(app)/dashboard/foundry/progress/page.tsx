import type { Metadata } from "next";
import Link from "next/link";
import {
  BarChart3,
  ShieldCheck,
  Sparkles,
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
  listFoundryProgress,
} from "@/lib/foundry";
import { updateFoundrySkillScore } from "../actions";

export const metadata: Metadata = {
  title: "Foundry Progress",
  robots: { index: false, follow: false },
};

type Props = {
  searchParams: Promise<{
    view?: string;
    notice?: string;
    error?: string;
  }>;
};

export default async function FoundryProgressPage({ searchParams }: Props) {
  const filters = await searchParams;
  const { students, skills, progress } = await listFoundryProgress();
  const studioView = filters.view === "studio";
  const visibleStudents = studioView
    ? [...students].sort((a, b) => {
        if (a.studio_eligible !== b.studio_eligible) {
          return a.studio_eligible ? -1 : 1;
        }
        return b.progress_percent - a.progress_percent;
      })
    : students;

  function studentSkills(studentId: string) {
    return skills.filter((skill) => skill.student_id === studentId);
  }

  return (
    <div className="foundry-page">
      <FoundryNotice error={filters.error} notice={filters.notice} />
      <section className="foundry-page-title">
        <div>
          <span className="foundry-kicker">
            {studioView ? "Real-work gate" : "Evidence, not vibes"}
          </span>
          <h1>{studioView ? "Studio readiness" : "Progress"}</h1>
          <p>
            Quality, deadline, communication, revision aur reliability — har
            score ke peeche real evidence.
          </p>
        </div>
        <div className="foundry-view-switch">
          <Link
            className={!studioView ? "is-active" : ""}
            href="/dashboard/foundry/progress"
          >
            Progress
          </Link>
          <Link
            className={studioView ? "is-active" : ""}
            href="/dashboard/foundry/progress?view=studio"
          >
            Studio
          </Link>
        </div>
      </section>

      <section className="progress-student-grid">
        {visibleStudents.map((student) => {
          const scores = studentSkills(student.id);
          const average = scores.length
            ? Math.round(
                scores.reduce((sum, skill) => sum + skill.score, 0) /
                  scores.length,
              )
            : 0;
          return (
            <Link
              className={`progress-student-card ${
                student.studio_eligible ? "is-studio-ready" : ""
              }`}
              href={`/dashboard/foundry/students/${student.id}`}
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
              <div className="progress-student-score">
                <span>
                  Skill average <b>{average || "—"}</b>
                </span>
                <FoundryProgressBar value={average} compact />
                <small>{scores.length}/4 minimum evidence dimensions</small>
              </div>
              <div className="studio-gate">
                {student.studio_eligible ? (
                  <>
                    <Sparkles aria-hidden="true" size={17} />
                    Ready
                  </>
                ) : (
                  <>
                    <ShieldCheck aria-hidden="true" size={17} />
                    Building evidence
                  </>
                )}
              </div>
            </Link>
          );
        })}
      </section>

      <section className="foundry-split-layout">
        <article className="foundry-card">
          <div className="foundry-card-head">
            <div>
              <span className="foundry-card-eyebrow">Latest evidence</span>
              <h2>Progress journey</h2>
            </div>
            <Trophy aria-hidden="true" size={20} />
          </div>
          {progress.length ? (
            <div className="foundry-timeline">
              {progress.map((event) => {
                const student = students.find(
                  (item) => item.id === event.student_id,
                );
                return (
                  <article key={event.id}>
                    <span />
                    <div>
                      <time dateTime={event.occurred_at}>
                        {formatFoundryDate(event.occurred_at)}
                      </time>
                      <strong>
                        {student?.full_name ?? "Student"} · {event.title}
                      </strong>
                      <p>{event.detail}</p>
                    </div>
                    <b>+{event.points}</b>
                  </article>
                );
              })}
            </div>
          ) : (
            <EmptyFoundryState
              title="First evidence ka intezar"
              detail="Submission, feedback aur accepted work se journey start hogi."
            />
          )}
        </article>

        <aside className="foundry-card">
          <div className="foundry-card-head">
            <div>
              <span className="foundry-card-eyebrow">Mentor assessment</span>
              <h2>Add skill score</h2>
            </div>
            <BarChart3 aria-hidden="true" size={20} />
          </div>
          <form action={updateFoundrySkillScore} className="foundry-form">
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
              Skill dimension
              <select name="dimension" required>
                <option value="quality">Quality</option>
                <option value="deadline">Deadline</option>
                <option value="communication">Communication</option>
                <option value="revision">Revision attitude</option>
                <option value="teamwork">Teamwork</option>
                <option value="reliability">Reliability</option>
                <option value="client_readiness">Client readiness</option>
              </select>
            </label>
            <div className="foundry-form-grid">
              <label>
                Score / 100
                <input max="100" min="0" name="score" required type="number" />
              </label>
              <label>
                Evidence count
                <input defaultValue="1" min="0" name="evidenceCount" type="number" />
              </label>
              <label className="is-wide">
                Evidence note
                <textarea
                  name="note"
                  placeholder="Which submitted work or observed behaviour supports this score?"
                  rows={4}
                />
              </label>
            </div>
            <button className="foundry-button foundry-button-dark" type="submit">
              Save evidence score
            </button>
          </form>
          <p className="foundry-form-note">
            Studio Ready automatically turns Gold after at least 4 dimensions,
            75+ average and no score below 65.
          </p>
        </aside>
      </section>
    </div>
  );
}
