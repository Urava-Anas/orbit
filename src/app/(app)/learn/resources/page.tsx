import type { Metadata } from "next";
import { CurrentStudentExperience } from "@/components/foundry/CurrentStudentExperience";

export const metadata: Metadata = {
  title: "My Resources · Urava Foundry",
  robots: { index: false, follow: false },
};

export default function StudentResourcesPage() {
  return <CurrentStudentExperience section="resources" />;
}
