import { redirect } from "next/navigation";
import { StudentDailyHeartbeat } from "@/components/foundry/StudentDailyHeartbeat";
import {
  StudentExperience,
  type StudentExperienceSection,
} from "@/components/foundry/StudentExperience";
import { getCurrentStudentPortal } from "@/lib/foundry";
import { loadFoundryJourney } from "@/lib/foundry-journey";

export async function CurrentStudentExperience({
  section,
  calendarMonth,
  notice,
  error,
}: {
  section: StudentExperienceSection;
  calendarMonth?: string;
  notice?: string;
  error?: string;
}) {
  const data = await getCurrentStudentPortal();
  if (!data.student) redirect("/learn");

  const journey = await loadFoundryJourney(
    data.supabase,
    data.workspace.id,
    data.student.id,
    data.student.department,
  );

  const checkpoints = [
    "portal_opened" as const,
    ...(section === "tasks" ? (["task_opened"] as const) : []),
  ];

  return (
    <div className="student-portal-page">
      <StudentDailyHeartbeat checkpoints={checkpoints} />
      <StudentExperience
        assignments={data.assignments}
        calendarMonth={calendarMonth}
        certificates={data.certificates}
        error={error}
        journey={journey}
        notice={notice}
        notifications={data.notifications}
        progress={data.progress}
        section={section}
        skills={data.skills}
        studioReviews={data.studioReviews}
        student={data.student}
        submissions={data.submissions}
      />
    </div>
  );
}
