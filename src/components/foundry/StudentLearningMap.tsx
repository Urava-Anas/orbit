import type { CSSProperties } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Award,
  BookOpen,
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Clock3,
  FileText,
  Flag,
  Gem,
  Leaf,
  Lock,
  LockKeyhole,
  PlayCircle,
  Rocket,
  Sparkles,
  Star,
  Target,
  Trophy,
  UserRound,
  Wrench,
} from "lucide-react";
import type { FoundryJourney } from "@/lib/foundry-journey";
import { formatFoundryDate } from "@/lib/foundry";
import styles from "./StudentLearningMap.module.css";

export type StudentLearningMapNote = FoundryJourney["notes"][number];

type JourneyStudent = {
  id: string;
  foundry_id: string;
  full_name: string;
  level: string;
  department?: string;
  next_action: string | null;
};

type Props = {
  student: JourneyStudent;
  journey: FoundryJourney;
  mode?: "student" | "admin";
  studentViewHref?: string;
};

type LevelTone = "complete" | "current" | "upcoming" | "empty";

const levelNames = ["Introduced", "Practising", "Understood", "Applied", "Mastered", "Studio Ready"];
const levelDescriptions = [
  "Learn the foundation",
  "Apply what you learn",
  "Build strong clarity",
  "Use it in real work",
  "Prove consistent capability",
  "Ready for Studio delivery",
];

