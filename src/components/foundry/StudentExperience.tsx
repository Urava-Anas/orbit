import { randomUUID } from "node:crypto";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Award,
  BookOpen,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  FileText,
  GraduationCap,
  PlayCircle,
  Send,
  Sparkles,
  Target,
  Trophy,
  UserRound,
  Wrench,
} from "lucide-react";
import { submitCurrentStudentWork } from "@/app/(app)/dashboard/foundry/actions";
import { FoundryActionButton } from "@/components/foundry/FoundryActionButton";
import type {
  FoundryAssignment,
  FoundryCertificate,
  FoundryNotification,
  FoundryProgressEvent,
  FoundrySkillScore,
  FoundryStudioReview,
  FoundryStudent,
  FoundrySubmission,
} from "@/lib/foundry";
import {
  formatFoundryDate,
  foundryDepartmentLabel,
} from "@/lib/foundry";
import type { FoundryJourney } from "@/lib/foundry-journey";
import styles from "./StudentExperience.module.css";

export type StudentExperienceSection =
  | "home"
  | "classes"
  | "resources"
  | "tasks"
  | "studio"
  | "profile";

type Props = {
  section: StudentExperienceSection;
  student: FoundryStudent;
  journey: FoundryJourney;
  assignments: FoundryAssignment[];
  submissions: FoundrySubmission[];
  notifications: FoundryNotification[];
  skills: FoundrySkillScore[];
  progress: FoundryProgressEvent[];
  studioReviews: FoundryStudioReview[];
  certificates: FoundryCertificate[];
  preview?: boolean;
  previewRoot?: string;
  calendarMonth?: string;
  notice?: string;
  error?: string;
};

const sectionCopy: Record<
  StudentExperienceSection,
  { eyebrow: string; title: string; detail: string }
> = {
  home: {
    eyebrow: "Your Orbit today",
    title: "One clear next move",
    detail:
      "Classes, resources, tasks, achievements and Studio work all come from the same Foundry record your admin manages.",
  },
  classes: {
    eyebrow: "Your schedule",
    title: "Classes on one calendar",
    detail:
      "Every class your department receives appears here automatically with its level, status, time and join link.",
  },
  resources: {
    eyebrow: "Your learning library",
    title: "Notes, tools and tutorials by level",
    detail:
      "Anything your admin links to a level—notes, PDFs, tools, videos or links—appears here and on your Journey Map.",
  },
  tasks: {
    eyebrow: "Your proof loop",
    title: "Past, current and upcoming tasks",
    detail:
      "See the full task history, understand what level each task proves and submit work without leaving your Foundry journey.",
  },
  studio: {
    eyebrow: "Real work",
    title: "Your Studio assignments",
    detail:
      "When you are assigned to a real Urava project, the role, deliverable, level and timeline appear here and on your map.",
  },
  profile: {
    eyebrow: "Verified record",
    title: "Your Foundry profile",
    detail:
      "Your identity, capability evidence, achievements, certificates and Studio readiness live in one private student record.",
  },
};

