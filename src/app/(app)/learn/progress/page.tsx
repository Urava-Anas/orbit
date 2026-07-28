import type { Metadata } from "next";
import { CurrentStudentPage } from "@/components/foundry/CurrentStudentPage";

export const metadata: Metadata = {
  title: "Progress · Urava Foundry",
  robots: { index: false, follow: false },
};

export default function StudentProgressPage() {
  return <CurrentStudentPage tab="progress" />;
}
