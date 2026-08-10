import type { Metadata } from "next";
import { CurrentStudentExperience } from "@/components/foundry/CurrentStudentExperience";

export const metadata: Metadata = {
  title: "My Studio Work · Urava Foundry",
  robots: { index: false, follow: false },
};

export default function StudentStudioPage() {
  return <CurrentStudentExperience section="studio" />;
}
