import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import {
  StudentExperience,
  type StudentExperienceSection,
} from "@/components/foundry/StudentExperience";
import {
  StudentPreviewFrame,
  type StudentPreviewSection,
} from "@/components/foundry/StudentPreviewFrame";
import { getFounderStudentPreview } from "@/lib/foundry";
import { loadFoundryJourney } from "@/lib/foundry-journey";

export const metadata: Metadata = {
  title: "View as Member · Orbit",
  robots: { index: false, follow: false },
};

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    tab?: string;
    month?: string;
    notice?: string;
    error?: string;
    view?: string;
  }>;
};

const canonicalSections = new Set([
  "home",
  "map",
  "classes",
  "resources",
  "tasks",
  "studio",
  "profile",
]);

const legacySections: Record<string, StudentPreviewSection> = {
  today: "home",
  learn: "tasks",
  submit: "tasks",
  progress: "map",
  notes: "resources",
};

function resolveSection(value?: string): StudentPreviewSection {
  if (value && canonicalSections.has(value)) return value as StudentPreviewSection;
  if (value && legacySections[value]) return legacySections[value];
  return "home";
}

export default async function StudentPortalPreviewPage({
  params,
  searchParams,
}: Props) {
  const { id } = await params;
  const query = await searchParams;
  const data = await getFounderStudentPreview(id);
  if (!data) notFound();

  const section = resolveSection(query.tab);
  if (section === "map") {
    redirect(
      `/dashboard/development/journey?studentId=${data.student.id}&view=student`,
    );
  }

  const journey = await loadFoundryJourney(
    data.supabase,
    data.workspace.id,
    data.student.id,
    data.student.department,
  );
  const unreadCount = data.notifications.filter((item) => !item.read_at).length;
  const previewRoot = `/dashboard/people/${data.student.id}?view=member`;

  return (
    <StudentPreviewFrame
      active={section}
      foundryId={data.student.foundry_id}
      studentId={data.student.id}
      unreadCount={unreadCount}
    >
      <div className="student-portal-page">
        <StudentExperience
          assignments={data.assignments}
          calendarMonth={query.month}
          certificates={data.certificates}
          error={query.error}
          journey={journey}
          notice={query.notice}
          notifications={data.notifications}
          preview
          previewRoot={previewRoot}
          progress={data.progress}
          section={section as StudentExperienceSection}
          skills={data.skills}
          studioReviews={data.studioReviews}
          student={data.student}
          submissions={data.submissions}
        />
      </div>
    </StudentPreviewFrame>
  );
}
