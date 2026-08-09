import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  StudentLearningMap,
  type StudentLearningMapNote,
} from "@/components/foundry/StudentLearningMap";
import { getCurrentStudentPortal } from "@/lib/foundry";

export const metadata: Metadata = {
  title: "Learning Map · Urava Foundry",
  robots: { index: false, follow: false },
};

export default async function StudentProgressPage() {
  const data = await getCurrentStudentPortal();
  if (!data.student) redirect("/learn");

  const notesResult = await data.supabase
    .from("foundry_class_learning_notes")
    .select(
      "id, class_id, class_title_snapshot, class_date, learning_state, progress_summary, next_step, resource_url, impact_title, impact_statement, achievement_title, achievement_description, evidence_requirement, xp_reward",
    )
    .eq("workspace_id", data.workspace.id)
    .eq("student_id", data.student.id)
    .order("class_date");

  const notes = (notesResult.data ?? []) as StudentLearningMapNote[];

  return (
    <div className="student-portal-page">
      <StudentLearningMap
        notes={notes}
        progress={data.progress}
        student={data.student}
      />
    </div>
  );
}
