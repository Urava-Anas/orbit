import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Award,
  BookOpen,
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  Clock3,
  FileText,
  Flag,
  Layers3,
  LockKeyhole,
  Sparkles,
  Target,
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
  next_action: string | null;
};

type Props = {
  student: JourneyStudent;
  journey: FoundryJourney;
  mode?: "student" | "admin";
  studentViewHref?: string;
};

type LevelTone = "complete" | "current" | "upcoming" | "empty";

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

export function StudentLearningMap({
  student,
  journey,
  mode = "student",
  studentViewHref,
}: Props) {
  const now = Date.now();
  const classLevel = new Map(journey.classes.map((item) => [item.id, item.level_number]));
  const seenLevels = [
    ...journey.classes.map((item) => item.level_number),
    ...journey.resources.map((item) => item.level_number),
    ...journey.assignments.map((item) => item.foundry_tasks?.level_number ?? 1),
    ...journey.studioAssignments.map((item) => item.level_number),
    ...journey.notes.map((item) => classLevel.get(item.class_id) ?? 1),
  ].filter((value) => Number.isFinite(value) && value > 0);
  const maxLevel = Math.max(4, ...seenLevels, 1);
  const levels = Array.from({ length: maxLevel }, (_, index) => index + 1);

  const activeTask = journey.assignments.find(
    (assignment) =>
      !["completed", "cancelled", "missed", "submitted", "under_review"].includes(
        assignment.status,
      ) && new Date(assignment.starts_at).getTime() <= now,
  );
  const nextClass = journey.classes.find(
    (item) =>
      !["completed", "cancelled"].includes(item.status) &&
      new Date(item.ends_at).getTime() >= now,
  );
  const activeStudio = journey.studioAssignments.find(
    (item) =>
      item.status === "active" ||
      (item.status === "planned" &&
        new Date(item.starts_at).getTime() <= now &&
        new Date(item.due_at).getTime() >= now),
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

  return (
    <div className={styles.shell}>
      <section className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>Orbit member journey</span>
          <h1>{student.full_name}&apos;s map</h1>
          <p>
            Read each level in the same order: class → learning resources → task/proof →
            achievement → Studio work. Nothing important lives on a disconnected page.
          </p>
          <div className={styles.identityRow}>
            <span>{student.foundry_id}</span>
            <span>{maxLevel} visible levels</span>
            <span>{journey.progress.reduce((sum, event) => sum + event.points, 0)} XP recorded</span>
          </div>
        </div>

        <aside className={styles.nextMove}>
          <span><Sparkles aria-hidden="true" size={15} /> What&apos;s next?</span>
          <strong>{nextAction.label}</strong>
          <p>{nextAction.detail}</p>
          {nextAction.external ? (
            <a href={nextAction.href} rel="noreferrer" target="_blank">
              Open now <ArrowUpRight aria-hidden="true" size={16} />
            </a>
          ) : (
            <Link href={nextAction.href}>Open now <ArrowRight aria-hidden="true" size={16} /></Link>
          )}
        </aside>
      </section>

      {mode === "admin" ? (
        <section className={styles.adminBar} aria-label="Admin map controls">
          <div>
            <LockKeyhole aria-hidden="true" size={17} />
            <span>
              <strong>Admin controls</strong>
              <small>Every action below feeds this same map.</small>
            </span>
          </div>
          <nav>
            <Link href="/dashboard/foundry/classes">Schedule class</Link>
            <Link href={`/dashboard/foundry/notes?studentId=${student.id}`}>Add notes/resources</Link>
            <Link href={`/dashboard/foundry/tasks?studentId=${student.id}`}>Assign task</Link>
            <Link href={`/dashboard/foundry/studio?studentId=${student.id}`}>Assign Studio work</Link>
            {studentViewHref ? <Link href={studentViewHref}>View as student</Link> : null}
          </nav>
        </section>
      ) : null}

      <section className={styles.map} aria-label="Member level journey">
        {levels.map((levelNumber) => {
          const classes = journey.classes.filter((item) => item.level_number === levelNumber);
          const resources = journey.resources.filter((item) => item.level_number === levelNumber);
          const tasks = journey.assignments.filter(
            (item) => (item.foundry_tasks?.level_number ?? 1) === levelNumber,
          );
          const studio = journey.studioAssignments.filter((item) => item.level_number === levelNumber);
          const notes = journey.notes.filter(
            (item) => (classLevel.get(item.class_id) ?? 1) === levelNumber,
          );
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

          return (
            <article className={`${styles.level} ${styles[`tone_${tone}`]}`} key={levelNumber}>
              <div className={styles.rail} aria-hidden="true">
                <span>{levelNumber}</span>
                {levelNumber < maxLevel ? <i /> : null}
              </div>

              <div className={styles.levelBody}>
                <header className={styles.levelHead}>
                  <div>
                    <span>Level {levelNumber}</span>
                    <h2>{note?.impact_title ?? (classes.length ? "Capability in progress" : "Future capability")}</h2>
                    <p>
                      {note?.impact_statement ??
                        (classes.length
                          ? "This level already has learning activity. Complete the class, resources and proof loop to verify the capability."
                          : "Nothing is planned here yet. Admin controls can add the next learning move when needed.")}
                    </p>
                  </div>
                  <span className={styles.levelState}>
                    {tone === "complete" ? <CheckCircle2 aria-hidden="true" size={15} /> : tone === "current" ? <Target aria-hidden="true" size={15} /> : tone === "upcoming" ? <Clock3 aria-hidden="true" size={15} /> : <Layers3 aria-hidden="true" size={15} />}
                    {tone === "complete" ? "Achievement earned" : tone === "current" ? "Current" : tone === "upcoming" ? "Upcoming" : "Not planned"}
                  </span>
                </header>

                <div className={styles.grid}>
                  <section className={styles.block}>
                    <div className={styles.blockLabel}><CalendarClock aria-hidden="true" size={16} /> Classes</div>
                    {classes.length ? (
                      <div className={styles.itemList}>
                        {classes.map((item) => (
                          <div className={styles.item} key={item.id}>
                            <span className={styles[item.status === "completed" ? "dotDone" : "dot"]} />
                            <div>
                              <strong>{item.title}</strong>
                              <small>{formatFoundryDate(item.starts_at)} · {statusLabel(item.status)}</small>
                            </div>
                            {item.join_url && !["completed", "cancelled"].includes(item.status) ? (
                              <a href={item.join_url} rel="noreferrer" target="_blank" title="Open class">
                                <ArrowUpRight aria-hidden="true" size={14} />
                              </a>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : <p className={styles.empty}>No class scheduled at this level.</p>}
                  </section>

                  <section className={styles.block}>
                    <div className={styles.blockLabel}><FileText aria-hidden="true" size={16} /> Notes & resources</div>
                    {resources.length ? (
                      <div className={styles.itemList}>
                        {resources.map((resource) =>
                          resource.resource_url ? (
                            <a className={styles.resource} href={resource.resource_url} key={resource.id} rel="noreferrer" target="_blank">
                              <BookOpen aria-hidden="true" size={15} />
                              <span>
                                <strong>{resource.title}</strong>
                                <small>{statusLabel(resource.resource_kind)}</small>
                              </span>
                              <ArrowUpRight aria-hidden="true" size={14} />
                            </a>
                          ) : (
                            <div className={styles.resource} key={resource.id}>
                              <BookOpen aria-hidden="true" size={15} />
                              <span>
                                <strong>{resource.title}</strong>
                                <small>{resource.content ?? "Written note"}</small>
                              </span>
                            </div>
                          ),
                        )}
                      </div>
                    ) : note?.resource_url ? (
                      <a className={styles.resource} href={note.resource_url} rel="noreferrer" target="_blank">
                        <BookOpen aria-hidden="true" size={15} />
                        <span><strong>Open class resource</strong><small>Level {levelNumber}</small></span>
                        <ArrowUpRight aria-hidden="true" size={14} />
                      </a>
                    ) : <p className={styles.empty}>No note, tool, tutorial or file linked yet.</p>}
                  </section>

                  <section className={styles.block}>
                    <div className={styles.blockLabel}><Flag aria-hidden="true" size={16} /> Tasks & proof</div>
                    {tasks.length ? (
                      <div className={styles.itemList}>
                        {tasks.map((assignment) => (
                          <div className={styles.item} key={assignment.id}>
                            <span className={assignment.status === "completed" ? styles.dotDone : styles.dot} />
                            <div>
                              <strong>{assignment.foundry_tasks?.title ?? "Task"}</strong>
                              <small>{statusLabel(assignment.status)} · due {formatFoundryDate(assignment.due_at)}</small>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : <p className={styles.empty}>No proof task assigned yet.</p>}
                    {note?.evidence_requirement ? (
                      <p className={styles.proofRequirement}><strong>Proof required:</strong> {note.evidence_requirement}</p>
                    ) : null}
                  </section>

                  <section className={styles.block}>
                    <div className={styles.blockLabel}><Award aria-hidden="true" size={16} /> Achievement</div>
                    {note?.achievement_title ? (
                      <div className={styles.achievement}>
                        <Award aria-hidden="true" size={24} />
                        <span>
                          <strong>{note.achievement_title}</strong>
                          <small>{earned ? "Verified on this map" : note.achievement_description ?? "Proof pending"}</small>
                        </span>
                        <b>+{note.xp_reward || 0} XP</b>
                      </div>
                    ) : <p className={styles.empty}>Achievement target not defined yet.</p>}
                  </section>
                </div>

                {studio.length ? (
                  <section className={styles.studioBlock} id="studio-work">
                    <div className={styles.blockLabel}><BriefcaseBusiness aria-hidden="true" size={16} /> Studio work</div>
                    <div className={styles.itemList}>
                      {studio.map((assignment) => (
                        <div className={styles.studioItem} key={assignment.id}>
                          <span>
                            <strong>{assignment.project_name_snapshot}</strong>
                            <small>{assignment.role_title} · {statusLabel(assignment.status)}</small>
                          </span>
                          <p>{assignment.deliverable}</p>
                          <time dateTime={assignment.due_at}>Due {formatFoundryDate(assignment.due_at)}</time>
                        </div>
                      ))}
                    </div>
                  </section>
                ) : null}

                {note?.next_step ? (
                  <div className={styles.levelNext}>
                    <Sparkles aria-hidden="true" size={15} />
                    <span><small>Next move from this level</small><strong>{note.next_step}</strong></span>
                  </div>
                ) : null}

                {mode === "admin" ? (
                  <div className={styles.levelControls}>
                    <Link href="/dashboard/foundry/classes">Class</Link>
                    <Link href={`/dashboard/foundry/notes?studentId=${student.id}`}>Notes/resources</Link>
                    <Link href={`/dashboard/foundry/tasks?studentId=${student.id}`}>Task</Link>
                    <Link href={`/dashboard/foundry/studio?studentId=${student.id}`}>Studio</Link>
                  </div>
                ) : null}
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
