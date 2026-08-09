import Link from "next/link";
import {
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  Clock3,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  Trophy,
} from "lucide-react";
import type { FoundryProgressEvent, FoundryStudent } from "@/lib/foundry";
import { formatFoundryDate, foundryLevelLabel } from "@/lib/foundry";
import styles from "./StudentLearningMap.module.css";

export type StudentLearningMapNote = {
  id: string;
  class_id: string;
  class_title_snapshot: string;
  class_date: string;
  learning_state: string;
  progress_summary: string | null;
  next_step: string | null;
  resource_url: string | null;
  impact_title: string | null;
  impact_statement: string | null;
  achievement_title: string | null;
  achievement_description: string | null;
  evidence_requirement: string | null;
  xp_reward: number;
};

type LearningMapMode = "student" | "admin";

type Props = {
  student: Pick<FoundryStudent, "id" | "foundry_id" | "full_name" | "level" | "next_action">;
  notes: StudentLearningMapNote[];
  progress: FoundryProgressEvent[];
  mode?: LearningMapMode;
  studentBaseHref?: string;
};

const stateMeta: Record<
  string,
  { label: string; tone: "open" | "active" | "ready" | "earned" }
> = {
  introduced: { label: "Impact unlocked", tone: "open" },
  practising: { label: "Building proof", tone: "active" },
  understood: { label: "Ready to verify", tone: "ready" },
  mastered: { label: "Proven", tone: "earned" },
};

function studentRoute(base: string, tab: "learn" | "notes", noteId?: string) {
  if (base === "/learn") {
    if (tab === "learn") return "/learn/learn";
    return noteId ? `/learn/notes?note=${noteId}` : "/learn/notes";
  }

  const [pathname, existingQuery = ""] = base.split("?");
  const params = new URLSearchParams(existingQuery);
  params.set("tab", tab);
  if (noteId) params.set("note", noteId);
  return `${pathname}?${params.toString()}`;
}

