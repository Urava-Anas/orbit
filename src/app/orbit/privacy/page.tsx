import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Orbit Operator Privacy",
  description: "Privacy and security information for the private Orbit Operator GPT connection.",
};

export default function OrbitOperatorPrivacyPage() {
  return (
    <main className="legal-page">
      <article className="legal-card">
        <span className="eyebrow">Urava Orbit</span>
        <h1>Orbit Operator privacy and security</h1>
        <p>
          Orbit Operator is a private founder connection used to read and operate
          Urava&apos;s own Orbit and Foundry systems.
        </p>

        <h2>Authentication</h2>
        <p>
          The connection uses a revocable bearer key. Orbit stores only a SHA-256
          hash and a short display prefix; the plaintext key is shown once when it
          is generated.
        </p>

        <h2>Data processed</h2>
        <p>
          Depending on the action, Orbit may return or update Foundry student,
          task, submission, progress and integration records. The connection is
          intended only for the authorized Urava founder account.
        </p>

        <h2>Audit and retention</h2>
        <p>
          Every action records its operation, request ID, result, status and
          timestamp. Sensitive task instructions and submission feedback are not
          copied into the action-call summary log.
        </p>

        <h2>Control</h2>
        <p>
          The founder can revoke a key immediately from Orbit. Revoked or expired
          keys cannot execute actions.
        </p>

        <h2>Write safeguards</h2>
        <p>
          V1 exposes only specific governed actions. It does not expose user
          deletion, role changes, raw SQL, infrastructure credentials or database
          administration.
        </p>

        <Link className="button button-primary" href="/login">
          Return to Orbit
        </Link>
      </article>
    </main>
  );
}
