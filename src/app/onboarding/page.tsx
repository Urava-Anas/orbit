import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Clock3, ShieldCheck, Sparkles } from "lucide-react";
import { Notice } from "@/components/Notice";
import { OrbitMark } from "@/components/OrbitMark";
import { getOrbitAccess, orbitHomePath } from "@/lib/access";
import { ORBIT_TRIAL_DAYS } from "@/lib/orbit-plans";
import { OnboardingExperience } from "./OnboardingExperience";
import styles from "./onboarding.module.css";

export const metadata: Metadata = {
  title: "Set up your Orbit",
  robots: { index: false, follow: false },
};

type PageProps = {
  searchParams: Promise<{ error?: string; notice?: string }>;
};

export default async function OnboardingPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const context = await getOrbitAccess();

  if (!context) redirect("/signup?notice=Create%20your%20account%20before%20company%20setup.");

  if (context.access.accountRole === "founder" && context.access.workspace) {
    redirect(orbitHomePath(context.access));
  }

  if (context.access.accountRole === "student") {
    redirect(orbitHomePath(context.access));
  }

  const fullName =
    typeof context.user.user_metadata.full_name === "string"
      ? context.user.user_metadata.full_name.trim()
      : "";
  const defaultWorkspaceName = fullName ? `${fullName}'s company` : "My company";

  return (
    <main className={styles.page}>
      <nav className={styles.nav}>
        <Link href="/" aria-label="Orbit home"><OrbitMark /></Link>
        <span className={styles.security}><ShieldCheck size={14} /> Secure company setup</span>
      </nav>

      <div className={styles.shell}>
        <aside className={styles.context}>
          <span className={styles.contextKicker}>Your account is ready</span>
          <h2>Now shape the first version of your Orbit.</h2>
          <p>
            Three small decisions configure your starting workspace. They personalise
            the experience; they do not bypass Orbit&apos;s permission system.
          </p>
          <div className={styles.trustList}>
            <span><Clock3 size={14} /> Trial starts only at final activation</span>
            <span><ShieldCheck size={14} /> Organisation-scoped workspace</span>
            <span><Sparkles size={14} /> {ORBIT_TRIAL_DAYS} full Business days</span>
          </div>
        </aside>

        <section>
          <Notice error={params.error} notice={params.notice} />
          <OnboardingExperience defaultWorkspaceName={defaultWorkspaceName} />
        </section>
      </div>
    </main>
  );
}