function statusLabel(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function classTone(status: string, startsAt: string, endsAt: string, now: number) {
  if (status === "completed") return "complete";
  if (status === "cancelled") return "cancelled";
  const start = new Date(startsAt).getTime();
  const end = new Date(endsAt).getTime();
  if (status === "live" || (start <= now && end >= now)) return "current";
  return start > now ? "upcoming" : "current";
}

function assignmentTone(status: string, startsAt: string, now: number) {
  if (status === "completed") return "complete";
  if (["cancelled", "missed"].includes(status)) return "cancelled";
  return new Date(startsAt).getTime() > now ? "upcoming" : "current";
}

function studioTone(status: string, startsAt: string, dueAt: string, now: number) {
  if (status === "completed") return "complete";
  if (status === "cancelled") return "cancelled";
  const start = new Date(startsAt).getTime();
  const due = new Date(dueAt).getTime();
  if (status === "active" || (start <= now && due >= now)) return "current";
  return start > now ? "upcoming" : "current";
}

function LevelIcon({ level }: { level: number }) {
  if (level === 1) return <Leaf aria-hidden="true" size={24} />;
  if (level === 2) return <BookOpen aria-hidden="true" size={24} />;
  if (level === 3) return <Target aria-hidden="true" size={24} />;
  if (level === 4) return <Rocket aria-hidden="true" size={24} />;
  if (level === 5) return <Gem aria-hidden="true" size={24} />;
  return <Trophy aria-hidden="true" size={24} />;
}

function ResourceIcon({ kind }: { kind: string }) {
  if (kind === "video") return <PlayCircle aria-hidden="true" size={15} />;
  if (kind === "tool") return <Wrench aria-hidden="true" size={15} />;
  if (["pdf", "file"].includes(kind)) return <FileText aria-hidden="true" size={15} />;
  return <BookOpen aria-hidden="true" size={15} />;
}

export function StudentLearningMap({ student, journey, mode = "student", studentViewHref }: Props) {
  // Server-render snapshot used only to classify time-sensitive records for this render.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const classLevel = new Map(journey.classes.map((item) => [item.id, item.level_number]));
  const seenLevels = [
    ...journey.classes.map((item) => item.level_number),
    ...journey.resources.map((item) => item.level_number),
    ...journey.assignments.map((item) => item.foundry_tasks?.level_number ?? 1),
    ...journey.studioAssignments.map((item) => item.level_number),
    ...journey.notes.map((item) => classLevel.get(item.class_id) ?? 1),
  ].filter((value) => Number.isFinite(value) && value > 0);
  const maxLevel = Math.max(6, ...seenLevels, 1);
  const levels = Array.from({ length: maxLevel }, (_, index) => index + 1);

  const levelModels = levels.map((levelNumber) => {
    const classes = journey.classes.filter((item) => item.level_number === levelNumber);
    const resources = journey.resources.filter((item) => item.level_number === levelNumber);
    const tasks = journey.assignments.filter((item) => (item.foundry_tasks?.level_number ?? 1) === levelNumber);
    const studio = journey.studioAssignments.filter((item) => item.level_number === levelNumber);
    const notes = journey.notes.filter((item) => (classLevel.get(item.class_id) ?? 1) === levelNumber);
    const note = notes[notes.length - 1] ?? null;

    const hasCurrent =
      classes.some((item) => classTone(item.status, item.starts_at, item.ends_at, now) === "current") ||
      tasks.some((item) => assignmentTone(item.status, item.starts_at, now) === "current") ||
      studio.some((item) => studioTone(item.status, item.starts_at, item.due_at, now) === "current");
    const hasUpcoming =
      classes.some((item) => classTone(item.status, item.starts_at, item.ends_at, now) === "upcoming") ||
      tasks.some((item) => assignmentTone(item.status, item.starts_at, now) === "upcoming") ||
      studio.some((item) => studioTone(item.status, item.starts_at, item.due_at, now) === "upcoming");
    const allRequiredDone =
      classes.length > 0 &&
      classes.every((item) => item.status === "completed") &&
      (!tasks.length || tasks.every((item) => item.status === "completed"));
    const earned =
      allRequiredDone &&
      Boolean(note?.achievement_title) &&
      ["understood", "applied", "mastered"].includes(note?.learning_state ?? "");
    const tone: LevelTone = earned
      ? "complete"
      : hasCurrent || (classes.some((item) => item.status === "completed") && !allRequiredDone)
        ? "current"
        : hasUpcoming || resources.length || classes.length || tasks.length || studio.length
          ? "upcoming"
          : "empty";

    return {
      levelNumber,
      classes,
      resources,
      tasks,
      studio,
      note,
      earned,
      tone,
      title: note?.learning_state ? statusLabel(note.learning_state) : levelNames[levelNumber - 1] ?? `Level ${levelNumber}`,
      subtitle: note?.impact_title ?? classes[0]?.title ?? levelDescriptions[levelNumber - 1] ?? "Continue the journey",
    };
  });

  const completedCount = levelModels.filter((level) => level.tone === "complete").length;
  const currentCount = levelModels.filter((level) => level.tone === "current").length;
  const lockedCount = levelModels.filter((level) => level.tone === "empty").length;
  const progressPercent = Math.round((completedCount / maxLevel) * 100);
  const currentModel =
    levelModels.find((level) => level.tone === "current") ??
    levelModels.find((level) => level.tone === "upcoming") ??
    levelModels[levelModels.length - 1];

  const activeTask = journey.assignments.find(
    (assignment) =>
      !["completed", "cancelled", "missed", "submitted", "under_review"].includes(assignment.status) &&
      new Date(assignment.starts_at).getTime() <= now,
  );
  const nextClass = journey.classes.find(
    (item) => !["completed", "cancelled"].includes(item.status) && new Date(item.ends_at).getTime() >= now,
  );
  const activeStudio = journey.studioAssignments.find(
    (item) =>
      item.status === "active" ||
      (item.status === "planned" && new Date(item.starts_at).getTime() <= now && new Date(item.due_at).getTime() >= now),
  );

  const nextAction = activeTask
    ? {
        label: "Continue current task",
        detail: activeTask.foundry_tasks?.title ?? "Current Foundry task",
        href: mode === "admin" ? `/dashboard/foundry/tasks?studentId=${student.id}` : "/learn/submit",
        external: false,
      }
    : nextClass
      ? {
          label: new Date(nextClass.starts_at).getTime() <= now ? "Join current class" : "Prepare for next class",
          detail: `${nextClass.title} · ${formatFoundryDate(nextClass.starts_at)}`,
          href: mode === "admin" ? "/dashboard/foundry/classes" : nextClass.join_url ?? "/learn/progress",
          external: mode === "student" && Boolean(nextClass.join_url),
        }
      : activeStudio
        ? {
            label: "Continue Studio work",
            detail: `${activeStudio.project_name_snapshot} · ${activeStudio.deliverable}`,
            href: mode === "admin" ? `/dashboard/foundry/studio?studentId=${student.id}` : "/learn/progress#studio-work",
            external: false,
          }
        : {
            label: "Review your map",
            detail: student.next_action ?? "Your next move will appear here as soon as it is assigned.",
            href: mode === "admin" ? `/dashboard/foundry/map?studentId=${student.id}` : "/learn/progress",
            external: false,
          };

  const achievementModels = levelModels.filter((level) => Boolean(level.note?.achievement_title)).slice(0, 3);
  const initials = student.full_name.split(" ").slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  const gradientId = `orbit-route-${student.id.replaceAll("-", "")}`;

  return (
    <div className={styles.shell}>
      <section className={styles.topbar}>
        <div>
          <span className={styles.eyebrow}>Orbit Journey</span>
          <h1>{student.full_name}&apos;s Journey Map</h1>
          <p>Keep learning. Keep building. Keep orbiting.</p>
        </div>
        <div className={styles.topbarActions}>
          <span className={styles.memberChip}><UserRound aria-hidden="true" size={15} />{student.full_name}</span>
          {mode === "admin" && studentViewHref ? (
            <Link className={styles.viewButton} href={studentViewHref}>View as student <ArrowUpRight aria-hidden="true" size={14} /></Link>
          ) : null}
        </div>
      </section>

      {mode === "admin" ? (
        <section className={styles.adminBar} aria-label="Admin map controls">
          <div>
            <LockKeyhole aria-hidden="true" size={16} />
            <span><strong>Admin controls</strong><small>Same Journey Map, extra authority.</small></span>
          </div>
          <nav>
            <Link href="/dashboard/foundry/classes">Schedule class</Link>
            <Link href={`/dashboard/foundry/notes?studentId=${student.id}`}>Add resource</Link>
            <Link href={`/dashboard/foundry/tasks?studentId=${student.id}`}>Assign task</Link>
            <Link href={`/dashboard/foundry/studio?studentId=${student.id}`}>Studio work</Link>
          </nav>
        </section>
      ) : null}

      <section className={styles.dashboard}>
        <div className={styles.routePanel}>
          <div className={styles.routeGlowOne} aria-hidden="true" />
          <div className={styles.routeGlowTwo} aria-hidden="true" />
          <div className={styles.routeHeader}>
            <div><span>Learning route</span><strong>START</strong></div>
            <div className={styles.legend}>
              <span><i className={styles.legendComplete} /> Verified</span>
              <span><i className={styles.legendCurrent} /> Current</span>
              <span><i className={styles.legendUpcoming} /> Next</span>
              <span><i className={styles.legendLocked} /> Locked</span>
            </div>
          </div>

          <div className={styles.route}>
            <svg className={styles.routePath} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6ee7f9" stopOpacity="0.78" />
                  <stop offset="42%" stopColor="#7c83ff" stopOpacity="0.72" />
                  <stop offset="75%" stopColor="#b76cff" stopOpacity="0.66" />
                  <stop offset="100%" stopColor="#ff7467" stopOpacity="0.58" />
                </linearGradient>
              </defs>
              <path d="M50 2 C18 7 18 16 50 20 S82 31 50 35 S18 47 50 51 S82 63 50 67 S18 79 50 83 S82 94 50 98" fill="none" stroke={`url(#${gradientId})`} strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
              <path className={styles.routePathSoft} d="M50 2 C18 7 18 16 50 20 S82 31 50 35 S18 47 50 51 S82 63 50 67 S18 79 50 83 S82 94 50 98" fill="none" stroke={`url(#${gradientId})`} strokeWidth="5" vectorEffect="non-scaling-stroke" />
            </svg>

            <div className={styles.routeSteps}>
              {levelModels.map((level, index) => {
                const theme = styles[`theme_${((level.levelNumber - 1) % 6) + 1}`];
                const side = index % 2 === 0 ? styles.stepLeft : styles.stepRight;
                const tone = styles[`tone_${level.tone}`];
                const statusText = level.tone === "complete" ? "Verified" : level.tone === "current" ? "In progress" : level.tone === "upcoming" ? "Next" : "Locked";

                return (
                  <article className={`${styles.routeStep} ${side} ${tone} ${theme}`} key={level.levelNumber}>
                    <details className={styles.nodeCard} open={level.tone === "current"}>
                      <summary>
                        <span className={styles.nodeOrb}><LevelIcon level={level.levelNumber} /></span>
                        <span className={styles.nodeCopy}>
                          <small>Level {level.levelNumber}</small>
                          <strong>{level.title}</strong>
                          <em>{level.subtitle}</em>
                        </span>
                        <span className={styles.nodeState}>
                          {level.tone === "complete" ? <CheckCircle2 aria-hidden="true" size={13} /> : level.tone === "empty" ? <Lock aria-hidden="true" size={13} /> : level.tone === "current" ? <Sparkles aria-hidden="true" size={13} /> : <Clock3 aria-hidden="true" size={13} />}
                          {statusText}
                        </span>
                        <ChevronDown className={styles.chevron} aria-hidden="true" size={17} />
                      </summary>

                      <div className={styles.nodeDetails}>
                        <div className={styles.signalRow}>
                          <span>{level.classes.length} class{level.classes.length === 1 ? "" : "es"}</span>
                          <span>{level.resources.length} resource{level.resources.length === 1 ? "" : "s"}</span>
                          <span>{level.tasks.length} task{level.tasks.length === 1 ? "" : "s"}</span>
                          {level.studio.length ? <span>{level.studio.length} Studio</span> : null}
                        </div>

                        {level.note?.impact_statement ? <p className={styles.impact}>{level.note.impact_statement}</p> : null}

                        {level.classes.length ? (
                          <section className={styles.detailBlock}>
                            <span><CalendarClock aria-hidden="true" size={14} /> Classes</span>
                            {level.classes.map((item) => (
                              <div className={styles.detailItem} key={item.id}>
                                <div><strong>{item.title}</strong><small>{formatFoundryDate(item.starts_at)} · {statusLabel(item.status)}</small></div>
                                {item.join_url && !["completed", "cancelled"].includes(item.status) ? <a href={item.join_url} rel="noreferrer" target="_blank" title="Open class"><ArrowUpRight aria-hidden="true" size={13} /></a> : null}
                              </div>
                            ))}
                          </section>
                        ) : null}

                        {level.resources.length ? (
                          <section className={styles.detailBlock}>
                            <span><BookOpen aria-hidden="true" size={14} /> Notes & resources</span>
                            {level.resources.map((resource) => resource.resource_url ? (
                              <a className={styles.detailItem} href={resource.resource_url} key={resource.id} rel="noreferrer" target="_blank">
                                <ResourceIcon kind={resource.resource_kind} />
                                <div><strong>{resource.title}</strong><small>{statusLabel(resource.resource_kind)}</small></div>
                                <ArrowUpRight aria-hidden="true" size={13} />
                              </a>
                            ) : (
                              <div className={styles.detailItem} key={resource.id}>
                                <ResourceIcon kind={resource.resource_kind} />
                                <div><strong>{resource.title}</strong><small>{resource.content ?? "Written note"}</small></div>
                              </div>
                            ))}
                          </section>
                        ) : null}

                        {level.tasks.length || level.note?.evidence_requirement ? (
                          <section className={styles.detailBlock}>
                            <span><Flag aria-hidden="true" size={14} /> Tasks & proof</span>
                            {level.tasks.map((assignment) => (
                              <div className={styles.detailItem} key={assignment.id}>
                                <Target aria-hidden="true" size={14} />
                                <div><strong>{assignment.foundry_tasks?.title ?? "Task"}</strong><small>{statusLabel(assignment.status)} · due {formatFoundryDate(assignment.due_at)}</small></div>
                              </div>
                            ))}
                            {level.note?.evidence_requirement ? <p className={styles.proofLine}><strong>Proof:</strong> {level.note.evidence_requirement}</p> : null}
                          </section>
                        ) : null}

                        {level.note?.achievement_title ? (
                          <section className={styles.achievementLine}>
                            <Award aria-hidden="true" size={18} />
                            <span><strong>{level.note.achievement_title}</strong><small>{level.earned ? "Verified achievement" : level.note.achievement_description ?? "Proof pending"}</small></span>
                            <b>+{level.note.xp_reward || 0} XP</b>
                          </section>
                        ) : null}

                        {level.studio.length ? (
                          <section className={styles.detailBlock} id="studio-work">
                            <span><BriefcaseBusiness aria-hidden="true" size={14} /> Studio work</span>
                            {level.studio.map((assignment) => (
                              <div className={styles.studioItem} key={assignment.id}>
                                <div><strong>{assignment.project_name_snapshot}</strong><small>{assignment.role_title} · {statusLabel(assignment.status)}</small></div>
                                <p>{assignment.deliverable}</p>
                                <time dateTime={assignment.due_at}>Due {formatFoundryDate(assignment.due_at)}</time>
                              </div>
                            ))}
                          </section>
                        ) : null}

                        {level.note?.next_step ? <div className={styles.levelNext}><Sparkles aria-hidden="true" size={14} /><span><small>Next move from this level</small><strong>{level.note.next_step}</strong></span></div> : null}

                        {mode === "admin" ? (
                          <nav className={styles.levelControls} aria-label={`Level ${level.levelNumber} controls`}>
                            <Link href="/dashboard/foundry/classes">Class</Link>
                            <Link href={`/dashboard/foundry/notes?studentId=${student.id}`}>Resource</Link>
                            <Link href={`/dashboard/foundry/tasks?studentId=${student.id}`}>Task</Link>
                            <Link href={`/dashboard/foundry/studio?studentId=${student.id}`}>Studio</Link>
                          </nav>
                        ) : null}
                      </div>
                    </details>
                  </article>
                );
              })}
            </div>

            <div className={styles.goalMarker}><Flag aria-hidden="true" size={18} /><span>GOAL</span></div>
          </div>
        </div>

        <aside className={styles.sideRail}>
          <section className={styles.profileCard}>
            <span className={styles.avatar}>{initials}</span>
            <div>
              <strong>{student.full_name}</strong>
              <p>{student.foundry_id}{student.department ? ` · ${statusLabel(student.department)}` : " · Foundry member"}</p>
              <span><i /> Active journey</span>
            </div>
          </section>

          <section className={styles.sideCard}>
            <div className={styles.sideCardHead}><strong>Verified progress</strong><span>{completedCount}/{maxLevel} levels</span></div>
            <div className={styles.progressLayout}>
              <div className={styles.progressDial} style={{ "--progress": `${progressPercent}%` } as CSSProperties}>
                <span>{progressPercent}%</span><small>verified</small>
              </div>
              <div className={styles.progressStats}>
                <span><b>{completedCount}</b> Verified</span>
                <span><b>{currentCount}</b> In progress</span>
                <span><b>{lockedCount}</b> Not planned</span>
              </div>
            </div>
          </section>

          <section className={`${styles.sideCard} ${styles.nextCard}`}>
            <span className={styles.sideEyebrow}>Next up</span>
            <div className={styles.nextLevelRow}>
              <span className={styles.miniOrb}><LevelIcon level={currentModel.levelNumber} /></span>
              <div><strong>Level {currentModel.levelNumber} · {currentModel.title}</strong><p>{nextAction.detail}</p></div>
            </div>
            {nextAction.external ? (
              <a className={styles.primaryAction} href={nextAction.href} rel="noreferrer" target="_blank">{nextAction.label} <ArrowUpRight aria-hidden="true" size={15} /></a>
            ) : (
              <Link className={styles.primaryAction} href={nextAction.href}>{nextAction.label} <ArrowRight aria-hidden="true" size={15} /></Link>
            )}
          </section>

          <section className={styles.sideCard}>
            <div className={styles.sideCardHead}><strong>Achievements</strong><Award aria-hidden="true" size={17} /></div>
            {achievementModels.length ? (
              <div className={styles.achievementGrid}>
                {achievementModels.map((level) => (
                  <div className={styles.miniAchievement} key={level.levelNumber}>
                    <span>{level.earned ? <Star aria-hidden="true" size={18} /> : <Lock aria-hidden="true" size={16} />}</span>
                    <strong>{level.note?.achievement_title}</strong>
                    <small>{level.earned ? `Level ${level.levelNumber} verified` : "Proof pending"}</small>
                  </div>
                ))}
              </div>
            ) : <p className={styles.emptyState}>Achievements will appear here after the first verified level.</p>}
          </section>

          <section className={styles.sideCard}>
            <span className={styles.sideEyebrow}>Quick actions</span>
            <div className={styles.quickActions}>
              <Link href={mode === "admin" ? "/dashboard/foundry/classes" : "/learn/learn"}><CalendarClock aria-hidden="true" size={15} /> Classes</Link>
              <Link href={mode === "admin" ? `/dashboard/foundry/tasks?studentId=${student.id}` : "/learn/submit"}><Target aria-hidden="true" size={15} /> Tasks</Link>
              <Link href={mode === "admin" ? `/dashboard/foundry/notes?studentId=${student.id}` : "/learn/notes"}><BookOpen aria-hidden="true" size={15} /> Notes</Link>
            </div>
          </section>
        </aside>
      </section>
    </div>
  );
}
