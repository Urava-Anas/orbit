import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StudentPortalView, type StudentPortalTab } from "@/components/foundry/StudentPortal";
import { getFounderStudentPreview } from "@/lib/foundry";

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

const tabs = new Set(["today", "learn", "submit", "progress", "profile"]);

export default async function StudentPortalPreviewPage({
  params,
  searchParams,
}: Props) {
  const { id } = await params;
  const query = await searchParams;
  const data = await getFounderStudentPreview(id);
  if (!data) notFound();
  const tab = tabs.has(query.tab ?? "")
    ? (query.tab as StudentPortalTab)
    : "today";

  return (
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
  );
}