function label(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function pakistanDayKey(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function pakistanMonthKey(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(value);
  const year = parts.find((part) => part.type === "year")?.value ?? "2026";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  return `${year}-${month}`;
}

function shiftMonth(monthKey: string, amount: number) {
  const [year, month] = monthKey.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1 + amount, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
}

function resourceIcon(kind: string) {
  if (kind === "video") return PlayCircle;
  if (kind === "tool") return Wrench;
  if (["pdf", "file"].includes(kind)) return FileText;
  return BookOpen;
}

export function StudentExperience({
  section,
  student,
  journey,
  assignments,
  submissions,
  notifications,
  skills,
  progress,
  studioReviews,
  certificates,
  preview = false,
  previewRoot,
  calendarMonth,
  notice,
  error,
}: Props) {
  // Server-render snapshot used only to classify time-sensitive records for this render.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const copy = sectionCopy[section];
  const assignmentJourney = new Map(journey.assignments.map((item) => [item.id, item]));
  const latestSubmission = new Map<string, FoundrySubmission>();
  for (const submission of submissions) {
    if (!latestSubmission.has(submission.assignment_id)) {
      latestSubmission.set(submission.assignment_id, submission);
    }
  }

  const activeTask = assignments.find((assignment) => {
    const journeyItem = assignmentJourney.get(assignment.id);
    const start = journeyItem ? new Date(journeyItem.starts_at).getTime() : 0;
    return (
      start <= now &&
      !["completed", "submitted", "under_review", "cancelled", "missed"].includes(
        assignment.status,
      )
    );
  });
  const nextClass = journey.classes.find(
    (item) =>
      !["completed", "cancelled"].includes(item.status) &&
      new Date(item.ends_at).getTime() >= now,
  );
  const currentStudio = journey.studioAssignments.find(
    (item) =>
      item.status === "active" ||
      (item.status === "planned" &&
        new Date(item.starts_at).getTime() <= now &&
        new Date(item.due_at).getTime() >= now),
  );
  const totalXp = progress.reduce((sum, item) => sum + item.points, 0);
  const completedTasks = assignments.filter((item) => item.status === "completed").length;
  const completedClasses = journey.classes.filter((item) => item.status === "completed").length;
  const issuedCertificates = certificates.filter((item) => item.status === "issued");
  const classLevel = new Map(journey.classes.map((item) => [item.id, item.level_number]));
  const currentLevel = Math.max(
    1,
    ...journey.classes
      .filter((item) => new Date(item.starts_at).getTime() <= now)
      .map((item) => item.level_number),
    ...journey.assignments
      .filter((item) => new Date(item.starts_at).getTime() <= now)
      .map((item) => item.foundry_tasks?.level_number ?? 1),
    ...journey.studioAssignments
      .filter((item) => new Date(item.starts_at).getTime() <= now)
      .map((item) => item.level_number),
  );

  function hrefFor(target: "home" | "map" | "classes" | "resources" | "tasks" | "studio" | "profile", extra?: string) {
    if (preview && previewRoot) {
      if (target === "map") {
        return `/dashboard/foundry/map?studentId=${student.id}&view=student`;
      }
      const base = `${previewRoot}?tab=${target}&view=student`;
      return extra ? `${base}&${extra}` : base;
    }
    const routes = {
      home: "/learn",
      map: "/learn/progress",
      classes: "/learn/classes",
      resources: "/learn/resources",
      tasks: "/learn/tasks",
      studio: "/learn/studio",
      profile: "/learn/profile",
    } as const;
    return extra ? `${routes[target]}?${extra}` : routes[target];
  }

  const nextMove = activeTask
    ? {
        label: "Continue your task",
        detail: activeTask.foundry_tasks?.title ?? "Current Foundry task",
        href: hrefFor("tasks"),
      }
    : nextClass
      ? {
          label:
            new Date(nextClass.starts_at).getTime() <= now
              ? "Join your class"
              : "Prepare for your next class",
          detail: `${nextClass.title} · Level ${nextClass.level_number}`,
          href: hrefFor("classes"),
        }
      : currentStudio
        ? {
            label: "Continue Studio work",
            detail: `${currentStudio.project_name_snapshot} · ${currentStudio.deliverable}`,
            href: hrefFor("studio"),
          }
        : {
            label: "Review your Journey Map",
            detail: student.next_action ?? "Your next assigned move will appear here.",
            href: hrefFor("map"),
          };

  const hero = (
    <section className={styles.hero}>
      <div>
        <span className={styles.eyebrow}>{copy.eyebrow}</span>
        <h1>{copy.title}</h1>
        <p>{copy.detail}</p>
        <div className={styles.identity}>
          <span><UserRound aria-hidden="true" size={14} /> {student.full_name}</span>
          <span>{student.foundry_id}</span>
          <span>{foundryDepartmentLabel(student.department)}</span>
          <span>Level {currentLevel}</span>
        </div>
      </div>
      <aside className={styles.heroAction}>
        <small><Sparkles aria-hidden="true" size={12} /> What&apos;s next?</small>
        <strong>{nextMove.label}</strong>
        <span>{nextMove.detail}</span>
        <Link href={nextMove.href}>Open now <ArrowRight aria-hidden="true" size={15} /></Link>
      </aside>
    </section>
  );

  if (section === "home") {
    return (
      <div className={styles.surface}>
        {hero}
        {notice || error ? (
          <section className={styles.card} role="status">
            <strong>{error ? "Action needs attention" : "Updated"}</strong>
            <p>{error ?? notice}</p>
          </section>
        ) : null}
        <section className={styles.metrics} aria-label="Student journey summary">
          <article className={styles.metric}>
            <small>Current level</small>
            <strong>Level {currentLevel}</strong>
            <p>Your current position on the shared Journey Map.</p>
          </article>
          <article className={styles.metric}>
            <small>Classes completed</small>
            <strong>{completedClasses}</strong>
            <p>Verified completed classes in your Foundry record.</p>
          </article>
          <article className={styles.metric}>
            <small>Tasks completed</small>
            <strong>{completedTasks}</strong>
            <p>Proof tasks accepted or marked complete.</p>
          </article>
          <article className={styles.metric}>
            <small>Verified XP</small>
            <strong>{totalXp}</strong>
            <p>Points recorded from real progress events.</p>
          </article>
        </section>

        <section className={styles.grid2}>
          <article className={styles.card}>
            <div className={styles.cardHead}>
              <div>
                <span className={styles.cardLabel}>Journey</span>
                <h2>Your map is the source of truth</h2>
                <p>Open the same level path your founder sees, without admin controls.</p>
              </div>
              <Trophy aria-hidden="true" size={20} />
            </div>
            <div className={styles.itemList}>
              <Link className={styles.item} href={hrefFor("map")}>
                <span className={styles.dot} />
                <span><strong>Open Journey Map</strong><small>Level {currentLevel} · synced live</small></span>
                <ArrowRight aria-hidden="true" size={15} />
              </Link>
              <Link className={styles.item} href={hrefFor("classes")}>
                <span className={styles.dotFuture} />
                <span><strong>Classes</strong><small>{nextClass ? `Next: ${nextClass.title}` : "No upcoming class"}</small></span>
                <ArrowRight aria-hidden="true" size={15} />
              </Link>
              <Link className={styles.item} href={hrefFor("resources")}>
                <span className={styles.dotFuture} />
                <span><strong>Resources</strong><small>{journey.resources.length} published learning resources</small></span>
                <ArrowRight aria-hidden="true" size={15} />
              </Link>
              <Link className={styles.item} href={hrefFor("tasks")}>
                <span className={activeTask ? styles.dot : styles.dotFuture} />
                <span><strong>Tasks</strong><small>{activeTask?.foundry_tasks?.title ?? "No active task"}</small></span>
                <ArrowRight aria-hidden="true" size={15} />
              </Link>
            </div>
          </article>

          <article className={styles.card}>
            <div className={styles.cardHead}>
              <div>
                <span className={styles.cardLabel}>Updates</span>
                <h2>What changed in Foundry</h2>
                <p>New classes, tasks, reviews and certificates appear from admin actions.</p>
              </div>
              <Sparkles aria-hidden="true" size={20} />
            </div>
            {notifications.length ? (
              <div className={styles.itemList}>
                {notifications.slice(0, 5).map((item) => (
                  <div className={styles.updateRow} key={item.id}>
                    <span className={item.read_at ? styles.dotFuture : styles.dot} />
                    <span><strong>{item.title}</strong><small>{item.body} · {formatFoundryDate(item.created_at)}</small></span>
                    <span className={styles.kind}>{label(item.kind)}</span>
                  </div>
                ))}
              </div>
            ) : <p className={styles.empty}>No new Foundry update yet.</p>}
          </article>
        </section>
      </div>
    );
  }

  if (section === "classes") {
    const month = /^\d{4}-\d{2}$/.test(calendarMonth ?? "")
      ? (calendarMonth as string)
      : pakistanMonthKey();
    const [year, monthNumber] = month.split("-").map(Number);
    const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
    const firstWeekday = new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay();
    const classesByDay = new Map<string, FoundryJourney["classes"]>();
    for (const item of journey.classes) {
      const day = pakistanDayKey(item.starts_at);
      const group = classesByDay.get(day) ?? [];
      group.push(item);
      classesByDay.set(day, group);
    }
    const monthLabel = new Intl.DateTimeFormat("en-US", {
      month: "long",
      year: "numeric",
      timeZone: "Asia/Karachi",
    }).format(new Date(`${month}-01T12:00:00+05:00`));

    return (
      <div className={styles.surface}>
        {hero}
        <section className={styles.calendar}>
          <div className={styles.calendarHeader}>
            <div>
              <small>Department calendar</small>
              <h2>{monthLabel}</h2>
            </div>
            <div className={styles.calendarLegend}>
              <Link className={styles.levelPill} href={hrefFor("classes", `month=${shiftMonth(month, -1)}`)}>Previous</Link>
              <span className={styles.levelPill}>{foundryDepartmentLabel(student.department)}</span>
              <Link className={styles.levelPill} href={hrefFor("classes", `month=${shiftMonth(month, 1)}`)}>Next</Link>
            </div>
          </div>
          <div className={styles.calendarGrid}>
            {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((day) => <div className={styles.weekday} key={day}>{day}</div>)}
            {Array.from({ length: firstWeekday }, (_, index) => <div className={styles.blankDay} key={`blank-${index}`} />)}
            {Array.from({ length: daysInMonth }, (_, index) => {
              const dayNumber = index + 1;
              const key = `${month}-${String(dayNumber).padStart(2, "0")}`;
              const dayClasses = classesByDay.get(key) ?? [];
              return (
                <article className={styles.day} key={key}>
                  <span className={styles.dayNumber}>{dayNumber}</span>
                  <div className={styles.dayEvents}>
                    {dayClasses.map((item) =>
                      item.join_url && !["completed", "cancelled"].includes(item.status) ? (
                        <a href={item.join_url} key={item.id} rel="noreferrer" target="_blank">
                          L{item.level_number} · {item.title}
                        </a>
                      ) : (
                        <span key={item.id}>L{item.level_number} · {item.title}</span>
                      ),
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <article className={styles.card}>
          <div className={styles.cardHead}>
            <div>
              <span className={styles.cardLabel}>Schedule</span>
              <h2>All your classes</h2>
              <p>Changes made by the founder appear here and on your Journey Map.</p>
            </div>
            <CalendarDays aria-hidden="true" size={20} />
          </div>
          {journey.classes.length ? (
            <div className={styles.itemList}>
              {journey.classes.map((item) => (
                <div className={styles.item} key={item.id}>
                  <span className={item.status === "completed" ? styles.dotDone : new Date(item.starts_at).getTime() > now ? styles.dotFuture : styles.dot} />
                  <span><strong>Level {item.level_number} · {item.title}</strong><small>{formatFoundryDate(item.starts_at)} · {item.instructor_name} · {label(item.status)}</small></span>
                  {item.join_url && !["completed", "cancelled"].includes(item.status) ? <a className={styles.inlineLink} href={item.join_url} rel="noreferrer" target="_blank">Join <ArrowUpRight size={14} /></a> : <span className={styles.status}>{label(item.status)}</span>}
                </div>
              ))}
            </div>
          ) : <p className={styles.empty}>No class has been scheduled for your department yet.</p>}
        </article>
      </div>
    );
  }

  if (section === "resources") {
    const seenLevels = [
      ...journey.resources.map((item) => item.level_number),
      ...journey.notes.map((item) => classLevel.get(item.class_id) ?? 1),
    ];
    const levels = [...new Set(seenLevels)].sort((a, b) => a - b);

    return (
      <div className={styles.surface}>
        {hero}
        <div className={styles.levelGroup}>
          {levels.length ? levels.map((levelNumber) => {
            const resources = journey.resources.filter((item) => item.level_number === levelNumber);
            const notes = journey.notes.filter((item) => (classLevel.get(item.class_id) ?? 1) === levelNumber);
            return (
              <section className={styles.levelSection} key={levelNumber}>
                <div className={styles.levelHeader}>
                  <div>
                    <span className={styles.levelLabel}>Level {levelNumber}</span>
                    <h2>{notes.at(-1)?.impact_title ?? `Level ${levelNumber} learning kit`}</h2>
                  </div>
                  <Link className={styles.levelPill} href={hrefFor("map")}>See on map</Link>
                </div>
                {notes.at(-1)?.impact_statement ? <p className={styles.empty}>{notes.at(-1)?.impact_statement}</p> : null}
                <div className={styles.itemList}>
                  {resources.map((resource) => {
                    const Icon = resourceIcon(resource.resource_kind);
                    const body = (
                      <>
                        <Icon aria-hidden="true" size={17} />
                        <span><strong>{resource.title}</strong><small>{resource.content ?? label(resource.resource_kind)}</small></span>
                        <span className={styles.kind}>{label(resource.resource_kind)}</span>
                      </>
                    );
                    return resource.resource_url ? (
                      <a className={styles.resource} href={resource.resource_url} key={resource.id} rel="noreferrer" target="_blank">{body}</a>
                    ) : (
                      <div className={styles.resource} key={resource.id}>{body}</div>
                    );
                  })}
                  {notes.map((note) => note.resource_url ? (
                    <a className={styles.resource} href={note.resource_url} key={`note-${note.id}`} rel="noreferrer" target="_blank">
                      <FileText aria-hidden="true" size={17} />
                      <span><strong>{note.class_title_snapshot}</strong><small>{note.progress_summary ?? note.next_step ?? "Class learning note"}</small></span>
                      <span className={styles.kind}>Class note</span>
                    </a>
                  ) : null)}
                </div>
              </section>
            );
          }) : (
            <section className={styles.card}><p className={styles.empty}>No level resource has been published for you yet.</p></section>
          )}
        </div>
      </div>
    );
  }

  if (section === "tasks") {
    const done: FoundryAssignment[] = [];
    const current: FoundryAssignment[] = [];
    const future: FoundryAssignment[] = [];
    for (const assignment of assignments) {
      const journeyItem = assignmentJourney.get(assignment.id);
      const startsAt = journeyItem ? new Date(journeyItem.starts_at).getTime() : 0;
      if (assignment.status === "completed") done.push(assignment);
      else if (startsAt > now) future.push(assignment);
      else current.push(assignment);
    }

    const column = (title: string, items: FoundryAssignment[], state: "done" | "current" | "future") => (
      <section className={styles.taskColumn}>
        <header><strong>{title}</strong><span>{items.length}</span></header>
        {items.length ? items.map((assignment) => {
          const journeyItem = assignmentJourney.get(assignment.id);
          const submission = latestSubmission.get(assignment.id);
          return (
            <article className={styles.taskRow} key={assignment.id}>
              <span className={state === "done" ? styles.dotDone : state === "future" ? styles.dotFuture : styles.dot} />
              <span>
                <strong>Level {journeyItem?.foundry_tasks?.level_number ?? 1} · {assignment.foundry_tasks?.title ?? "Task"}</strong>
                <small>{label(assignment.status)} · due {formatFoundryDate(assignment.due_at)}{submission?.feedback ? ` · ${submission.feedback}` : ""}</small>
              </span>
              <span className={styles.status}>{submission ? label(submission.status) : label(assignment.status)}</span>
            </article>
          );
        }) : <p className={styles.empty}>Nothing here yet.</p>}
      </section>
    );

    return (
      <div className={styles.surface}>
        {hero}
        <section className={styles.taskColumns}>
          {column("Done", done, "done")}
          {column("Current", current, "current")}
          {column("Upcoming", future, "future")}
        </section>

        {activeTask ? (
          <section className={styles.timelineCard}>
            <span className={styles.cardLabel}>Current proof task</span>
            <h2>{activeTask.foundry_tasks?.title ?? "Current task"}</h2>
            <p>{activeTask.foundry_tasks?.instructions_roman_urdu ?? "Complete the assigned work and submit proof below."}</p>
            <div className={styles.identity}>
              <span>Level {assignmentJourney.get(activeTask.id)?.foundry_tasks?.level_number ?? 1}</span>
              <span>{activeTask.foundry_tasks?.difficulty ?? "standard"}</span>
              <span>{activeTask.foundry_tasks?.points ?? 0} points</span>
              <span>Due {formatFoundryDate(activeTask.due_at)}</span>
            </div>
            <div className={styles.submitCard}>
              <h3>Submit your proof</h3>
              <p>{preview ? "Preview mode shows the exact form, but cannot submit." : "Add a work link, a short note, or both. Your founder will review the same submission in Foundry."}</p>
              <form action={preview ? undefined : submitCurrentStudentWork} className={styles.submitForm}>
                <input name="requestId" type="hidden" value={randomUUID()} />
                <input name="assignmentId" type="hidden" value={activeTask.id} />
                <label>Work link<input disabled={preview} inputMode="url" name="submissionUrl" placeholder="https://drive.google.com/..." type="url" /></label>
                <label>Short note<textarea disabled={preview} name="studentNote" placeholder="Maine task complete kiya. Yeh mera work hai." rows={4} /></label>
                <FoundryActionButton disabled={preview} pendingLabel="Submitting…">
                  <Send aria-hidden="true" size={15} /> Submit for review
                </FoundryActionButton>
              </form>
            </div>
          </section>
        ) : (
          <section className={styles.card}>
            <div className={styles.cardHead}><div><span className={styles.cardLabel}>Current task</span><h2>No task needs submission right now</h2><p>Future tasks remain visible above but do not enter your immediate loop before their start time.</p></div><CheckCircle2 aria-hidden="true" size={20} /></div>
          </section>
        )}
      </div>
    );
  }

  if (section === "studio") {
    const active = journey.studioAssignments.filter((item) => item.status === "active");
    const planned = journey.studioAssignments.filter((item) => item.status === "planned");
    const completed = journey.studioAssignments.filter((item) => item.status === "completed");
    const renderStudio = (title: string, items: typeof journey.studioAssignments) => (
      <article className={styles.card}>
        <div className={styles.cardHead}><div><span className={styles.cardLabel}>{title}</span><h2>{items.length} assignment{items.length === 1 ? "" : "s"}</h2></div><BriefcaseBusiness aria-hidden="true" size={20} /></div>
        {items.length ? <div className={styles.itemList}>{items.map((item) => (
          <div className={styles.studioRow} key={item.id}>
            <span className={item.status === "completed" ? styles.dotDone : item.status === "planned" ? styles.dotFuture : styles.dot} />
            <span><strong>Level {item.level_number} · {item.project_name_snapshot}</strong><small>{item.role_title} · {item.deliverable} · {formatFoundryDate(item.starts_at)} → {formatFoundryDate(item.due_at)}</small></span>
            <span className={styles.status}>{label(item.status)}</span>
          </div>
        ))}</div> : <p className={styles.empty}>Nothing in this stage yet.</p>}
      </article>
    );

    return (
      <div className={styles.surface}>
        {hero}
        <section className={styles.grid2}>
          {renderStudio("Current Studio work", active)}
          {renderStudio("Upcoming projects", planned)}
        </section>
        {renderStudio("Completed Studio history", completed)}
        {studioReviews[0] ? (
          <article className={styles.card}>
            <span className={styles.cardLabel}>Latest Studio review</span>
            <h2>{label(studioReviews[0].status)}</h2>
            <p>{studioReviews[0].evidence_summary}</p>
          </article>
        ) : null}
      </div>
    );
  }

  const achievementTargets = journey.notes.filter((item) => item.achievement_title);
  return (
    <div className={styles.surface}>
      {hero}
      <section className={styles.profileGrid}>
        <article className={styles.profileCard}>
          <div className={styles.profileHero}>
            <span className={styles.avatar}>{student.full_name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</span>
            <span><strong>{student.full_name}</strong><small>{student.foundry_id} · {foundryDepartmentLabel(student.department)}</small></span>
          </div>
          <dl className={styles.definitionList}>
            <div><dt>Current level</dt><dd>Level {currentLevel}</dd></div>
            <div><dt>Foundry status</dt><dd>{label(student.lifecycle_status)}</dd></div>
            <div><dt>Preferred language</dt><dd>{label(student.preferred_language)}</dd></div>
            <div><dt>Studio eligible</dt><dd>{student.studio_eligible ? "Yes" : "Not yet"}</dd></div>
            <div><dt>Verified XP</dt><dd>{totalXp}</dd></div>
          </dl>
        </article>

        <article className={styles.profileCard}>
          <span className={styles.cardLabel}>Capability evidence</span>
          <h2>What your record proves</h2>
          {skills.length ? <div className={styles.itemList}>{skills.map((skill) => (
            <div className={styles.item} key={skill.id}>
              <Target aria-hidden="true" size={17} />
              <span><strong>{label(skill.dimension)}</strong><small>{skill.evidence_count} evidence item{skill.evidence_count === 1 ? "" : "s"} · score {skill.score}</small></span>
              <span className={styles.status}>{skill.score}</span>
            </div>
          ))}</div> : <p className={styles.empty}>Capability evidence will appear after reviewed work.</p>}
        </article>
      </section>

      <section className={styles.grid2}>
        <article className={styles.profileCard}>
          <span className={styles.cardLabel}>Achievements</span>
          <h2>Level targets and verified milestones</h2>
          {achievementTargets.length ? <div className={styles.itemList}>{achievementTargets.map((item) => (
            <div className={styles.item} key={item.id}>
              <Award aria-hidden="true" size={17} />
              <span><strong>{item.achievement_title}</strong><small>{item.achievement_description ?? item.progress_summary ?? label(item.learning_state)}</small></span>
              <span className={styles.status}>+{item.xp_reward} XP</span>
            </div>
          ))}</div> : <p className={styles.empty}>Achievement targets will appear when levels are defined.</p>}
        </article>

        <article className={styles.profileCard}>
          <span className={styles.cardLabel}>Certificates</span>
          <h2>Issued proof</h2>
          {issuedCertificates.length ? <div className={styles.itemList}>{issuedCertificates.map((certificate) => (
            <a className={styles.resource} href={`/certificates/${certificate.verification_token}`} key={certificate.id} rel="noreferrer" target="_blank">
              <GraduationCap aria-hidden="true" size={17} />
              <span><strong>{certificate.title}</strong><small>{certificate.certificate_number} · {formatFoundryDate(certificate.issued_at)}</small></span>
              <ArrowUpRight aria-hidden="true" size={14} />
            </a>
          ))}</div> : <p className={styles.empty}>No certificate has been issued yet.</p>}
        </article>
      </section>
    </div>
  );
}
