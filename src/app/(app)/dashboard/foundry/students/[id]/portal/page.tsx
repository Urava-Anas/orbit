import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  StudentClassNotes,
  type StudentClassNote,
} from "@/components/foundry/StudentClassNotes";
import {
  StudentLearningMap,
  type StudentLearningMapNote,
} from "@/components/foundry/StudentLearningMap";
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
  studentId,
  studentView = false,
}: {
  active: string;
  foundryId: string;
  studentId: string;
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
        {active === "progress" ? (
          <Link
            href={
              studentView
                ? `/dashboard/foundry/students/${studentId}/portal?tab=progress`
                : `/dashboard/foundry/students/${studentId}/portal?tab=progress&view=student`
            }
          >
            {studentView ? "Manage map" : "View as student"}
          </Link>
        ) : null}
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

  if (query.tab === "progress") {
    const notesResult = await data.supabase
      .from("foundry_class_learning_notes")
      .select(
        "id, class_id, class_title_snapshot, class_date, learning_state, progress_summary, next_step, resource_url, impact_title, impact_statement, achievement_title, achievement_description, evidence_requirement, xp_reward",
      )
      .eq("workspace_id", data.workspace.id)
      .eq("student_id", data.student.id)
      .order("class_date");

    const notes = (notesResult.data ?? []) as StudentLearningMapNote[];
    const studentView = query.view === "student";
    const portalBase = `/dashboard/foundry/students/${data.student.id}/portal${
      studentView ? "?view=student" : ""
    }`;

    return (
      <div
        className="student-portal-view is-preview"
        style={{ width: "min(100%, 1120px)" }}
      >
        <PreviewNavigation
          active="progress"
          foundryId={data.student.foundry_id}
          studentId={data.student.id}
          studentView={studentView}
        />
        <StudentLearningMap
          mode={studentView ? "student" : "admin"}
          notes={notes}
          progress={data.progress}
          student={data.student}
          studentBaseHref={portalBase}
        />
      </div>
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
          studentId={data.student.id}
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

  return (
    <div>
      <PreviewNavigation
        active={tab}
        foundryId={data.student.foundry_id}
        studentId={data.student.id}
        studentView={query.view === "student"}
      />
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
