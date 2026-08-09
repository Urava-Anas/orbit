import type { Metadata } from "next";
import {
  Bot,
  CheckCircle2,
  ExternalLink,
  KeyRound,
  Link2,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { OrbitActionKeyManager } from "@/components/foundry/OrbitActionKeyManager";
import { formatFoundryDate, requireFounderFoundry } from "@/lib/foundry";
import { listOrbitActionKeys } from "@/lib/orbit-actions";
import { revokeOrbitActionKeyAction } from "../foundry/integrations/actions";
import styles from "../foundry/integrations/integrations.module.css";

export const metadata: Metadata = {
  title: "Connect · Orbit",
  robots: { index: false, follow: false },
};

const schemaUrl =
  "https://orbit-two-delta.vercel.app/orbit-gpt-actions.openapi.json";

export default async function OrbitConnectPage() {
  const { supabase, workspace } = await requireFounderFoundry();
  const keys = await listOrbitActionKeys(supabase, workspace.id);
  const activeKeys = keys.filter((key) => key.is_active);

  return (
    <div className="section-stack">
      <section className="section-head">
        <div>
          <span className="eyebrow">Organisation connections</span>
          <h1>Connect Orbit</h1>
          <p>
            Manage organisation-level connections here. Foundry no longer owns this
            section; every Orbit module can use approved integrations.
          </p>
        </div>
        <a className="button button-primary" href={schemaUrl} rel="noreferrer" target="_blank">
          Open Orbit schema
          <ExternalLink aria-hidden="true" size={16} />
        </a>
      </section>

      <section className="foundry-metric-grid" aria-label="Orbit connection status">
        <article className="foundry-metric">
          <span className="foundry-metric-icon is-green">
            <ShieldCheck aria-hidden="true" size={20} />
          </span>
          <div>
            <small>Security model</small>
            <strong>Hashed</strong>
            <p>Private action keys are stored as hashes.</p>
          </div>
        </article>
        <article className="foundry-metric">
          <span className="foundry-metric-icon is-blue">
            <Bot aria-hidden="true" size={20} />
          </span>
          <div>
            <small>Operator surface</small>
            <strong>Orbit</strong>
            <p>One governed connection layer for organisation workflows.</p>
          </div>
        </article>
        <article className="foundry-metric">
          <span className="foundry-metric-icon is-gold">
            <KeyRound aria-hidden="true" size={20} />
          </span>
          <div>
            <small>Active keys</small>
            <strong>{activeKeys.length}</strong>
            <p>Connections can be revoked immediately.</p>
          </div>
        </article>
      </section>

      <section className="foundry-split-layout">
        <article className="foundry-card">
          <div className="foundry-card-head">
            <div>
              <span className="foundry-card-eyebrow">Orbit Operator</span>
              <h2>Generate a private key</h2>
            </div>
            <KeyRound aria-hidden="true" size={20} />
          </div>
          <p>
            Orbit shows a plaintext key once. The system stores only the secure hash
            and checks its scope, expiry and revocation state on every action.
          </p>
          <OrbitActionKeyManager />
        </article>

        <aside className="foundry-card">
          <div className="foundry-card-head">
            <div>
              <span className="foundry-card-eyebrow">Connection recipe</span>
              <h2>Connect ChatGPT</h2>
            </div>
            <Link2 aria-hidden="true" size={20} />
          </div>
          <ol className={styles.setupList}>
            <li><CheckCircle2 aria-hidden="true" size={17} />Create a private Orbit Operator GPT.</li>
            <li><CheckCircle2 aria-hidden="true" size={17} />Import the Orbit OpenAPI schema.</li>
            <li><CheckCircle2 aria-hidden="true" size={17} />Choose API key → Bearer and paste the one-time key.</li>
            <li><CheckCircle2 aria-hidden="true" size={17} />Test a read action before enabling governed writes.</li>
          </ol>
          <div className={styles.tokenBox}>
            <div>
              <small>OpenAPI schema URL</small>
              <code>{schemaUrl}</code>
            </div>
          </div>
        </aside>
      </section>

      <section className="foundry-card">
        <div className="foundry-card-head">
          <div>
            <span className="foundry-card-eyebrow">Access control</span>
            <h2>Organisation connection keys</h2>
          </div>
          <ShieldCheck aria-hidden="true" size={20} />
        </div>
        {keys.length ? (
          <div className="foundry-attention-list">
            {keys.map((key) => {
              const inactive = !key.is_active;
              return (
                <article className="foundry-attention-row" key={key.id}>
                  <span
                    className={`task-state ${
                      inactive ? "task-state-cancelled" : "task-state-completed"
                    }`}
                  >
                    {key.revoked_at ? "revoked" : inactive ? "expired" : "active"}
                  </span>
                  <div>
                    <strong>{key.name}</strong>
                    <p>
                      {key.token_prefix}… · Created {formatFoundryDate(key.created_at)}
                      {key.last_used_at
                        ? ` · Last used ${formatFoundryDate(key.last_used_at)}`
                        : " · Not used yet"}
                    </p>
                  </div>
                  {!key.revoked_at ? (
                    <form action={revokeOrbitActionKeyAction}>
                      <input name="keyId" type="hidden" value={key.id} />
                      <button
                        className="foundry-icon-link"
                        title="Revoke this Orbit connection"
                        type="submit"
                      >
                        <Trash2 aria-hidden="true" size={16} />
                      </button>
                    </form>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : (
          <p>No Orbit connection key has been created yet.</p>
        )}
      </section>
    </div>
  );
}
