import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  CheckCircle2,
  Link2,
  LockKeyhole,
  LogOut,
  RefreshCw,
} from "lucide-react";
import { signOut } from "@/app/auth/actions";
import { OrbitMark } from "@/components/OrbitMark";
import {
  orbitHomePath,
  requireOrbitAccess,
} from "@/lib/access";

export const metadata: Metadata = {
  title: "Access check · Orbit",
  robots: { index: false, follow: false },
};

export default async function AccessPendingPage() {
  const context = await requireOrbitAccess();
  if (context.access.accountRole !== "pending") {
    redirect(orbitHomePath(context.access));
  }

  return (
    <main className="access-pending-shell">
      <header>
        <Link href="/" aria-label="Orbit home">
          <OrbitMark />
        </Link>
        <span>Secure identity confirmed</span>
      </header>

      <section className="student-link-pending">
        <span className="student-access-icon">
          <Link2 aria-hidden="true" size={28} />
        </span>
        <small>Access is being matched</small>
        <h1>Aap ka Orbit account secure hai</h1>
        <p>
          Is verified email ka Founder ya Foundry Student record abhi match
          nahi mila. Naya account na banayein—Urava team isi identity ko sahi
          permanent record se connect karegi.
        </p>

        <ol className="student-access-steps" aria-label="Orbit access process">
          <li className="is-complete">
            <span>
              <CheckCircle2 aria-hidden="true" size={17} />
            </span>
            <div>
              <strong>Secure sign-in complete</strong>
              <small>Aap ki verified identity mil gayi</small>
            </div>
          </li>
          <li className="is-current">
            <span>
              <Link2 aria-hidden="true" size={17} />
            </span>
            <div>
              <strong>Permanent record match</strong>
              <small>Founder ya Student access verify ho raha hai</small>
            </div>
          </li>
          <li>
            <span>
              <LockKeyhole aria-hidden="true" size={17} />
            </span>
            <div>
              <strong>Correct workspace opens</strong>
              <small>Sirf aap ka approved role aur data</small>
            </div>
          </li>
        </ol>

        <div className="student-access-note">
          <LockKeyhole aria-hidden="true" size={17} />
          Default access band rahega jab tak exact record verify na ho.
        </div>

        <div className="student-access-actions">
          <Link className="student-primary-action" href="/access-pending">
            Access dobara check karein
            <RefreshCw aria-hidden="true" size={16} />
          </Link>
          <form action={signOut}>
            <button className="student-secondary-action" type="submit">
              Dusra account use karein
              <LogOut aria-hidden="true" size={15} />
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
