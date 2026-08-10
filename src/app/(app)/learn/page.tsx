import type { Metadata } from "next";
import { CurrentStudentExperience } from "@/components/foundry/CurrentStudentExperience";

export const metadata: Metadata = {
  title: "Student Home · Urava Foundry",
  robots: { index: false, follow: false },
};

type Props = {
  searchParams: Promise<{ notice?: string; error?: string }>;
};

export default async function StudentHomePage({ searchParams }: Props) {
  const query = await searchParams;
  return (
    <CurrentStudentExperience
      error={query.error}
      notice={query.notice}
      section="home"
    />
  );
}
