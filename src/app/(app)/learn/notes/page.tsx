import type { Metadata } from "next";
import {
  StudentClassNotes,
  type StudentClassNote,
} from "@/components/foundry/StudentClassNotes";
import { requireStudentAccess } from "@/lib/access";

export const metadata: Metadata = {
  title: "My Class Notes",
  robots: { index: false, follow: false },
};

type Props = {
  searchParams: Promise<{ note?: string }>;
};

export default async function StudentClassNotesPage({ searchParams }: Props) {
  const query = await searchParams;
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

  return (
    <div className="student-portal-page">
      <StudentClassNotes
        journeyHref="/learn/progress"
        notes={(notesResult.data ?? []) as StudentClassNote[]}
        selectedNoteId={query.note}
        studentName={studentResult.data?.full_name ?? "Student"}
      />
    </div>
  );
}
