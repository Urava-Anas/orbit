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
  StudentLearningProgress,
  type StudentLearningNote,
} from "@/components/foundry/StudentLearningProgress";
import {
  StudentPortalView,
  type StudentPortalTab,
} from "@/components/foundry/StudentPortal";
import { EmptyFoundryState } from "@/components/foundry/FoundryUI";
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

type LearningNote = StudentLearningNote & {
  updated_at?: string;
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
  "profile",
]);

function stageLabel(value: string | undefined) {
  if (!value) return "Not recorded";
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function PreviewNavigation({
  active,
  foundryId,
}: {
  active: string;
  foundryId: string;
}) {
  return (
    <div className="student-preview-banner">
      <span>Founder preview · {foundryId}</span>
      <nav aria-label="Preview student tabs">
        {portalTabs.map((item) => (
          <Link
            className={item.tab === active ? "is-active" : ""}
            href={`?tab=${item.tab}`}
            key={item.tab}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

export default async function StudentPortalPreviewPage({
  params,
  searchParams,
}: Props) {
  const { id } = await params;
  const query = await searchParams;
  const data = await getFounderStudentPreview(id);
  if (!data) notFound();

  if (query.tab === "progress" || query.tab === "notes") {
    const notesResult = await data.supabase
      .from("foundry_class_learning_notes")
      .select(
        "id, class_title_snapshot, class_date, lesson_summary, key_concepts, student_notes, learning_state, understanding_level, student_progress_snapshot, progress_summary, support_note, next_step, resource_url, updated_at",
      )
      .eq("workspace_id", data.workspace.id)
      .eq("student_id", data.student.id)
      .order("class_date", { ascending: false });

    const notes = (notesResult.data ?? []) as LearningNote[];
    const currentStage = stageLabel(notes[0]?.learning_state);

    if (query.tab === "progress") {
      return (
        <div className="student-portal-view is-preview">
          <PreviewNavigation
            active="progress"
            foundryId={data.student.foundry_id}
          />
          <StudentLearningProgress
            notes={notes}
            notesHref="?tab=notes"
            studentName={data.student.full_name}
          />
        </div>
      );
    }

    return (
      <div className="student-portal-view is-preview">
        <PreviewNavigation active="notes" foundryId={data.student.foundry_id} />

        <section className="student-page-head">
          <div>
            <span className="student-kicker">Student-facing preview</span>
            <h1>Previous class notes</h1>
            <p>
              Detailed explanations, learning support, resources and next steps
              stay here. Progress only shows the simple learning journey.
            </p>
          </div>
          <span className="student-page-head-icon">
            <History aria-hidden="true" size={28} />
          </span>
        </section>

        <Link className="student-progress-summary" href="?tab=progress">
          <div>
            <span>Current learning stage · View journey</span>
            <strong>{currentStage}</strong>
          </div>
        </Link>

        {notes.length ? (
          <div className="student-learning-list">
            {notes.map((note) => (
              <article
                className="student-learning-card"
                id={`note-${note.id}`}
                key={note.id}
              >
                <div className="student-learning-card-head">
                  <div>
                    <span>{formatFoundryDate(note.class_date)}</span>
                    <h2>{note.class_title_snapshot}</h2>
                  </div>
                  <span className="student-learning-state">
                    {stageLabel(note.learning_state)}
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
                        Evidence and learning progress
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
    <div>
      <div className="student-preview-banner">
        <span>Student preview controls</span>
        <nav aria-label="Additional student preview controls">
          <Link href="?tab=notes">Open Notes preview</Link>
        </nav>
      </div>
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
    </div>
  );
}
