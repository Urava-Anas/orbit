import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  FileCheck2,
  History,
  NotebookTabs,
  Sparkles,
  Target,
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
  notes: StudentLearningNote[];
  notesHref: string;
};

const stages = [
  "introduced",
  "practising",
  "understood",
  "applied",
  "mastered",
] as const;

function stateLabel(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function noteHref(baseHref: string, noteId: string) {
  const separator = baseHref.includes("?") ? "&" : "?";
  return `${baseHref}${separator}note=${noteId}#note-${noteId}`;
}

function evidenceFor(note: StudentLearningNote) {
  if (note.progress_summary?.trim()) return note.progress_summary;
  if (note.understanding_level) {
    return `Understanding check recorded at ${note.understanding_level}/5.`;
  }
  if (note.resource_url) {
    return "Class completed and its resource is saved. Practical understanding is not assessed yet.";
  }
  return "Class completed. Practical evidence has not been recorded yet.";
}

function DayDetails({
  day,
  note,
  current = false,
}: {
  day: number;
  note: StudentLearningNote;
  current?: boolean;
}) {
  return (
    <div className={styles.details}>
      <div>
        <span>Day</span>
        <strong>Day {day}</strong>
      </div>
      <div>
        <span>Topic</span>
        <strong>{note.class_title_snapshot}</strong>
      </div>
      <div>
        <span>Understanding</span>
        <strong className={styles.stageValue}>
          {stateLabel(note.learning_state)}
        </strong>
      </div>
      <div>
        <span>Evidence</span>
        <p>{evidenceFor(note)}</p>
      </div>
      <div>
        <span>Next step</span>
        <p>
          {note.next_step ??
            "Teacher will add one clear revision, practice, or assessment step."}
        </p>
      </div>
      {current ? (
        <span className={styles.currentSignal}>
          <Sparkles aria-hidden="true" size={14} />
          Current
        </span>
      ) : null}
    </div>
  );
}

export function StudentLearningProgress({
  studentName,
  notes,
  notesHref,
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
  const previous = ordered.slice(1);

  if (!current) {
    return (
      <section className={styles.empty}>
        <span>
          <History aria-hidden="true" size={26} />
        </span>
        <h1>Your learning journey will appear here</h1>
        <p>
          Class complete hone ke baad teacher stage, evidence aur next step save
          karega. Sab se naya day automatically current view ban jayega.
        </p>
      </section>
    );
  }

  const currentDay = dayNumberById.get(current.id) ?? 1;
  const currentStageIndex = Math.max(
    0,
    stages.indexOf(current.learning_state as (typeof stages)[number]),
  );

  return (
    <div className={styles.page}>
      <section className={styles.header}>
        <div>
          <span className={styles.eyebrow}>
            <Sparkles aria-hidden="true" size={16} />
            Simple learning journey
          </span>
          <h1>{studentName}&apos;s progress</h1>
          <p>
            Progress percentage ki jagah har class ka honest learning stage,
            evidence aur next action dikhaya jata hai.
          </p>
        </div>
        <span className={styles.headerIcon}>
          <Target aria-hidden="true" size={28} />
        </span>
      </section>

      <section className={styles.stagePath} aria-label="Learning stages">
        {stages.map((stage, index) => (
          <div
            className={`${styles.stageStep} ${
              index < currentStageIndex
                ? styles.complete
                : index === currentStageIndex
                  ? styles.active
                  : ""
            }`}
            key={stage}
          >
            <span>
              {index < currentStageIndex ? (
                <CheckCircle2 aria-hidden="true" size={16} />
              ) : (
                index + 1
              )}
            </span>
            <strong>{stateLabel(stage)}</strong>
          </div>
        ))}
      </section>

      <section className={styles.currentCard}>
        <div className={styles.currentHead}>
          <div>
            <span className={styles.eyebrow}>
              <CalendarDays aria-hidden="true" size={16} />
              Current learning day
            </span>
            <h2>
              Day {currentDay} · {current.class_title_snapshot}
            </h2>
            <p>{formatFoundryDate(current.class_date)}</p>
          </div>
          <span className={styles.currentBadge}>
            {stateLabel(current.learning_state)}
          </span>
        </div>

        <DayDetails current day={currentDay} note={current} />

        <Link className={styles.notesButton} href={noteHref(notesHref, current.id)}>
          <NotebookTabs aria-hidden="true" size={17} />
          Open detailed Notes record
          <ArrowRight aria-hidden="true" size={16} />
        </Link>
      </section>

      <section className={styles.historySection}>
        <div className={styles.historyHead}>
          <div>
            <span className={styles.eyebrow}>
              <History aria-hidden="true" size={16} />
              Previous days
            </span>
            <h2>Learning history</h2>
            <p>
              Har day sirf topic, understanding, evidence aur next step dikhata
              hai. Complete explanation Notes mein rehti hai.
            </p>
          </div>
          <FileCheck2 aria-hidden="true" size={25} />
        </div>

        {previous.length ? (
          <div className={styles.historyList}>
            {previous.map((note) => {
              const day = dayNumberById.get(note.id) ?? 1;
              return (
                <article className={styles.historyCard} key={note.id}>
                  <div className={styles.historyTitle}>
                    <span>Day {day}</span>
                    <div>
                      <strong>{note.class_title_snapshot}</strong>
                      <small>{formatFoundryDate(note.class_date)}</small>
                    </div>
                    <b>{stateLabel(note.learning_state)}</b>
                  </div>

                  <DayDetails day={day} note={note} />

                  <Link
                    className={styles.historyLink}
                    href={noteHref(notesHref, note.id)}
                  >
                    Open this day in Notes
                    <ArrowRight aria-hidden="true" size={15} />
                  </Link>
                </article>
              );
            })}
          </div>
        ) : (
          <div className={styles.noHistory}>
            Day 1 is the current record. Previous days will appear here after
            future classes are saved.
          </div>
        )}
      </section>
    </div>
  );
}
