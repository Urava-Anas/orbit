import Link from "next/link";
import { LockKeyhole, MailCheck } from "lucide-react";
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
        <span>
          <MailCheck aria-hidden="true" size={28} />
        </span>
        <small>Invite-only access</small>
        <h1>Your Foundry record is not linked yet</h1>
        <p>
          Application accept hone ke baad Urava aap ke email ko permanent Foundry
          ID se link karega. Naya account banane ki zaroorat nahi.
        </p>
        <div>
          <LockKeyhole aria-hidden="true" size={17} />
          Admissions record remains private until invitation.
        </div>
        <Link href="/dashboard">Back to Orbit</Link>
      </section>
    );
  }

  return (
    <StudentPortalView
      assignments={data.assignments}
      classes={data.classes}
      error={error}
      notice={notice}
      progress={data.progress}
      skills={data.skills}
      student={data.student}
      submissions={data.submissions}
      tab={tab}
    />
  );
}
