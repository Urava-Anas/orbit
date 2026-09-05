import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CircleCheck, Mail, ShieldCheck } from "lucide-react";
import { StudentOrbitInvitation } from "@/components/foundry/StudentOrbitInvitation";
import { requireFounderFoundry } from "@/lib/foundry";

export const metadata: Metadata = {
  title: "Foundry Orbit Access",
  robots: { index: false, follow: false },
};

type Props = {
  params: Promise<{ id: string }>;
};

export default async function FoundryStudentAccessPage({ params }: Props) {
  const { id } = await params;
  const { supabase, workspace } = await requireFounderFoundry();
  const { data: student, error } = await supabase
    .from("foundry_students")
    .select(
      "id, foundry_id, full_name, email, lifecycle_status, auth_user_id, department",
    )
    .eq("id", id)
    .eq("workspace_id", workspace.id)
    .maybeSingle();

  if (error || !student) notFound();

  return (
    <div className="foundry-page">
      <Link
        className="foundry-back-inline"
        href={`/dashboard/foundry/students/${student.id}`}
      >
        <ArrowLeft aria-hidden="true" size={16} />
        Student record
      </Link>

      <section className="student-record-hero">
        <div className="student-record-identity">
          <span className="foundry-avatar is-large">
            {student.full_name
              .split(" ")
              .slice(0, 2)
              .map((part) => part[0])
              .join("")
              .toUpperCase()}
          </span>
          <div>
            <span className="foundry-id">{student.foundry_id}</span>
            <h1>Orbit access</h1>
            <p>{student.full_name} · {student.lifecycle_status.replaceAll("_", " ")}</p>
            <div className="student-record-badges">
              <span className={student.auth_user_id ? "foundry-access-state is-connected" : "foundry-access-state"}>
                <CircleCheck aria-hidden="true" size={14} />
                {student.auth_user_id ? "Identity connected" : "No Orbit authority yet"}
              </span>
              <span>
                <Mail aria-hidden="true" size={14} />
                {student.email ?? "Email missing"}
              </span>
              <span>
                <ShieldCheck aria-hidden="true" size={14} />
                Explicit invitation only
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="student-record-grid">
        <StudentOrbitInvitation
          studentId={student.id}
          fullName={student.full_name}
          email={student.email}
          lifecycleStatus={student.lifecycle_status}
          connected={Boolean(student.auth_user_id)}
        />

        <aside className="foundry-stack">
          <article className="foundry-card">
            <div className="foundry-card-head">
              <div>
                <span className="foundry-card-eyebrow">Access contract</span>
                <h2>What this invitation does</h2>
              </div>
              <ShieldCheck aria-hidden="true" size={19} />
            </div>
            <p className="foundry-long-copy">
              It proves that this Foundry record was intentionally invited into
              Orbit. The bearer link alone is not enough: Orbit also requires a
              verified account using the exact invited email before the learner
              can accept.
            </p>
          </article>

          <article className="foundry-card">
            <div className="foundry-card-head">
              <div>
                <span className="foundry-card-eyebrow">Reversible by default</span>
                <h2>Safe replacement</h2>
              </div>
            </div>
            <p className="foundry-long-copy">
              Creating a replacement revokes the previous unused invitation.
              Accepted access is preserved as an auditable identity link rather
              than silently rewritten by email matching.
            </p>
          </article>
        </aside>
      </section>
    </div>
  );
}
