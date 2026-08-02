import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
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
  StudentPortalView,
  type StudentPortalTab,
} from "@/components/foundry/StudentPortal";
import {
  EmptyFoundryState,
  FoundryProgressBar,
} from "@/components/foundry/FoundryUI";
import {
  formatFoundryDate,
  getFounderStudentPreview,
} from "@/lib/foundry";

export const metadata: Metadata = {
  title: "Student Portal Preview",
  robots: { index: false, follow: false },
};

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    tab?: string;
    notice?: string;
    error?: string;
  }>;
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

const portalTabs: Array<{ tab: string; label: string }> = [
  { tab: "today", label: "Today" },
  { tab: "learn", label: "Learn" },
  { tab: "submit", label: "Submit" },
  { tab: "progress", label: "Progress" },
  { tab: "profile", label: "Profile" },
  { tab: "notes", label: "Notes" },
];

const standardTabs = new Set([
  "today",
  "learn",
  "submit",
  "progress",
  "profile",
]);

export default async function StudentPortalPreviewPage({
  params,
  searchParams,
}: Props) {
  const { id } = await params;
  const query = await searchParams;
  const data = await getFounderStudentPreview(id);
  if (!data) notFound();

  if (query.tab === "notes") {
    const notesResult = await data.supabase
      .from("foundry_class_learning_notes")
      .select(
        "id, class_title_snapshot, class_date, lesson_summary, key_concepts, student_notes, learning_state, understanding_level, student_progress_snapshot, progress_summary, support_note, next_step, resource_url",
      )
      .eq("workspace_id", data.workspace.id)
      .eq("student_id", data.student.id)
      .order("class_date", { ascending: false });

    const notes = (notesResult.data ?? []) as LearningNote[];

    return (
      <div className="student-portal-view is-preview">
        <div className="student-preview-banner">
          <span>Founder preview · {data.student.foundry_id}</span>
          <nav aria-label="Preview student tabs">
            {portalTabs.map((item) => (
              <Link
                className={item.tab === "notes" ? "is-active" : ""}
                href={`?tab=${item.tab}`}
                key={item.tab}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        <section className="student-page-head">
          <div>
            <span className="student-kicker">Student-facing preview</span>
            <h1>Previous class notes</h1>
            <p>
              This is exactly what {data.student.full_name} can see in the Notes
              section of the Orbit student account.
            </p>
          </div>
          <span className="student-page-head-icon">
            <History aria-hidden="true" size={28} />
          </span>
        </section>

        <section className="student-progress-summary">
          <div>
            <span>Current Foundry progress</span>
            <strong>{data.student.progress_percent}%</strong>
          </div>
          <FoundryProgressBar value={data.student.progress_percent} />
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
                      Saved notes
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
                        Best learning support
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
            detail="Save a completed class record from Foundry Notes, then it will appear here."
          />
        )}
      </div>
    );
  }

  const tab = standardTabs.has(query.tab ?? "")
    ? (query.tab as StudentPortalTab)
    : "today";

  return (
    <StudentPortalView
      assignments={data.assignments}
      classes={data.classes}
      error={query.error}
      notice={query.notice}
      notifications={data.notifications}
      preview
      progress={data.progress}
      studioReviews={data.studioReviews}
      certificates={data.certificates}
      skills={data.skills}
      student={data.student}
      submissions={data.submissions}
      tab={tab}
    />
  );
}
