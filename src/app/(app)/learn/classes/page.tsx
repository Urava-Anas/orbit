import type { Metadata } from "next";
import { CurrentStudentExperience } from "@/components/foundry/CurrentStudentExperience";

export const metadata: Metadata = {
  title: "My Classes · Urava Foundry",
  robots: { index: false, follow: false },
};

type Props = {
  searchParams: Promise<{ month?: string }>;
};

export default async function StudentClassesPage({ searchParams }: Props) {
  const query = await searchParams;
  return <CurrentStudentExperience calendarMonth={query.month} section="classes" />;
}
