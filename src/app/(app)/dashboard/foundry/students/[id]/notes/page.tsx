import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Student Notes Preview",
  robots: { index: false, follow: false },
};

type Props = {
  params: Promise<{ id: string }>;
};

export default async function FounderStudentNotesPreviewPage({ params }: Props) {
  const { id } = await params;
  redirect(`/dashboard/foundry/students/${id}/portal?tab=notes`);
}
