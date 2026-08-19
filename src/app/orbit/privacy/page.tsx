import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Orbit Privacy & Data Controls",
  description: "Privacy, security, retention and deletion information for Urava Orbit.",
};

export default function OrbitPrivacyPage() {
  return (
    <main className="legal-page">
      <article className="legal-card">
        <span className="eyebrow">Urava Orbit</span>
        <h1>Orbit privacy and data controls</h1>
        <p>
          Orbit processes organisation, account and workflow data only to provide the
          features a user or workspace enables. Tenant data is separated by workspace
          access controls and database row-level security.
        </p>

        <h2>Data Orbit processes</h2>
        <p>
          Depending on enabled modules, this may include account identity, organisation
          membership, leads and client records, projects, Foundry learning records,
          integration metadata, automation events and security/audit logs.
        </p>

        <h2>Connected services</h2>
        <p>
          OAuth tokens and API credentials are handled server-side and encrypted before
          storage. Orbit requests provider permissions for the selected integration and
          marks a connection ready only after the required capability has been verified.
        </p>

        <h2>Use and sharing</h2>
        <p>
          Orbit uses data to operate the requested workspace workflows, security controls
          and integrations. Data is sent to a connected provider only when that provider is
          needed for an authorised action. Orbit does not expose workspace data to another
          tenant through the application data layer.
        </p>

        <h2>Retention</h2>
        <p>
          Workspace data remains while the workspace is active unless it is deleted sooner.
          Security and operational records are retained only as needed for integrity,
          troubleshooting, legal obligations and abuse prevention. Provider credentials are
          revoked or removed when their connection is disconnected or the workspace is deleted.
        </p>

        <h2>Account deletion</h2>
        <p>
          Users can initiate permanent deletion from Orbit. Owned workspaces and their tenant
          records are deleted with the account. Historical records in another organisation
          may remain as business records while the deleted user attribution is removed.
        </p>
        <Link className="button button-danger" href="/account/delete">
          Delete Orbit account
        </Link>

        <h2>Security</h2>
        <p>
          Orbit uses authenticated sessions, tenant-scoped database policies, encrypted
          secrets, least-privilege service identities, audit trails, request quotas and
          governed approval paths for sensitive automation.
        </p>

        <h2>Your controls</h2>
        <p>
          You can disconnect integrations, revoke active sessions, reset credentials and
          delete your account from Orbit. Organisation owners control workspace membership
          and business records within their tenant.
        </p>

        <Link className="button button-primary" href="/login">
          Return to Orbit
        </Link>
      </article>
    </main>
  );
}
