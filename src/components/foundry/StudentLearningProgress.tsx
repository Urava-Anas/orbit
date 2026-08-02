import Link from "next/link";
import {
  ArrowUpRight,
  BookOpen,
  Brain,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  FileText,
  Gauge,
  History,
  Lightbulb,
  Rocket,
  Sparkles,
  Trophy,
} from "lucide-react";
import { formatFoundryDate } from "@/lib/foundry";
import styles from "./StudentLearningProgress.module.css";

export type StudentLearningNote = {
  id: string;
  class_title_snapshot: string;
  class_date: string;
  lesson_summary: string;
  key_concepts: string | null;
  student_notes: string;
  learning_state: string;
  understanding_level: number | null;
  student_progress_snapshot: number | null;
  progress_summary: string | null;
  support_note: string | null;
  next_step: string | null;
  resource_url: string | null;
};

type Props = {
  studentName: string;
  currentProgress: number;
  notes: StudentLearningNote[];
  selectedEntryId?: string;
  baseHref: string;
};

function clampProgress(value: number) {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function entryHref(baseHref: string, entryId: string) {
  return `${baseHref}${baseHref.includes("?") ? "&" : "?"}entry=${entryId}`;
}

function stateLabel(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function conceptList(value: string | null) {
  if (!value) return [];
  return value
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 24);
}

export function StudentLearningProgress({
  studentName,
  currentProgress,
  notes,
  selectedEntryId,
  baseHref,
}: Props) {
  const ordered = [...notes].sort(
    (left, right) =>
      new Date(right.class_date).getTime() - new Date(left.class_date).getTime(),
  );
  const chronological = [...ordered].reverse();
  const dayNumberById = new Map(
    chronological.map((note, index) => [note.id, index + 1]),
  );
  const current = ordered[0] ?? null;
  const selected =
    ordered.find((note) => note.id === selectedEntryId) ?? current;
  const overallProgress = clampProgress(currentProgress);

  if (!selected) {
    return (
      <section className={styles.empty}>
        <span>
          <History aria-hidden="true" size={26} />
        </span>
        <h1>Your learning journey will appear here</h1>
        <p>
          Class complete hone ke baad teacher notes aur progress save karega.
          Sab se naya day automatically main view mein nazar aayega.
        </p>
      </section>
    );
  }

  const selectedDay = dayNumberById.get(selected.id) ?? 1;
  const selectedProgress = clampProgress(
    selected.student_progress_snapshot ?? overallProgress,
  );
  const concepts = conceptList(selected.key_concepts);
  const isCurrent = selected.id === current?.id;

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.journeyCard}>
          <div className={styles.eyebrow}>
            <Sparkles aria-hidden="true" size={16} />
            Learning journey
          </div>
          <div className={styles.progressValue}>{overallProgress}%</div>
          <div
            aria-label={`${overallProgress}% current Foundry progress`}
            className={styles.progressTrack}
          >
            <span style={{ width: `${overallProgress}%` }} />
          </div>
          <div className={styles.progressCaption}>
            <span>Current Foundry progress</span>
            <strong>{ordered.length} learning day{ordered.length === 1 ? "" : "s"}</strong>
          </div>
        </div>

        <div className={styles.currentCard}>
          <div className={styles.currentIcon}>
            {isCurrent ? (
              <Trophy aria-hidden="true" size={24} />
            ) : (
              <History aria-hidden="true" size={24} />
            )}
          </div>
          <div>
            <span className={styles.currentLabel}>
              {isCurrent ? "Current learning day" : "Viewing previous day"}
            </span>
            <h1>Day {selectedDay} — {selected.class_title_snapshot}</h1>
            <p>
              {formatFoundryDate(selected.class_date)} · {stateLabel(selected.learning_state)}
            </p>
          </div>
          {isCurrent ? <span className={styles.currentBadge}>Latest</span> : null}
        </div>
      </section>

      <section className={styles.mainGrid}>
        <article className={`${styles.detailCard} ${styles.learnedCard}`}>
          <div className={styles.cardHeading}>
            <span className={styles.number}>1</span>
            <div>
              <small>Class summary</small>
              <h2>What we learned</h2>
            </div>
            <Lightbulb aria-hidden="true" size={21} />
          </div>
          <p>{selected.lesson_summary}</p>
        </article>

        <article className={`${styles.detailCard} ${styles.notesCard}`}>
          <div className={styles.cardHeading}>
            <span className={styles.number}>2</span>
            <div>
              <small>Revision memory</small>
              <h2>Saved notes</h2>
            </div>
            <FileText aria-hidden="true" size={21} />
          </div>
          <p>{selected.student_notes}</p>
        </article>

        <article className={`${styles.detailCard} ${styles.conceptsCard}`}>
          <div className={styles.cardHeading}>
            <span className={styles.number}>3</span>
            <div>
              <small>Important words</small>
              <h2>Key concepts</h2>
            </div>
            <BookOpen aria-hidden="true" size={21} />
          </div>
          {concepts.length ? (
            <div className={styles.chips}>
              {concepts.map((concept) => (
                <span key={concept}>{concept}</span>
              ))}
            </div>
          ) : (
            <p>No key concepts were recorded for this day.</p>
          )}
        </article>

        <article className={`${styles.detailCard} ${styles.progressCard}`}>
          <div className={styles.cardHeading}>
            <span className={styles.number}>4</span>
            <div>
              <small>Evidence so far</small>
              <h2>Learning progress</h2>
            </div>
            <Gauge aria-hidden="true" size={21} />
          </div>
          <p>
            {selected.progress_summary ??
              "Teacher will add a progress explanation after checking understanding."}
          </p>
          <div className={styles.metrics}>
            <div>
              <span>Understanding</span>
              <strong>
                {selected.understanding_level
                  ? `${selected.understanding_level}/5`
                  : "Not assessed yet"}
              </strong>
            </div>
            <div>
              <span>Day snapshot</span>
              <strong>{selectedProgress}%</strong>
            </div>
          </div>
          <div className={styles.smallTrack}>
            <span style={{ width: `${selectedProgress}%` }} />
          </div>
        </article>

        <article className={`${styles.detailCard} ${styles.supportCard}`}>
          <div className={styles.cardHeading}>
            <span className={styles.number}>5</span>
            <div>
              <small>Personal learning style</small>
              <h2>Best learning support</h2>
            </div>
            <Brain aria-hidden="true" size={21} />
          </div>
          <p>
            {selected.support_note ??
              "No special learning support was recorded for this day."}
          </p>
          {selected.support_note ? (
            <div className={styles.supportHint}>
              <CheckCircle2 aria-hidden="true" size={16} />
              Teaching preference detected and saved
            </div>
          ) : null}
        </article>

        <article className={`${styles.detailCard} ${styles.nextCard}`}>
          <div className={styles.cardHeading}>
            <span className={styles.number}>6</span>
            <div>
              <small>One clear action</small>
              <h2>Next step</h2>
            </div>
            <Rocket aria-hidden="true" size={21} />
          </div>
          <p>
            {selected.next_step ??
              "Teacher will add the next revision or practice step here."}
          </p>
          {selected.resource_url ? (
            <a
              className={styles.resourceButton}
              href={selected.resource_url}
              rel="noreferrer"
              target="_blank"
            >
              Open class resource
              <ArrowUpRight aria-hidden="true" size={16} />
            </a>
          ) : null}
        </article>
      </section>

      <section className={styles.historySection}>
        <div className={styles.historyHeading}>
          <div>
            <span className={styles.eyebrow}>
              <CalendarDays aria-hidden="true" size={16} />
              Learning timeline
            </span>
            <h2>Previous days</h2>
            <p>
              Sab se naya day automatically main view mein hota hai. Kisi purane
              day par click karke uski complete detail dobara dekhein.
            </p>
          </div>
          <History aria-hidden="true" size={26} />
        </div>

        <div className={styles.timeline}>
          {ordered.map((note) => {
            const day = dayNumberById.get(note.id) ?? 1;
            const noteProgress = clampProgress(
              note.student_progress_snapshot ?? overallProgress,
            );
            const active = note.id === selected.id;
            const latest = note.id === current?.id;
            return (
              <Link
                className={`${styles.timelineItem} ${active ? styles.active : ""}`}
                href={entryHref(baseHref, note.id)}
                key={note.id}
                scroll={false}
              >
                <span className={styles.dayBubble}>Day {day}</span>
                <div className={styles.timelineCopy}>
                  <div>
                    <strong>{note.class_title_snapshot}</strong>
                    {latest ? <span>Current</span> : null}
                  </div>
                  <small>
                    {formatFoundryDate(note.class_date)} · {stateLabel(note.learning_state)}
                  </small>
                  <div className={styles.timelineTrack}>
                    <span style={{ width: `${noteProgress}%` }} />
                  </div>
                </div>
                <b>{noteProgress}%</b>
                <ChevronRight aria-hidden="true" size={18} />
              </Link>
            );
          })}
        </div>
      </section>

      <div className={styles.encouragement}>
        <Sparkles aria-hidden="true" size={18} />
        <span>
          {studentName}, small steps stay visible here—so every class becomes
          part of a clear learning journey.
        </span>
      </div>
    </div>
  );
}
