import Link from "next/link";
import {
  CheckCircle2,
  Link2,
  LockKeyhole,
  LogOut,
  MailCheck,
  RefreshCw,
} from "lucide-react";
import { signOut } from "@/app/auth/actions";
import {
  StudentPortalView,
  type StudentPortalTab,
} from "@/components/foundry/StudentPortal";
import { getCurrentStudentPortal } from "@/lib/foundry";

export async function CurrentStudentPage({
  tab,
  notice,
  error,
}: {
  tab: StudentPortalTab;
  notice?: string;
  error?: string;
}) {
  const data = await getCurrentStudentPortal();
  if (!data.student) {
    return (
      <section className="student-link-pending">
        <span className="student-access-icon">
          <MailCheck aria-hidden="true" size={28} />
        </span>
        <small>Invite-only access</small>
        <h1>Aap ka Foundry record abhi link nahi hua</h1>
        <p>
          Fikr na karein—account theek hai. Urava team aap ke isi email ko
          permanent Foundry ID se link karegi. Naya account banane ki zaroorat
          nahi.
        </p>

        <ol className="student-access-steps" aria-label="Access linking process">
          <li className="is-complete">
            <span>
              <CheckCircle2 aria-hidden="true" size={17} />
            </span>
            <div>
              <strong>Sign-in complete</strong>
              <small>Aap ka account secure hai</small>
            </div>
          </li>
          <li className="is-current">
            <span>
              <Link2 aria-hidden="true" size={17} />
            </span>
            <div>
              <strong>Record linking</strong>
              <small>Urava team Foundry ID connect karegi</small>
            </div>
          </li>
          <li>
            <span>
              <LockKeyhole aria-hidden="true" size={17} />
            </span>
            <div>
              <strong>Student space opens</strong>
              <small>Sirf aap ka learning record nazar aayega</small>
            </div>
          </li>
        </ol>

        <div className="student-access-note">
          <LockKeyhole aria-hidden="true" size={17} />
          Aap ka admissions record invitation tak private rahega.
        </div>

        <div className="student-access-actions">
          <Link className="student-primary-action" href="/learn">
            Dobara check karein
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
    );
  }

  return (
    <StudentPortalView
      assignments={data.assignments}
      classes={data.classes}
      error={error}
      notice={notice}
      notifications={data.notifications}
      progress={data.progress}
      studioReviews={data.studioReviews}
      certificates={data.certificates}
      skills={data.skills}
      student={data.student}
      submissions={data.submissions}
      tab={tab}
    />
  );
}
