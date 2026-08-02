import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowUpRight,
  BookOpen,
  Brain,
  FileText,
  Gauge,
  History,
  Sparkles,
} from "lucide-react";
import { FoundryActionButton } from "@/components/foundry/FoundryActionButton";
import {
  EmptyFoundryState,
  FoundryNotice,
  FoundryProgressBar,
} from "@/components/foundry/FoundryUI";
import {
  formatFoundryDate,
  requireFounderFoundry,
} from "@/lib/foundry";
import { saveClassLearningNote } from "./actions";

export const metadata: Metadata = {
  title: "Foundry Class Notes",
  robots: { index: false, follow: false },
};

type Props = {
  searchParams: Promise<{
    studentId?: string;
    classId?: string;
    notice?: string;
    error?: string;
  }>;
};

type Student = {
  id: string;
  foundry_id: string;
  full_name: string;
  progress_percent: number;
};

type FoundryClass = {
  id: string;
  title: string;
  starts_at: string;
  status: string;
};

type LearningNote = {
  id: string;
  student_id: string;
  class_id: string;
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

export default async function FoundryClassNotesPage({ searchParams }: Props) {
  const query = await searchParams;
  const { supabase, workspace } = await requireFounderFoundry();

  const [studentsResult, classesResult, notesResult] = await Promise.all([
    supabase
      .from("foundry_students")
      .select("id, foundry_id, full_name, progress_percent")
      .eq("workspace_id", workspace.id)
      .not("lifecycle_status", "in", '("inactive","graduated","rejected")')
      .order("foundry_id"),
    supabase
      .from("foundry_classes")
      .select("id, title, starts_at, status")
      .eq("workspace_id", workspace.id)
      .eq("status", "completed")
      .order("starts_at", { ascending: false }),
    supabase
      .from("foundry_class_learning_notes")
      .select(
        "id, student_id, class_id, class_title_snapshot, class_date, lesson_summary, key_concepts, student_notes, learning_state, understanding_level, student_progress_snapshot, progress_summary, support_note, next_step, resource_url, updated_at",
      )
      .eq("workspace_id", workspace.id)
      .order("class_date", { ascending: false }),
  ]);

  const students = (studentsResult.data ?? []) as Student[];
  const classes = (classesResult.data ?? []) as FoundryClass[];
  const notes = (notesResult.data ?? []) as LearningNote[];
  const studentsById = new Map(students.map((student) => [student.id, student]));

  const editingNote = notes.find(
    (note) =>
      note.student_id === query.studentId && note.class_id === query.classId,
  );
  const selectedStudent =
    students.find((student) => student.id === query.studentId) ?? students[0];
  const selectedClass =
    classes.find((item) => item.id === query.classId) ?? classes[0];

  return (
    <div className="foundry-page">
      <FoundryNotice error={query.error} notice={query.notice} />

      <section className="foundry-page-head">
        <div>
          <span className="foundry-kicker">Learning memory</span>
          <h1>Class notes & progress</h1>
          <p>
            Har completed class ka permanent record: kya parhaya, student ne kya
            samjha, kis support ki zarurat hai, resource kahan hai, aur agla step
            kya hoga.
          </p>
        </div>
        <div className="foundry-page-head-icon">
          <History aria-hidden="true" size={28} />
        </div>
      </section>

      <section className="student-record-grid">
        <article className="foundry-card">
          <div className="foundry-card-head">
            <div>
              <span className="foundry-card-eyebrow">Teacher record</span>
              <h2>{editingNote ? "Update class note" : "Save previous class"}</h2>
            </div>
            <FileText aria-hidden="true" size={20} />
          </div>

          {students.length && classes.length ? (
            <form action={saveClassLearningNote} className="foundry-form">
              <div className="foundry-form-grid">
                <label>
                  Student
                  <select
                    defaultValue={editingNote?.student_id ?? selectedStudent?.id}
                    name="studentId"
                    required
                  >
                    {students.map((student) => (
                      <option key={student.id} value={student.id}>
                        {student.foundry_id} · {student.full_name}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Completed class
                  <select
                    defaultValue={editingNote?.class_id ?? selectedClass?.id}
                    name="classId"
                    required
                  >
                    {classes.map((item) => (
                      <option key={item.id} value={item.id}>
                        {formatFoundryDate(item.starts_at)} · {item.title}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="is-wide">
                  Lesson summary
                  <textarea
                    defaultValue={editingNote?.lesson_summary ?? ""}
                    name="lessonSummary"
                    placeholder="Class ka main purpose aur overall explanation."
                    required
                    rows={3}
                  />
                </label>

                <label className="is-wide">
                  Key concepts covered
                  <textarea
                    defaultValue={editingNote?.key_concepts ?? ""}
                    name="keyConcepts"
                    placeholder="Important terms, methods, tools or examples."
                    rows={3}
                  />
                </label>

                <label className="is-wide">
                  Notes for the student
                  <textarea
                    defaultValue={editingNote?.student_notes ?? ""}
                    name="studentNotes"
                    placeholder="Simple notes the student can revisit after class."
                    required
                    rows={5}
                  />
                </label>

                <label>
                  Learning stage
                  <select
                    defaultValue={editingNote?.learning_state ?? "introduced"}
                    name="learningState"
                  >
                    <option value="introduced">Introduced</option>
                    <option value="practising">Practising</option>
                    <option value="understood">Understood</option>
                    <option value="mastered">Mastered</option>
                  </select>
                </label>

                <label>
                  Understanding level
                  <select
                    defaultValue={editingNote?.understanding_level ?? ""}
                    name="understandingLevel"
                  >
                    <option value="">Not assessed</option>
                    <option value="1">1 — needs full reteaching</option>
                    <option value="2">2 — early understanding</option>
                    <option value="3">3 — basic understanding</option>
                    <option value="4">4 — strong understanding</option>
                    <option value="5">5 — can teach it back</option>
                  </select>
                </label>

                <label>
                  Learning progress %
                  <input
                    defaultValue={
                      editingNote?.student_progress_snapshot ??
                      selectedStudent?.progress_percent ??
                      ""
                    }
                    max="100"
                    min="0"
                    name="progressPercent"
                    type="number"
                  />
                </label>

                <label>
                  Resource link
                  <input
                    defaultValue={editingNote?.resource_url ?? ""}
                    name="resourceUrl"
                    placeholder="https://..."
                    type="url"
                  />
                </label>

                <label className="is-wide">
                  Progress summary
                  <textarea
                    defaultValue={editingNote?.progress_summary ?? ""}
                    name="progressSummary"
                    placeholder="What improved, what is still untested, and what evidence exists."
                    rows={3}
                  />
                </label>

                <label className="is-wide">
                  Learning support note
                  <textarea
                    defaultValue={editingNote?.support_note ?? ""}
                    name="supportNote"
                    placeholder="Pacing, language, examples, repetition or device support needed."
                    rows={3}
                  />
                </label>

                <label className="is-wide">
                  Next learning step
                  <textarea
                    defaultValue={editingNote?.next_step ?? ""}
                    name="nextStep"
                    placeholder="One clear revision, practice or assessment step."
                    rows={3}
                  />
                </label>
              </div>

              <FoundryActionButton
                className="foundry-button foundry-button-dark"
                pendingLabel="Saving class history…"
              >
                {editingNote ? "Update class history" : "Save class history"}
              </FoundryActionButton>
            </form>
          ) : (
            <EmptyFoundryState
              title="A completed class and active student are required"
              detail="Class complete mark karne ke baad uski notes aur progress yahan save hogi."
              href="/dashboard/foundry/classes"
              action="Open classes"
            />
          )}
        </article>

        <aside className="foundry-stack">
          <article className="foundry-card">
            <div className="foundry-card-head">
              <h2>How to use it</h2>
              <Brain aria-hidden="true" size={19} />
            </div>
            <div className="foundry-data-list">
              <div className="foundry-data-row is-compact">
                <BookOpen aria-hidden="true" size={17} />
                <div>
                  <strong>After every class</strong>
                  <p>Save the explanation, notes and resource before teaching the next topic.</p>
                </div>
              </div>
              <div className="foundry-data-row is-compact">
                <Gauge aria-hidden="true" size={17} />
                <div>
                  <strong>Do not guess mastery</strong>
                  <p>Leave understanding unassessed until the student explains or applies it.</p>
                </div>
              </div>
              <div className="foundry-data-row is-compact">
                <Sparkles aria-hidden="true" size={17} />
                <div>
                  <strong>One next step</strong>
                  <p>Every record should end with one clear revision or practice action.</p>
                </div>
              </div>
            </div>
          </article>
        </aside>
      </section>

      <section className="foundry-card">
        <div className="foundry-card-head">
          <div>
            <span className="foundry-card-eyebrow">Previous classes</span>
            <h2>Learning history</h2>
          </div>
          <span>{notes.length} records</span>
        </div>

        {notes.length ? (
          <div className="foundry-data-list">
            {notes.map((note) => {
              const student = studentsById.get(note.student_id);
              return (
                <article className="foundry-data-row" key={note.id}>
                  <span className="foundry-avatar">
                    {(student?.full_name ?? "S")
                      .split(" ")
                      .slice(0, 2)
                      .map((part) => part[0])
                      .join("")
                      .toUpperCase()}
                  </span>
                  <div>
                    <strong>
                      {student?.full_name ?? "Student"} · {note.class_title_snapshot}
                    </strong>
                    <p>
                      {formatFoundryDate(note.class_date)} ·{" "}
                      {note.learning_state.replaceAll("_", " ")}
                      {note.understanding_level
                        ? ` · Understanding ${note.understanding_level}/5`
                        : " · Understanding not assessed"}
                    </p>
                    <p>{note.lesson_summary}</p>
                    {note.next_step ? <p>Next: {note.next_step}</p> : null}
                    <FoundryProgressBar
                      compact
                      value={note.student_progress_snapshot ?? 0}
                    />
                  </div>
                  <div className="foundry-row-actions">
                    {note.resource_url ? (
                      <a
                        className="foundry-button foundry-button-quiet"
                        href={note.resource_url}
                        rel="noreferrer"
                        target="_blank"
                      >
                        Resource
                        <ArrowUpRight aria-hidden="true" size={14} />
                      </a>
                    ) : null}
                    <Link
                      className="foundry-button"
                      href={`/dashboard/foundry/notes?studentId=${note.student_id}&classId=${note.class_id}`}
                    >
                      Edit
                    </Link>
                    <Link
                      className="foundry-button foundry-button-quiet"
                      href={`/dashboard/foundry/students/${note.student_id}`}
                    >
                      Student
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <EmptyFoundryState
            title="No previous-class notes yet"
            detail="Complete a class, then save its explanation, progress and next step here."
          />
        )}
      </section>
    </div>
  );
}
