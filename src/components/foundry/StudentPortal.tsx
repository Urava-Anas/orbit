import Link from "next/link";
import {
  ArrowRight,
  Award,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Flame,
  Languages,
  LockKeyhole,
  Medal,
  MonitorSmartphone,
  Send,
  Sparkles,
  Star,
  Trophy,
  UserRound,
} from "lucide-react";
import {
  submitCurrentStudentWork,
  submitFoundryPreviewWork,
} from "@/app/(app)/dashboard/foundry/actions";
import { FoundryProgressBar, HealthBadge } from "@/components/foundry/FoundryUI";
import {
  type FoundryAssignment,
  type FoundryClass,
  type FoundryProgressEvent,
  type FoundrySkillScore,
  type FoundryStudent,
  type FoundrySubmission,
  formatFoundryDate,
  foundryDepartmentLabel,
  foundryLevelLabel,
} from "@/lib/foundry";

export type StudentPortalTab = "today" | "learn" | "submit" | "progress" | "profile";

type StudentPortalProps = {
  student: FoundryStudent;
  assignments: FoundryAssignment[];
  submissions: FoundrySubmission[];
  classes: FoundryClass[];
  skills: FoundrySkillScore[];
  progress: FoundryProgressEvent[];
  tab: StudentPortalTab;
  preview?: boolean;
  notice?: string;
  error?: string;
};

const previewTabs: Array<{ tab: StudentPortalTab; label: string }> = [
  { tab: "today", label: "Today" },
  { tab: "learn", label: "Learn" },
  { tab: "submit", label: "Submit" },
  { tab: "progress", label: "Progress" },
  { tab: "profile", label: "Profile" },
];

function PortalNotice({ notice, error }: { notice?: string; error?: string }) {
  if (!notice && !error) return null;
  return (
    <div className={`student-message ${error ? "is-error" : "is-success"}`} role="status">
      {error ? <LockKeyhole size={16} /> : <CheckCircle2 size={16} />}
      {error ?? notice}
    </div>
  );
}

