import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getOrbitAccess, orbitHomePath } from "@/lib/access";

export const metadata: Metadata = {
  title: "Start your Orbit trial",
  robots: { index: false, follow: false },
};

export default async function TrialPage() {
  const context = await getOrbitAccess();

  if (!context) redirect("/signup");

  if (context.access.accountRole === "founder" && context.access.workspace) {
    redirect(orbitHomePath(context.access));
  }

  if (context.access.accountRole === "student") {
    redirect(orbitHomePath(context.access));
  }

  redirect("/onboarding");
}
