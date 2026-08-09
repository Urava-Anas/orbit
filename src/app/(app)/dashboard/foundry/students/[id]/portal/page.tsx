import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  StudentClassNotes,
  type StudentClassNote,
} from "@/components/foundry/StudentClassNotes";
import {
  StudentPortalView,
  type StudentPortalTab,
} from "@/components/foundry/StudentPortal";
import { getFounderStudentPreview } from "@/lib/foundry";

export const metadata: Metadata = {
  title: "Student View · Urava Foundry",
  robots: { index: false, follow: false },
};

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    tab?: string;
    note?: string;
    notice?: string;
    error?: string;
    view?: string;
  }>;
};

const portalTabs: Array<{ tab: string; label: string }> = [
  { tab: "today", label: "Today" },
  { tab: "learn", label: "Learn" },
  { tab: "submit", label: "Submit" },
  { tab: "progress", label: "Map" },
  { tab: "profile", label: "Profile" },
  { tab: "notes", label: "Notes" },
];

const standardTabs = new Set(["today", "learn", "submit", "profile"]);

function PreviewNavigation({
  active,
  foundryId,
  studentView = false,
}: {
  active: string;
  foundryId: string;
  studentView?: boolean;
}) {
  return (
    <div className="student-preview-banner">
      <span>{studentView ? "View as student" : "Admin controls"} · {foundryId}</span>
      <nav aria-label="Student view navigation">
        {portalTabs.map((item) => (
          <Link
            className={item.tab === active ? "is-active" : ""}
            href={`?tab=${item.tab}${studentView ? "&view=student" : ""}`}
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

  // One map only. Legacy/record-level map links resolve to the canonical map.
  if (query.tab === "progress") {
    redirect(
      `/dashboard/foundry/map?studentId=${data.student.id}${
        query.view === "student" ? "&view=student" : ""
      }`,
    );
  }

  if (query.tab === "notes") {
    const notesResult = await data.supabase
      .from("foundry_class_learning_notes")
      .select(
        "id, class_title_snapshot, class_date, lesson_summary, key_concepts, student_notes, learning_state, understanding_level, student_progress_snapshot, progress_summary, support_note, next_step, resource_url, updated_at",
      )
      .eq("workspace_id", data.workspace.id)
      .eq("student_id", data.student.id)
      .order("class_date", { ascending: false });

    const notes = (notesResult.data ?? []) as StudentClassNote[];
    const studentView = query.view === "student";

    return (
      <div
        className="student-portal-view is-preview"
        style={{ width: "min(100%, 1080px)" }}
      >
        <PreviewNavigation
          active="notes"
          foundryId={data.student.foundry_id}
          studentView={studentView}
        />
        <StudentClassNotes
          journeyHref={studentView ? "?tab=progress&view=student" : "?tab=progress"}
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

  const availability = await data.supabase
    .from("foundry_task_assignments")
    .select("id")
    .eq("workspace_id", data.workspace.id)
    .eq("student_id", data.student.id)
    .lte("starts_at", new Date().toISOString());
  const availableIds = new Set((availability.data ?? []).map((item) => item.id));
  const availableAssignments = data.assignments.filter((item) =>
    availableIds.has(item.id),
  );

  return (
    <div>
      <PreviewNavigation
        active={tab}
        foundryId={data.student.foundry_id}
        studentView={query.view === "student"}
      />
      <StudentPortalView
        assignments={availableAssignments}
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
