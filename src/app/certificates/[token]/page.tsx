import type { Metadata } from "next";
import Link from "next/link";
import { Award, CheckCircle2, Download, ShieldAlert, ShieldCheck } from "lucide-react";
import { notFound } from "next/navigation";
import { verifyFoundryCertificate } from "@/lib/certificates";

export const metadata: Metadata = {
  title: "Verify Foundry Certificate",
  robots: { index: false, follow: false },
};

type Props = {
  params: Promise<{ token: string }>;
};

function issuedDate(value: string) {
  return new Intl.DateTimeFormat("en-PK", {
    timeZone: "Asia/Karachi",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}

export default async function CertificateVerificationPage({ params }: Props) {
  const { token } = await params;
  const certificate = await verifyFoundryCertificate(token);
  if (!certificate) notFound();
  const valid = certificate.status === "issued";

  return (
    <main className="certificate-page">
      <section className={`certificate-sheet ${valid ? "" : "is-revoked"}`}>
        <header>
          <span className="certificate-mark">
            <Award aria-hidden="true" size={30} />
          </span>
          <div>
            <small>Orbit · Urava Foundry</small>
            <strong>Verified achievement record</strong>
          </div>
          <span className={`certificate-validity ${valid ? "is-valid" : "is-revoked"}`}>
            {valid ? (
              <CheckCircle2 aria-hidden="true" size={16} />
            ) : (
              <ShieldAlert aria-hidden="true" size={16} />
            )}
            {valid ? "Valid" : "Revoked"}
          </span>
        </header>

        <div className="certificate-body">
          <span className="certificate-kicker">Certificate of achievement</span>
          <h1>{certificate.title}</h1>
          <p>This verified record is presented to</p>
          <h2>{certificate.student_name}</h2>
          <span className="certificate-student-id">{certificate.foundry_id}</span>
          <p className="certificate-statement">{certificate.statement}</p>
        </div>

        <footer>
          <span>
            <small>Certificate number</small>
            <strong>{certificate.certificate_number}</strong>
          </span>
          <span>
            <small>Issued</small>
            <strong>{issuedDate(certificate.issued_at)}</strong>
          </span>
          <span>
            <small>Verification</small>
            <strong>Orbit public record</strong>
          </span>
        </footer>

        <div className="certificate-disclaimer">
          <ShieldCheck aria-hidden="true" size={16} />
          This records verified training evidence. It does not guarantee a job,
          client project, or income.
        </div>
      </section>

      <div className="certificate-actions">
        <Link href={`/certificates/${token}/pdf`}>
          <Download aria-hidden="true" size={17} />
          Download PDF
        </Link>
        <Link href="/login">Open Orbit</Link>
      </div>
    </main>
  );
}
