import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Brain,
  Check,
  ChevronDown,
  ClipboardCheck,
  FileText,
  History,
  Lightbulb,
  NotebookTabs,
  Rocket,
  Sparkles,
} from "lucide-react";
import { formatFoundryDate } from "@/lib/foundry";
import styles from "./StudentClassNotes.module.css";

export type StudentClassNote = {
  id: string;
  class_title_snapshot: string;
  class_date: string;
  lesson_summary: string;
  key_concepts: string | null;
  student_notes: string;
  learning_state: string;
  understanding_level: number | null;
  student_progress_snapshot?: number | null;
  progress_summary: string | null;
  support_note: string | null;
  next_step: string | null;
  resource_url: string | null;
  updated_at?: string;
};

type Props = {
  notes: StudentClassNote[];
  studentName: string;
  journeyHref: string;
  selectedNoteId?: string;
  preview?: boolean;
};

const stages = [
  "introduced",
  "practising",
  "understood",
  "applied",
  "mastered",
] as const;

function stageLabel(value: string | undefined) {
  if (!value) return "Not recorded";
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

function understandingLabel(value: number | null) {
  const labels: Record<number, string> = {
    1: "Needs full reteaching",
    2: "Early understanding",
    3: "Basic understanding",
    4: "Strong understanding",
    5: "Can teach it back",
  };
  return value ? labels[value] ?? `${value}/5` : "Not assessed yet";
}

export function StudentClassNotes({
  notes,
  studentName,
  journeyHref,
  selectedNoteId,
  preview = false,
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
  const currentStageIndex = current
    ? Math.max(
        0,
        stages.indexOf(current.learning_state as (typeof stages)[number]),
      )
    : 0;

  if (!current) {
    return (
      <section className={styles.empty}>
        <span>
          <NotebookTabs aria-hidden="true" size={28} />
        </span>
        <h1>Your class notes will appear here</h1>
        <p>
          Teacher class complete karne ke baad explanation, evidence, learning
          support aur next step yahan save karega.
        </p>
      </section>
    );
  }

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroTop}>
          <div className={styles.heroCopy}>
            <span className={styles.eyebrow}>
              <Sparkles aria-hidden="true" size={15} />
              Learning memory
            </span>
            <h1>{preview ? `${studentName}'s class notes` : "Your class notes"}</h1>
            <p>
              Har class ko simple sections mein save kiya gaya hai—kya seekha,
              kya samjha, kis support ki zarurat hai, aur agla clear step kya hai.
            </p>
          </div>

          <Link className={styles.journeyButton} href={journeyHref}>
            View learning journey
            <ArrowRight aria-hidden="true" size={17} />
          </Link>
        </div>

        <div className={styles.stageHeader}>
          <div>
            <small>Current learning stage</small>
            <strong>{stageLabel(current.learning_state)}</strong>
          </div>
          <span>{ordered.length} class record{ordered.length === 1 ? "" : "s"}</span>
        </div>

        <div className={styles.stageRail} aria-label="Learning stages">
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
                  <Check aria-hidden="true" size={14} />
                ) : (
                  index + 1
                )}
              </span>
              <strong>{stageLabel(stage)}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.recordsSection}>
        <div className={styles.recordsHead}>
          <div>
            <span className={styles.eyebrow}>
              <History aria-hidden="true" size={15} />
              Previous classes
            </span>
            <h2>Detailed learning records</h2>
            <p>
              Latest class khuli hui hai. Kisi purani class par click karke uski
              complete notes dobara dekhein.
            </p>
          </div>
          <NotebookTabs aria-hidden="true" size={27} />
        </div>

        <div className={styles.recordsList}>
          {ordered.map((note, index) => {
            const day = dayNumberById.get(note.id) ?? 1;
            const latest = index === 0;
            const selected = note.id === selectedNoteId;
            const concepts = conceptList(note.key_concepts);

            return (
              <details
                className={`${styles.record} ${latest ? styles.currentRecord : ""}`}
                id={`note-${note.id}`}
                key={note.id}
                open={latest || selected}
              >
                <summary className={styles.recordSummary}>
                  <div className={styles.summaryIdentity}>
                    <span className={styles.dayBadge}>Day {day}</span>
                    <div>
                      <small>{formatFoundryDate(note.class_date)}</small>
                      <h3>{note.class_title_snapshot}</h3>
                    </div>
                  </div>

                  <div className={styles.summaryStatus}>
                    {latest ? <span className={styles.latestBadge}>Latest</span> : null}
                    <span className={styles.stageBadge}>
                      {stageLabel(note.learning_state)}
                    </span>
                    <ChevronDown aria-hidden="true" size={19} />
                  </div>
                </summary>

                <div className={styles.recordBody}>
                  <div className={styles.primaryGrid}>
                    <article className={`${styles.contentCard} ${styles.learnedCard}`}>
                      <div className={styles.cardTitle}>
                        <span>
                          <BookOpen aria-hidden="true" size={19} />
                        </span>
                        <div>
                          <small>Class summary</small>
                          <h4>What we learned</h4>
                        </div>
                      </div>
                      <p>{note.lesson_summary}</p>
                    </article>

                    <article className={`${styles.contentCard} ${styles.notesCard}`}>
                      <div className={styles.cardTitle}>
                        <span>
                          <FileText aria-hidden="true" size={19} />
                        </span>
                        <div>
                          <small>Revision memory</small>
                          <h4>Saved notes</h4>
                        </div>
                      </div>
                      <p>{note.student_notes}</p>
                    </article>
                  </div>

                  {concepts.length ? (
                    <article className={`${styles.contentCard} ${styles.conceptsCard}`}>
                      <div className={styles.cardTitle}>
                        <span>
                          <Lightbulb aria-hidden="true" size={19} />
                        </span>
                        <div>
                          <small>Important words</small>
                          <h4>Key concepts</h4>
                        </div>
                      </div>
                      <div className={styles.chips}>
                        {concepts.map((concept) => (
                          <span key={concept}>{concept}</span>
                        ))}
                      </div>
                    </article>
                  ) : null}

                  <div className={styles.insightGrid}>
                    <article className={`${styles.contentCard} ${styles.evidenceCard}`}>
                      <div className={styles.cardTitle}>
                        <span>
                          <ClipboardCheck aria-hidden="true" size={19} />
                        </span>
                        <div>
                          <small>Teacher check</small>
                          <h4>Evidence & understanding</h4>
                        </div>
                      </div>

                      <div className={styles.metricRow}>
                        <div>
                          <span>Stage</span>
                          <strong>{stageLabel(note.learning_state)}</strong>
                        </div>
                        <div>
                          <span>Understanding</span>
                          <strong>{understandingLabel(note.understanding_level)}</strong>
                        </div>
                      </div>

                      <p>
                        {note.progress_summary ??
                          "Teacher will add evidence after checking revision or practical application."}
                      </p>
                    </article>

                    <article className={`${styles.contentCard} ${styles.supportCard}`}>
                      <div className={styles.cardTitle}>
                        <span>
                          <Brain aria-hidden="true" size={19} />
                        </span>
                        <div>
                          <small>Personal learning style</small>
                          <h4>Best learning support</h4>
                        </div>
                      </div>
                      <p>
                        {note.support_note ??
                          "No special learning support was recorded for this class."}
                      </p>
                    </article>

                    <article className={`${styles.contentCard} ${styles.nextCard}`}>
                      <div className={styles.cardTitle}>
                        <span>
                          <Rocket aria-hidden="true" size={19} />
                        </span>
                        <div>
                          <small>One clear action</small>
                          <h4>Next step</h4>
                        </div>
                      </div>
                      <p>
                        {note.next_step ??
                          "Teacher will add one revision, practice, or assessment step."}
                      </p>

                      {note.resource_url ? (
                        <a
                          className={styles.resourceButton}
                          href={note.resource_url}
                          rel="noreferrer"
                          target="_blank"
                        >
                          Open class resource
                          <ArrowUpRight aria-hidden="true" size={16} />
                        </a>
                      ) : null}
                    </article>
                  </div>
                </div>
              </details>
            );
          })}
        </div>
      </section>

      <div className={styles.encouragement}>
        <Sparkles aria-hidden="true" size={17} />
        <span>
          Deep understanding takes time. Clear notes and one next step keep the
          journey moving.
        </span>
      </div>
    </div>
  );
}
