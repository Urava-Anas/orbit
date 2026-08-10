import type { Metadata } from "next";
import { CurrentStudentExperience } from "@/components/foundry/CurrentStudentExperience";

export const metadata: Metadata = {
  title: "My Profile · Urava Foundry",
  robots: { index: false, follow: false },
};

export default function StudentProfilePage() {
  return <CurrentStudentExperience section="profile" />;
}
