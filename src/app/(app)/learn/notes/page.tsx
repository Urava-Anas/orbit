import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Brain,
  FileText,
  Gauge,
  History,
  Lightbulb,
} from "lucide-react";
import { EmptyFoundryState } from "@/components/foundry/FoundryUI";
import { requireStudentAccess } from "@/lib/access";
import { formatFoundryDate } from "@/lib/foundry";
import styles from "./notes.module.css";

export const metadata: Metadata = {
  title: "My Class Notes",
  robots: { index: false, follow: false },
};

type LearningNote = {
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
  updated_at: string;
};

function stageLabel(value: string | undefined) {
  if (!value) return "Not recorded";
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default async function StudentClassNotesPage() {
  const { supabase, workspace, studentId, user } = await requireStudentAccess();

  const [studentResult, notesResult] = await Promise.all([
    supabase
      .from("foundry_students")
      .select("id, full_name")
      .eq("workspace_id", workspace.id)
      .eq("id", studentId)
      .eq("auth_user_id", user.id)
      .maybeSingle(),
    supabase
      .from("foundry_class_learning_notes")
      .select(
        "id, class_title_snapshot, class_date, lesson_summary, key_concepts, student_notes, learning_state, understanding_level, student_progress_snapshot, progress_summary, support_note, next_step, resource_url, updated_at",
      )
      .eq("workspace_id", workspace.id)
      .eq("student_id", studentId)
      .order("class_date", { ascending: false }),
  ]);

  const student = studentResult.data;
  const notes = (notesResult.data ?? []) as LearningNote[];
  const currentStage = stageLabel(notes[0]?.learning_state);

  return (
    <div className="student-portal-page">
      <section className="student-page-head">
        <div>
          <span className="student-kicker">Your learning memory</span>
          <h1>Previous class notes</h1>
          <p>
            Har class ki detailed explanation, important concepts, learning
            evidence, resource aur next step yahan permanently save rahega.
          </p>
        </div>
        <span className="student-page-head-icon">
          <History aria-hidden="true" size={28} />
        </span>
      </section>

      {student ? (
        <Link className="student-progress-summary" href="/learn/progress">
          <div>
            <span>Current learning stage · View journey</span>
            <strong>{currentStage}</strong>
          </div>
          <ArrowRight aria-hidden="true" size={18} />
        </Link>
      ) : null}

      {notes.length ? (
        <div className={styles.list}>
          {notes.map((note) => (
            <article
              className={styles.card}
              id={`note-${note.id}`}
              key={note.id}
            >
              <div className={styles.header}>
                <div>
                  <span>{formatFoundryDate(note.class_date)}</span>
                  <h2>{note.class_title_snapshot}</h2>
                </div>
                <span className={styles.state}>
                  {stageLabel(note.learning_state)}
                </span>
              </div>

              <div className={styles.grid}>
                <section>
                  <div className={styles.label}>
                    <BookOpen aria-hidden="true" size={17} />
                    What this class covered
                  </div>
                  <p>{note.lesson_summary}</p>
                </section>

                <section>
                  <div className={styles.label}>
                    <FileText aria-hidden="true" size={17} />
                    Your saved notes
                  </div>
                  <p>{note.student_notes}</p>
                </section>

                {note.key_concepts ? (
                  <section>
                    <div className={styles.label}>
                      <Lightbulb aria-hidden="true" size={17} />
                      Key concepts
                    </div>
                    <p>{note.key_concepts}</p>
                  </section>
                ) : null}

                {note.progress_summary ? (
                  <section>
                    <div className={styles.label}>
                      <Gauge aria-hidden="true" size={17} />
                      Evidence and learning progress
                    </div>
                    <p>{note.progress_summary}</p>
                  </section>
                ) : null}

                {note.support_note ? (
                  <section>
                    <div className={styles.label}>
                      <Brain aria-hidden="true" size={17} />
                      Best way to learn this
                    </div>
                    <p>{note.support_note}</p>
                  </section>
                ) : null}
              </div>

              <div className={styles.metrics}>
                <div>
                  <span>Learning stage</span>
                  <strong>{stageLabel(note.learning_state)}</strong>
                </div>
                <div>
                  <span>Understanding check</span>
                  <strong>
                    {note.understanding_level
                      ? `${note.understanding_level}/5`
                      : "Not assessed yet"}
                  </strong>
                </div>
              </div>

              {note.next_step ? (
                <div className={styles.nextStep}>
                  <strong>Next step</strong>
                  <p>{note.next_step}</p>
                </div>
              ) : null}

              {note.resource_url ? (
                <a
                  className={styles.action}
                  href={note.resource_url}
                  rel="noreferrer"
                  target="_blank"
                >
                  Open class resource
                  <ArrowUpRight aria-hidden="true" size={16} />
                </a>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <EmptyFoundryState
          title="No class notes yet"
          detail="Teacher class complete karne ke baad notes, evidence aur next step yahan save karega."
        />
      )}
    </div>
  );
}
