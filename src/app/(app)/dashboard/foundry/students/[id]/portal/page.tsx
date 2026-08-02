import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  StudentClassNotes,
  type StudentClassNote,
} from "@/components/foundry/StudentClassNotes";
import {
  StudentLearningProgress,
  type StudentLearningNote,
} from "@/components/foundry/StudentLearningProgress";
import {
  StudentPortalView,
  type StudentPortalTab,
} from "@/components/foundry/StudentPortal";
import { getFounderStudentPreview } from "@/lib/foundry";

export const metadata: Metadata = {
  title: "Student Portal Preview",
  robots: { index: false, follow: false },
};

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    tab?: string;
    note?: string;
    notice?: string;
    error?: string;
  }>;
};

type LearningNote = StudentLearningNote & StudentClassNote;

const portalTabs: Array<{ tab: string; label: string }> = [
  { tab: "today", label: "Today" },
  { tab: "learn", label: "Learn" },
  { tab: "submit", label: "Submit" },
  { tab: "progress", label: "Progress" },
  { tab: "profile", label: "Profile" },
  { tab: "notes", label: "Notes" },
];

const standardTabs = new Set(["today", "learn", "submit", "profile"]);

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

    if (query.tab === "progress") {
      return (
        <div
          className="student-portal-view is-preview"
          style={{ width: "min(100%, 1080px)" }}
        >
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
      <div
        className="student-portal-view is-preview"
        style={{ width: "min(100%, 1080px)" }}
      >
        <PreviewNavigation active="notes" foundryId={data.student.foundry_id} />
        <StudentClassNotes
          journeyHref="?tab=progress"
          notes={notes}
          preview
          selectedNoteId={query.note}
          studentName={data.student.full_name}
        />
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
        certificates={data.certificates}
        classes={data.classes}
        error={query.error}
        notice={query.notice}
        notifications={data.notifications}
        preview
        progress={data.progress}
        skills={data.skills}
        studioReviews={data.studioReviews}
        student={data.student}
        submissions={data.submissions}
        tab={tab}
      />
    </div>
  );
}
