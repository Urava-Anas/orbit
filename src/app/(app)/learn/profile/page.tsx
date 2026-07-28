import type { Metadata } from "next";
import { CurrentStudentPage } from "@/components/foundry/CurrentStudentPage";

export const metadata: Metadata = {
  title: "Profile · Urava Foundry",
  robots: { index: false, follow: false },
};

export default function StudentProfilePage() {
  return <CurrentStudentPage tab="profile" />;
}
