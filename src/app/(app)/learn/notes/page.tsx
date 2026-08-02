import type { Metadata } from "next";
import {
  ArrowUpRight,
  BookOpen,
  Brain,
  FileText,
  Gauge,
  History,
  Lightbulb,
} from "lucide-react";
import {
  EmptyFoundryState,
  FoundryProgressBar,
} from "@/components/foundry/FoundryUI";
import { requireStudentAccess } from "@/lib/access";
import { formatFoundryDate } from "@/lib/foundry";

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

export default async function StudentClassNotesPage() {
  const { supabase, workspace, studentId, user } = await requireStudentAccess();

  const [studentResult, notesResult] = await Promise.all([
    supabase
      .from("foundry_students")
      .select("id, full_name, progress_percent")
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

  return (
    <div className="student-portal-page">
      <section className="student-page-head">
        <div>
          <span className="student-kicker">Your learning memory</span>
          <h1>Previous class notes</h1>
          <p>
            Har class ki explanation, important concepts, learning progress,
            resource aur next step yahan permanently save rahega.
          </p>
        </div>
        <span className="student-page-head-icon">
          <History aria-hidden="true" size={28} />
        </span>
      </section>

      {student ? (
        <section className="student-progress-summary">
          <div>
            <span>Current Foundry progress</span>
            <strong>{student.progress_percent}%</strong>
          </div>
          <FoundryProgressBar value={student.progress_percent} />
        </section>
      ) : null}

      {notes.length ? (
        <div className="student-learning-list">
          {notes.map((note) => (
            <article className="student-learning-card" key={note.id}>
              <div className="student-learning-card-head">
                <div>
                  <span>{formatFoundryDate(note.class_date)}</span>
                  <h2>{note.class_title_snapshot}</h2>
                </div>
                <span className="student-learning-state">
                  {note.learning_state.replaceAll("_", " ")}
                </span>
              </div>

              <div className="student-learning-grid">
                <section>
                  <div className="student-learning-label">
                    <BookOpen aria-hidden="true" size={17} />
                    What this class covered
                  </div>
                  <p>{note.lesson_summary}</p>
                </section>

                <section>
                  <div className="student-learning-label">
                    <FileText aria-hidden="true" size={17} />
                    Your saved notes
                  </div>
                  <p>{note.student_notes}</p>
                </section>

                {note.key_concepts ? (
                  <section>
                    <div className="student-learning-label">
                      <Lightbulb aria-hidden="true" size={17} />
                      Key concepts
                    </div>
                    <p>{note.key_concepts}</p>
                  </section>
                ) : null}

                {note.progress_summary ? (
                  <section>
                    <div className="student-learning-label">
                      <Gauge aria-hidden="true" size={17} />
                      Learning progress
                    </div>
                    <p>{note.progress_summary}</p>
                  </section>
                ) : null}

                {note.support_note ? (
                  <section>
                    <div className="student-learning-label">
                      <Brain aria-hidden="true" size={17} />
                      Best way to learn this
                    </div>
                    <p>{note.support_note}</p>
                  </section>
                ) : null}
              </div>

              <div className="student-learning-progress-row">
                <div>
                  <span>Understanding</span>
                  <strong>
                    {note.understanding_level
                      ? `${note.understanding_level}/5`
                      : "Not assessed yet"}
                  </strong>
                </div>
                <div>
                  <span>Progress snapshot</span>
                  <strong>
                    {note.student_progress_snapshot !== null
                      ? `${note.student_progress_snapshot}%`
                      : "Not recorded"}
                  </strong>
                </div>
              </div>

              {note.student_progress_snapshot !== null ? (
                <FoundryProgressBar value={note.student_progress_snapshot} />
              ) : null}

              {note.next_step ? (
                <div className="student-next-step">
                  <strong>Next step</strong>
                  <p>{note.next_step}</p>
                </div>
              ) : null}

              {note.resource_url ? (
                <a
                  className="student-primary-action"
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
          detail="Teacher class complete karne ke baad notes, resource aur next step yahan save karega."
        />
      )}
    </div>
  );
}