export function StudentLearningMap({
  student,
  notes,
  progress,
  mode = "student",
  studentBaseHref = "/learn",
}: Props) {
  const ordered = [...notes].sort(
    (a, b) => new Date(a.class_date).getTime() - new Date(b.class_date).getTime(),
  );
  const mastered = ordered.filter((note) => note.learning_state === "mastered").length;
  const earnedAchievements = ordered.filter(
    (note) => note.learning_state === "mastered" && note.achievement_title,
  ).length;
  const currentIndex = ordered.findIndex((note) => note.learning_state !== "mastered");
  const current = ordered[currentIndex === -1 ? Math.max(ordered.length - 1, 0) : currentIndex];
  const actualXp = progress.reduce((sum, event) => sum + Math.max(0, event.points), 0);
  const firstName = student.full_name.split(" ")[0];

  return (
    <section className={styles.shell} aria-label={`${student.full_name} learning and achievement map`}>
      <header className={styles.hero}>
        <div>
          <span className={styles.kicker}>Orbit learning map</span>
          <h1>{firstName}&apos;s path is built around impact.</h1>
          <p>
            Lectures stay behind the system. You see what changed in your capability,
            what proof is needed, and what achievement unlocks next.
          </p>
        </div>
        <div className={styles.heroStats}>
          <span>
            <ShieldCheck aria-hidden="true" size={16} />
            {foundryLevelLabel(student.level)}
          </span>
          <span>
            <Trophy aria-hidden="true" size={16} />
            {earnedAchievements} earned
          </span>
          <span>
            <Sparkles aria-hidden="true" size={16} />
            {actualXp} XP
          </span>
        </div>
      </header>

      <div className={styles.loopStrip}>
        <span>Lecture</span>
        <b>→</b>
        <span>Impact</span>
        <b>→</b>
        <span>Proof</span>
        <b>→</b>
        <span>Achievement</span>
        <b>→</b>
        <span>Next move</span>
      </div>

      {ordered.length ? (
        <div className={styles.timeline}>
          {ordered.map((note, index) => {
            const meta = stateMeta[note.learning_state] ?? stateMeta.introduced;
            const earned = note.learning_state === "mastered";
            const impactTitle = note.impact_title ?? "A new capability is opening";
            const impactStatement =
              note.impact_statement ??
              note.progress_summary ??
              "Your teacher will define the practical impact of this learning step.";
            const isCurrent = note.id === current?.id;

            return (
              <article className={`${styles.node} ${isCurrent ? styles.currentNode : ""}`} key={note.id}>
                <div className={styles.rail} aria-hidden="true">
                  <span className={`${styles.dot} ${styles[meta.tone]}`}>
                    {earned ? <CheckCircle2 size={15} /> : index + 1}
                  </span>
                  {index < ordered.length - 1 ? <i /> : null}
                </div>

                <div className={styles.card}>
                  <div className={styles.cardTop}>
                    <div>
                      <small>Impact {String(index + 1).padStart(2, "0")}</small>
                      <h2>{impactTitle}</h2>
                    </div>
                    <span className={`${styles.state} ${styles[meta.tone]}`}>{meta.label}</span>
                  </div>

                  <p className={styles.impact}>{impactStatement}</p>

                  <div className={styles.achievement}>
                    <span className={styles.achievementIcon}>
                      {earned ? <Trophy size={20} /> : <LockKeyhole size={20} />}
                    </span>
                    <div>
                      <small>{earned ? "Achievement earned" : "Achievement to unlock"}</small>
                      <strong>{note.achievement_title ?? "Achievement not defined yet"}</strong>
                      {note.achievement_description ? <p>{note.achievement_description}</p> : null}
                    </div>
                    {note.xp_reward > 0 ? <b>+{note.xp_reward} XP</b> : null}
                  </div>

                  {note.evidence_requirement ? (
                    <div className={styles.proof}>
                      <span>
                        <BookOpen aria-hidden="true" size={16} />
                        Proof required
                      </span>
                      <p>{note.evidence_requirement}</p>
                    </div>
                  ) : null}

                  <div className={styles.cardFooter}>
                    <span>
                      <Clock3 aria-hidden="true" size={15} />
                      {formatFoundryDate(note.class_date, false)}
                    </span>
                    <div className={styles.actions}>
                      <Link className={styles.secondaryAction} href={studentRoute(studentBaseHref, "notes", note.id)}>
                        Read record
                      </Link>
                      {note.resource_url ? (
                        <a
                          className={styles.primaryAction}
                          href={note.resource_url}
                          rel="noreferrer"
                          target="_blank"
                        >
                          Open resource
                          <ArrowUpRight aria-hidden="true" size={15} />
                        </a>
                      ) : (
                        <Link className={styles.primaryAction} href={studentRoute(studentBaseHref, "learn")}>
                          Continue
                          <ArrowUpRight aria-hidden="true" size={15} />
                        </Link>
                      )}
                    </div>
                  </div>

                  {mode === "admin" ? (
                    <div className={styles.adminControls}>
                      <div>
                        <span>Admin controls</span>
                        <strong>{note.class_title_snapshot}</strong>
                      </div>
                      <nav aria-label={`Admin controls for ${note.class_title_snapshot}`}>
                        <Link href="/dashboard/foundry/classes">Lecture</Link>
                        <Link href="/dashboard/foundry/notes">Impact & notes</Link>
                        <Link href="/dashboard/foundry/progress">Verify proof</Link>
                      </nav>
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className={styles.empty}>
          <span><Sparkles aria-hidden="true" size={22} /></span>
          <div>
            <strong>Your first impact is waiting.</strong>
            <p>Once a lecture is completed, Orbit will place its impact and achievement here.</p>
          </div>
        </div>
      )}

      <footer className={styles.nextMove}>
        <div>
          <span>What&apos;s next?</span>
          <strong>{current?.next_step ?? student.next_action ?? "Wait for the next guided step."}</strong>
          <small>
            {mastered}/{ordered.length} impact steps proven · Orbit keeps this loop moving one action at a time.
          </small>
        </div>
        <Link className={styles.nextButton} href={studentRoute(studentBaseHref, "learn")}>
          Continue next move
          <ArrowUpRight aria-hidden="true" size={16} />
        </Link>
      </footer>
    </section>
  );
}
