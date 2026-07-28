import type { Metadata } from "next";
import { CurrentStudentPage } from "@/components/foundry/CurrentStudentPage";

export const metadata: Metadata = {
  title: "Aaj ka Task · Urava Foundry",
  robots: { index: false, follow: false },
};

type Props = {
  searchParams: Promise<{ notice?: string; error?: string }>;
};

export default async function StudentTodayPage({ searchParams }: Props) {
  const query = await searchParams;
  return <CurrentStudentPage error={query.error} notice={query.notice} tab="today" />;
}
