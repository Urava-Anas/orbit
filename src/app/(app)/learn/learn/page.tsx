import type { Metadata } from "next";
import { CurrentStudentPage } from "@/components/foundry/CurrentStudentPage";

export const metadata: Metadata = {
  title: "Learn · Urava Foundry",
  robots: { index: false, follow: false },
};

export default function StudentLearnPage() {
  return <CurrentStudentPage tab="learn" />;
}
