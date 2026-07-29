import { randomUUID } from "node:crypto";
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
  ShieldCheck,
  Sparkles,
  Star,
  Trophy,
  UserRound,
} from "lucide-react";
import {
  submitCurrentStudentWork,
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

const studentHealthLabels = {
  green: "On track",
  yellow: "Support ready",
  red: "Let’s recover",
  gold: "Studio Ready",
} as const;

function instructionFor(
  student: FoundryStudent,
  task: FoundryAssignment["foundry_tasks"],
) {
  if (!task) return "Teacher se task ki detail confirm karein.";
  if (
    student.preferred_language === "english" &&
    task.instructions_english?.trim()
  ) {
    return task.instructions_english;
  }
  return task.instructions_roman_urdu;
}

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
  const pendingReview = submissions.find((submission) =>
    ["submitted", "under_review"].includes(submission.status),
  );
  const completedCount = assignments.filter(
    (assignment) => assignment.status === "completed",
  ).length;
  const totalPoints = progress.reduce((sum, event) => sum + event.points, 0);
  const averageSkill = skills.length
    ? Math.round(skills.reduce((sum, skill) => sum + skill.score, 0) / skills.length)
    : 0;
  const prefersEnglish = student.preferred_language === "english";
  const isRecoveryTask = Boolean(todayTask?.recovery_for_assignment_id);
  const taskFlow = prefersEnglish
    ? [
        ["1", "Read", "Understand the brief"],
        ["2", "Build", "Complete your work"],
        ["3", "Submit", "Send proof to teacher"],
      ]
    : [
        ["1", "Samjho", "Brief poori parhein"],
        ["2", "Banao", "Apna work complete karein"],
        ["3", "Submit", "Teacher ko proof bhejein"],
      ];

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

      <section className="student-role-context" aria-label="Student access scope">
        <div>
          <span className="student-role-context-icon">
            <ShieldCheck aria-hidden="true" size={18} />
          </span>
          <span>
            <small>Private student space</small>
            <strong>Sirf aap ka learning record</strong>
          </span>
        </div>
        <div>
          <span className="student-foundry-id">{student.foundry_id}</span>
          <HealthBadge
            health={student.health_status}
            label={studentHealthLabels[student.health_status]}
          />
        </div>
      </section>

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
        <span className="student-hero-icon" aria-hidden="true">
          <Sparkles size={22} />
        </span>
      </header>

      {tab === "today" ? (
        <div className="student-today-stack">
          <section className="student-primary-card">
            <div className="student-card-label">
              <span>{isRecoveryTask ? "Easy recovery task" : "Aaj ka Task"}</span>
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
                  {instructionFor(student, todayTask.foundry_tasks)}
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
                  <span>
                    <Languages aria-hidden="true" size={15} />
                    {prefersEnglish ? "English" : "Roman Urdu"}
                  </span>
                </div>
                {isRecoveryTask ? (
                  <p className="student-recovery-note">
                    Pichla work miss ho gaya tha, is liye yeh chhota step diya
                    gaya hai. Isay complete karke aap normal track par wapas aa
                    jayenge.
                  </p>
                ) : null}
                <ol className="student-task-flow" aria-label="Task completion steps">
                  {taskFlow.map(([step, title, detail]) => (
                    <li key={step}>
                      <span>{step}</span>
                      <div>
                        <strong>{title}</strong>
                        <small>{detail}</small>
                      </div>
                    </li>
                  ))}
                </ol>
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
                <span
                  className={`student-complete-icon ${pendingReview ? "is-reviewing" : ""}`}
                >
                  {pendingReview ? (
                    <Clock3 aria-hidden="true" size={28} />
                  ) : (
                    <CheckCircle2 aria-hidden="true" size={28} />
                  )}
                </span>
                <h2>
                  {pendingReview
                    ? "Aap ka work teacher ke review mein hai"
                    : "Aaj ka assigned work complete hai"}
                </h2>
                <p className="student-roman-urdu">
                  {pendingReview
                    ? "Abhi dobara submit karne ki zaroorat nahi. Feedback aate hi yahan next step nazar aayega."
                    : "Feedback parhein, progress dekhein aur next class ke liye ready rahein."}
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

          <section className="student-day-progress" aria-label="Your Foundry progress">
            <div>
              <span>
                <small>Your momentum</small>
                <strong>{student.progress_percent}% Foundry journey</strong>
              </span>
              <span>{completedCount} tasks complete</span>
            </div>
            <FoundryProgressBar value={student.progress_percent} compact />
            <Link href={preview ? "?tab=progress" : "/learn/progress"}>
              Progress dekhein
              <ArrowRight aria-hidden="true" size={15} />
            </Link>
          </section>
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
                    <p>{instructionFor(student, assignment.foundry_tasks)}</p>
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
              action={preview ? undefined : submitCurrentStudentWork}
              className="student-submit-form"
            >
              <input name="requestId" type="hidden" value={randomUUID()} />
              <input name="assignmentId" type="hidden" value={todayTask.id} />
              <label>
                Work link <small>(agar link hai)</small>
                <input
                  inputMode="url"
                  name="submissionUrl"
                  placeholder="https://drive.google.com/..."
                  type="url"
                  disabled={preview}
                />
              </label>
              <label>
                Teacher ko short note
                <textarea
                  name="studentNote"
                  placeholder="Maine task complete kiya. Yeh mera work hai."
                  rows={4}
                  disabled={preview}
                />
              </label>
              <p>
                {preview
                  ? "Founder preview mein submission band hai. Student account se yeh action live hoga."
                  : "Link nahi hai? Note likhein aur class mein screenshot / file dikhayein."}
              </p>
              <button
                aria-disabled={preview}
                className="student-primary-action"
                disabled={preview}
                type="submit"
              >
                {preview ? "Preview only" : "Work submit karein"}
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
