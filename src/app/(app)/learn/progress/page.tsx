import type { Metadata } from "next";
import {
  StudentLearningProgress,
  type StudentLearningNote,
} from "@/components/foundry/StudentLearningProgress";
import { requireStudentAccess } from "@/lib/access";

export const metadata: Metadata = {
  title: "Progress · Urava Foundry",
  robots: { index: false, follow: false },
};

type Props = {
  searchParams: Promise<{ entry?: string }>;
};

export default async function StudentProgressPage({ searchParams }: Props) {
  const query = await searchParams;
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
        "id, class_title_snapshot, class_date, lesson_summary, key_concepts, student_notes, learning_state, understanding_level, student_progress_snapshot, progress_summary, support_note, next_step, resource_url",
      )
      .eq("workspace_id", workspace.id)
      .eq("student_id", studentId)
      .order("class_date", { ascending: false }),
  ]);

  const student = studentResult.data;
  const notes = (notesResult.data ?? []) as StudentLearningNote[];

  return (
    <div className="student-portal-page">
      <StudentLearningProgress
        baseHref="/learn/progress"
        currentProgress={student?.progress_percent ?? 0}
        notes={notes}
        selectedEntryId={query.entry}
        studentName={student?.full_name ?? "Student"}
      />
    </div>
  );
}