export function StudentPortalView({
  student,
  assignments,
  submissions,
  classes,
  skills,
  progress,
  tab,
  preview = false,
  notice,
  error,
}: StudentPortalProps) {
  const activeAssignments = assignments.filter(
    (assignment) =>
      !["completed", "submitted", "under_review"].includes(assignment.status),
  );
  const todayTask = activeAssignments[0];
  const nextClass = classes[0];
  const latestFeedback = submissions.find(
    (submission) => submission.feedback && submission.status !== "under_review",
  );
  const completedCount = assignments.filter(
    (assignment) => assignment.status === "completed",
  ).length;
  const totalPoints = progress.reduce((sum, event) => sum + event.points, 0);
  const averageSkill = skills.length
    ? Math.round(skills.reduce((sum, skill) => sum + skill.score, 0) / skills.length)
    : 0;

  return (
    <div className={`student-portal-view ${preview ? "is-preview" : ""}`}>
      {preview ? (
        <div className="student-preview-banner">
          <span>Founder preview · {student.foundry_id}</span>
          <nav aria-label="Preview student tabs">
            {previewTabs.map((item) => (
              <Link
                className={tab === item.tab ? "is-active" : ""}
                href={`?tab=${item.tab}`}
                key={item.tab}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      ) : null}

      <PortalNotice error={error} notice={notice} />

      <header className="student-greeting">
        <div>
          <span className="student-eyebrow">
            {tab === "today"
              ? "Assalam-o-Alaikum"
              : tab === "learn"
                ? "Step by step"
                : tab === "submit"
                  ? "Show your work"
                  : tab === "progress"
                    ? "Your journey"
                    : "Your Foundry record"}
          </span>
          <h1>
            {tab === "today"
              ? `${student.full_name.split(" ")[0]}, aaj ka next step ready hai`
              : tab === "learn"
                ? "Ek task, ek waqt"
                : tab === "submit"
                  ? "Apna work submit karein"
                  : tab === "progress"
                    ? "Har chhota step count hota hai"
                    : student.full_name}
          </h1>
        </div>
        <span className="student-character" aria-hidden="true">
          <Sparkles size={22} />
          <i />
        </span>
      </header>

      {tab === "today" ? (
        <div className="student-today-stack">
          <section className="student-primary-card">
            <div className="student-card-label">
              <span>Aaj ka Task</span>
              {todayTask ? (
                <span className="student-streak">
                  <Flame aria-hidden="true" size={14} />
                  {todayTask.foundry_tasks?.points ?? 0} points
                </span>
              ) : null}
            </div>
            {todayTask ? (
              <>
                <h2>{todayTask.foundry_tasks?.title}</h2>
                <p className="student-roman-urdu">
                  {todayTask.foundry_tasks?.instructions_roman_urdu}
                </p>
                <div className="student-task-meta">
                  <span>
                    <Clock3 aria-hidden="true" size={15} />
                    {formatFoundryDate(todayTask.due_at)}
                  </span>
                  <span>
                    <BookOpen aria-hidden="true" size={15} />
                    {todayTask.foundry_tasks?.difficulty}
                  </span>
                </div>
                <Link
                  className="student-primary-action"
                  href={
                    preview
                      ? `?tab=submit`
                      : "/learn/submit"
                  }
                >
                  Task complete karke submit karein
                  <ArrowRight aria-hidden="true" size={18} />
                </Link>
              </>
            ) : (
              <>
                <span className="student-complete-icon">
                  <CheckCircle2 aria-hidden="true" size={28} />
                </span>
                <h2>Aaj ka assigned work complete hai</h2>
                <p className="student-roman-urdu">
                  Feedback parhein, progress dekhein aur next class ke liye ready
                  rahein.
                </p>
                <Link
                  className="student-primary-action"
                  href={preview ? "?tab=progress" : "/learn/progress"}
                >
                  Apni progress dekhein
                  <ArrowRight aria-hidden="true" size={18} />
                </Link>
              </>
            )}
          </section>

          {nextClass ? (
            <section className="student-next-class">
              <span className="student-section-icon">
                <CalendarDays aria-hidden="true" size={20} />
              </span>
              <div>
                <small>Next class</small>
                <strong>{nextClass.title}</strong>
                <p>
                  {formatFoundryDate(nextClass.starts_at)} ·{" "}
                  {nextClass.instructor_name}
                </p>
              </div>
              {nextClass.join_url ? (
                <a
                  className="student-secondary-action"
                  href={nextClass.join_url}
                  rel="noreferrer"
                  target="_blank"
                >
                  Join
                  <ExternalLink aria-hidden="true" size={14} />
                </a>
              ) : (
                <span className="student-secondary-action is-disabled">Link soon</span>
              )}
            </section>
          ) : null}

          {latestFeedback ? (
            <section className="student-feedback-card">
              <div>
                <span className="student-section-icon is-yellow">
                  <Star aria-hidden="true" size={20} />
                </span>
                <span>
                  <small>Teacher feedback</small>
                  <strong>
                    {latestFeedback.status === "accepted"
                      ? "Shabash — task accepted"
                      : "Ek simple revision"}
                  </strong>
                </span>
              </div>
              <p>{latestFeedback.feedback}</p>
            </section>
          ) : null}
        </div>
      ) : null}

      {tab === "learn" ? (
        <section className="student-content-card">
          <div className="student-content-head">
            <span className="student-section-icon">
              <BookOpen aria-hidden="true" size={21} />
            </span>
            <div>
              <small>Your learning path</small>
              <h2>Assigned tasks</h2>
            </div>
          </div>
          {assignments.length ? (
            <div className="student-task-list">
              {assignments.map((assignment, index) => (
                <article
                  className={
                    assignment === todayTask ? "is-current" : ""
                  }
                  key={assignment.id}
                >
                  <span className="student-step-number">{index + 1}</span>
                  <div>
                    <small>{assignment.status.replaceAll("_", " ")}</small>
                    <strong>{assignment.foundry_tasks?.title}</strong>
                    <p>{assignment.foundry_tasks?.instructions_roman_urdu}</p>
                  </div>
                  {assignment.status === "completed" ? (
                    <CheckCircle2 aria-hidden="true" size={19} />
                  ) : null}
                </article>
              ))}
            </div>
          ) : (
            <p className="student-empty-copy">
              Naya task assign hote hi yahan nazar aayega.
            </p>
          )}
        </section>
      ) : null}

      {tab === "submit" ? (
        <section className="student-content-card student-submit-card">
          <div className="student-content-head">
            <span className="student-section-icon is-red">
              <Send aria-hidden="true" size={21} />
            </span>
            <div>
              <small>One simple step</small>
              <h2>{todayTask?.foundry_tasks?.title ?? "No task to submit"}</h2>
            </div>
          </div>
          {todayTask ? (
            <form
              action={
                preview ? submitFoundryPreviewWork : submitCurrentStudentWork
              }
              className="student-submit-form"
            >
              <input name="assignmentId" type="hidden" value={todayTask.id} />
              <input name="studentId" type="hidden" value={student.id} />
              <label>
                Work link <small>(agar link hai)</small>
                <input
                  inputMode="url"
                  name="submissionUrl"
                  placeholder="https://drive.google.com/..."
                  type="url"
                />
              </label>
              <label>
                Teacher ko short note
                <textarea
                  name="studentNote"
                  placeholder="Maine task complete kiya. Yeh mera work hai."
                  rows={4}
                />
              </label>
              <p>
                Link nahi hai? Note likhein aur class mein screenshot / file
                dikhayein.
              </p>
              <button className="student-primary-action" type="submit">
                Work submit karein
                <Send aria-hidden="true" size={17} />
              </button>
            </form>
          ) : (
            <div className="student-empty-celebration">
              <CheckCircle2 aria-hidden="true" size={30} />
              <strong>Koi pending submission nahi</strong>
              <p>Teacher feedback ya next task ka intezar karein.</p>
            </div>
          )}
        </section>
      ) : null}

      {tab === "progress" ? (
        <div className="student-progress-stack">
          <section className="student-progress-hero">
            <div>
              <small>Foundry journey</small>
              <strong>{student.progress_percent}%</strong>
              <span>complete</span>
            </div>
            <FoundryProgressBar value={student.progress_percent} />
            <p>Seekho → Practice → Feedback → Improve → Portfolio → Real Work</p>
          </section>

          <section className="student-achievement-grid">
            <article>
              <span>
                <Trophy aria-hidden="true" size={21} />
              </span>
              <strong>{totalPoints}</strong>
              <small>Journey points</small>
            </article>
            <article>
              <span>
                <CheckCircle2 aria-hidden="true" size={21} />
              </span>
              <strong>{completedCount}</strong>
              <small>Tasks complete</small>
            </article>
            <article>
              <span>
                <Medal aria-hidden="true" size={21} />
              </span>
              <strong>{averageSkill || "—"}</strong>
              <small>Skill average</small>
            </article>
          </section>

          <section className="student-content-card">
            <div className="student-content-head">
              <span className="student-section-icon is-gold">
                <Award aria-hidden="true" size={21} />
              </span>
              <div>
                <small>Achievements</small>
                <h2>Badges & certificates</h2>
              </div>
            </div>
            <div className="student-badge-row">
              <span className={assignments.length ? "is-earned" : ""}>
                <BookOpen size={18} /> First Step
              </span>
              <span className={completedCount ? "is-earned" : ""}>
                <CheckCircle2 size={18} /> Task Finisher
              </span>
              <span className={student.studio_eligible ? "is-earned" : ""}>
                <Sparkles size={18} /> Studio Ready
              </span>
            </div>
          </section>
        </div>
      ) : null}

      {tab === "profile" ? (
        <section className="student-content-card">
          <div className="student-profile-head">
            <span className="foundry-avatar is-large">
              {student.full_name
                .split(" ")
                .slice(0, 2)
                .map((part) => part[0])
                .join("")
                .toUpperCase()}
            </span>
            <div>
              <small>{student.foundry_id}</small>
              <h2>{student.full_name}</h2>
              <p>
                {foundryDepartmentLabel(student.department)} ·{" "}
                {foundryLevelLabel(student.level)}
              </p>
            </div>
            <HealthBadge health={student.health_status} />
          </div>
          <div className="student-profile-list">
            <div>
              <TargetIcon />
              <span>
                <small>Goal</small>
                <strong>{student.main_goal ?? "Goal set hona baqi hai."}</strong>
              </span>
            </div>
            <div>
              <MonitorSmartphone aria-hidden="true" size={19} />
              <span>
                <small>Device</small>
                <strong>{student.device_access.replaceAll("_", " ")}</strong>
              </span>
            </div>
            <div>
              <Languages aria-hidden="true" size={19} />
              <span>
                <small>Language</small>
                <strong>{student.preferred_language.replaceAll("_", " ")}</strong>
              </span>
            </div>
            <div>
              <UserRound aria-hidden="true" size={19} />
              <span>
                <small>Next action</small>
                <strong>{student.next_action ?? "Teacher se next step confirm karein."}</strong>
              </span>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function TargetIcon() {
  return (
    <span className="student-profile-target" aria-hidden="true">
      <Star size={18} />
    </span>
  );
}
