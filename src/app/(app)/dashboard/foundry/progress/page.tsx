import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import {
  Award,
  BarChart3,
  ClipboardCheck,
  FileBadge2,
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
import { FoundryActionButton } from "@/components/foundry/FoundryActionButton";
import {
  formatFoundryDate,
  foundryDepartmentLabel,
  listFoundryProgress,
} from "@/lib/foundry";
import {
  issueFoundryCertificate,
  reviewFoundryStudioReadiness,
  revokeFoundryCertificate,
  updateFoundrySkillScore,
} from "../actions";

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
  const { students, skills, progress, studioReviews, certificates } =
    await listFoundryProgress();
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

  function latestReview(studentId: string) {
    return studioReviews.find((review) => review.student_id === studentId);
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
          const review = latestReview(student.id);
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
                ) : review?.status === "changes_required" ? (
                  <>
                    <ClipboardCheck aria-hidden="true" size={17} />
                    Changes required
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

      {studioView ? (
        <>
          <section className="studio-standard-grid" aria-label="Studio readiness standards">
            {[
              ["Skill Quality", "Work client-facing standard ke qareeb ho."],
              ["Deadline", "Commitment realistic ho aur time par deliver ho."],
              ["Communication", "Clear updates, questions aur status sharing."],
              ["Revision Attitude", "Feedback ko calmly apply karna."],
              ["Reliability", "Repeatable follow-through without chasing."],
              ["Confidentiality", "Client files, data aur access private rakhna."],
            ].map(([title, detail], index) => (
              <article key={title}>
                <span>{index + 1}</span>
                <strong>{title}</strong>
                <p>{detail}</p>
              </article>
            ))}
          </section>

          <section className="foundry-split-layout studio-review-layout">
            <article className="foundry-card">
              <div className="foundry-card-head">
                <div>
                  <span className="foundry-card-eyebrow">Founder decision</span>
                  <h2>Review six standards</h2>
                </div>
                <ClipboardCheck aria-hidden="true" size={20} />
              </div>
              <form
                action={reviewFoundryStudioReadiness}
                className="foundry-form"
              >
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
                <div className="studio-score-grid">
                  {[
                    ["skillQuality", "Skill Quality"],
                    ["deadline", "Deadline"],
                    ["communication", "Communication"],
                    ["revisionAttitude", "Revision Attitude"],
                    ["reliability", "Reliability"],
                    ["confidentiality", "Confidentiality"],
                  ].map(([name, label]) => (
                    <label key={name}>
                      {label}
                      <select defaultValue="3" name={name} required>
                        <option value="1">1 · Not ready</option>
                        <option value="2">2 · Early evidence</option>
                        <option value="3">3 · Minimum pass</option>
                        <option value="4">4 · Strong</option>
                        <option value="5">5 · Excellent</option>
                      </select>
                    </label>
                  ))}
                </div>
                <label>
                  Evidence summary
                  <textarea
                    minLength={20}
                    name="evidenceSummary"
                    placeholder="Name the tasks, observed behaviour, deadlines and confidentiality evidence."
                    required
                    rows={5}
                  />
                </label>
                <label>
                  Decision note for student
                  <textarea
                    name="decisionNote"
                    placeholder="What happens next?"
                    rows={3}
                  />
                </label>
                <label>
                  Decision
                  <select name="decision" required>
                    <option value="changes_required">Changes required</option>
                    <option value="approved">Approve Studio Ready</option>
                    <option value="revoked">Revoke current readiness</option>
                  </select>
                </label>
                <FoundryActionButton
                  className="foundry-button foundry-button-dark"
                  pendingLabel="Recording decision…"
                >
                  Save evidence review
                </FoundryActionButton>
              </form>
              <p className="foundry-form-note">
                Approval requires every standard 3+ and an average of 4+.
                Approval does not automatically assign paid work.
              </p>
            </article>

            <article className="foundry-card">
              <div className="foundry-card-head">
                <div>
                  <span className="foundry-card-eyebrow">Verifiable evidence</span>
                  <h2>Issue certificate</h2>
                </div>
                <FileBadge2 aria-hidden="true" size={20} />
              </div>
              <form action={issueFoundryCertificate} className="foundry-form">
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
                  Certificate type
                  <select name="certificateType" required>
                    <option value="track_completion">Track completion</option>
                    <option value="foundry_completion">Foundry completion</option>
                    <option value="studio_readiness">Studio readiness</option>
                  </select>
                </label>
                <label>
                  Public title
                  <input
                    defaultValue="Urava Foundry Verified Achievement"
                    maxLength={180}
                    minLength={3}
                    name="title"
                    required
                  />
                </label>
                <FoundryActionButton
                  className="foundry-button foundry-button-dark"
                  pendingLabel="Issuing certificate…"
                >
                  Issue verified certificate
                </FoundryActionButton>
              </form>
              <p className="foundry-form-note">
                Track: 60% + accepted work. Foundry: 80% + two accepted
                submissions. Studio: current approved six-standard review.
              </p>

              <div className="studio-certificate-admin-list">
                {certificates.length ? (
                  certificates.map((certificate) => {
                    const student = students.find(
                      (item) => item.id === certificate.student_id,
                    );
                    return (
                      <article key={certificate.id}>
                        <Award aria-hidden="true" size={18} />
                        <span>
                          <strong>{student?.full_name ?? "Student"}</strong>
                          <small>
                            {certificate.certificate_number} ·{" "}
                            {certificate.status}
                          </small>
                        </span>
                        <Link
                          href={`/certificates/${certificate.verification_token}`}
                          target="_blank"
                        >
                          Verify
                        </Link>
                        {certificate.status === "issued" ? (
                          <form action={revokeFoundryCertificate}>
                            <input
                              name="certificateId"
                              type="hidden"
                              value={certificate.id}
                            />
                            <input
                              aria-label="Revocation reason"
                              minLength={5}
                              name="reason"
                              placeholder="Reason"
                              required
                            />
                            <FoundryActionButton
                              className="studio-revoke-button"
                              pendingLabel="…"
                            >
                              Revoke
                            </FoundryActionButton>
                          </form>
                        ) : null}
                      </article>
                    );
                  })
                ) : (
                  <p className="foundry-empty-copy">No certificates issued yet.</p>
                )}
              </div>
            </article>
          </section>
        </>
      ) : null}

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
            <FoundryActionButton
              className="foundry-button foundry-button-dark"
              pendingLabel="Saving evidence…"
            >
              Save evidence score
            </FoundryActionButton>
          </form>
          <p className="foundry-form-note">
            Skill scores are evidence only. Studio Ready needs a separate
            Founder review against all six guide standards.
          </p>
        </aside>
      </section>
    </div>
  );
}
