import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { StudentLearningMap } from "@/components/foundry/StudentLearningMap";
import { getCurrentStudentPortal } from "@/lib/foundry";
import { loadFoundryJourney } from "@/lib/foundry-journey";

export const metadata: Metadata = {
  title: "Journey Map · Urava Foundry",
  robots: { index: false, follow: false },
};

export default async function StudentProgressPage() {
  const data = await getCurrentStudentPortal();
  if (!data.student) redirect("/learn");

  const journey = await loadFoundryJourney(
    data.supabase,
    data.workspace.id,
    data.student.id,
    data.student.department,
  );

  return (
    <div className="student-portal-page">
      <StudentLearningMap journey={journey} student={data.student} />
    </div>
  );
}
