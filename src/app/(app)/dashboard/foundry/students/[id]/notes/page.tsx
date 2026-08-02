import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
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
  HealthBadge,
} from "@/components/foundry/FoundryUI";
import {
  formatFoundryDate,
  foundryDepartmentLabel,
  foundryLevelLabel,
  requireFounderFoundry,
} from "@/lib/foundry";

export const metadata: Metadata = {
  title: "Student Notes Preview",
  robots: { index: false, follow: false },
};

type Props = {
  params: Promise<{ id: string }>;
};

type Student = {
  id: string;
  foundry_id: string;
  full_name: string;
  department: string;
  level: string;
  health_status: "green" | "yellow" | "red" | "gold";
  progress_percent: number;
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
};

const previewTabs = [
  { label: "Today", tab: "today" },
  { label: "Learn", tab: "learn" },
  { label: "Submit", tab: "submit" },
  { label: "Progress", tab: "progress" },
  { label: "Profile", tab: "profile" },
] as const;

export default async function FounderStudentNotesPreviewPage({ params }: Props) {
  const { id } = await params;
  const { supabase, workspace } = await requireFounderFoundry();

  const [studentResult, notesResult] = await Promise.all([
    supabase
      .from("foundry_students")
      .select(
        "id, foundry_id, full_name, department, level, health_status, progress_percent",
      )
      .eq("workspace_id", workspace.id)
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("foundry_class_learning_notes")
      .select(
        "id, class_title_snapshot, class_date, lesson_summary, key_concepts, student_notes, learning_state, understanding_level, student_progress_snapshot, progress_summary, support_note, next_step, resource_url",
      )
      .eq("workspace_id", workspace.id)
      .eq("student_id", id)
      .order("class_date", { ascending: false }),
  ]);

  const student = studentResult.data as Student | null;
  if (!student) notFound();
  const notes = (notesResult.data ?? []) as LearningNote[];

  return (
    <div className="student-portal-view is-preview">
      <div className="student-preview-banner">
        <span>Founder preview · {student.foundry_id}</span>
        <nav aria-label="Preview student tabs">
          {previewTabs.map((item) => (
            <Link
              href={`/dashboard/foundry/students/${student.id}/portal?tab=${item.tab}`}
              key={item.tab}
            >
              {item.label}
            </Link>
          ))}
          <Link className="is-active" href={`/dashboard/foundry/students/${student.id}/notes`}>
            Notes
          </Link>
        </nav>
      </div>

      <Link className="foundry-back-inline" href="/dashboard/foundry/notes">
        <ArrowLeft aria-hidden="true" size={16} />
        Back to class notes
      </Link>

      <section className="student-role-context" aria-label="Student preview identity">
        <div>
          <span className="student-role-context-icon">
            <History aria-hidden="true" size={18} />
          </span>
          <span>
            <small>Student-facing preview</small>
            <strong>{student.full_name}</strong>
          </span>
        </div>
        <div>
          <span className="student-foundry-id">{student.foundry_id}</span>
          <HealthBadge health={student.health_status} />
        </div>
      </section>

      <section className="student-page-head">
        <div>
          <span className="student-kicker">Your learning memory</span>
          <h1>Previous class notes</h1>
          <p>
            Har class ki explanation, important concepts, learning progress,
            resource aur next step yahan permanently save rahega.
          </p>
          <small>
            {foundryDepartmentLabel(student.department)} ·{" "}
            {foundryLevelLabel(student.level)}
          </small>
        </div>
        <span className="student-page-head-icon">
          <History aria-hidden="true" size={28} />
        </span>
      </section>

      <section className="student-progress-summary">
        <div>
          <span>Current Foundry progress</span>
          <strong>{student.progress_percent}%</strong>
        </div>
        <FoundryProgressBar value={student.progress_percent} />
      </section>

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
