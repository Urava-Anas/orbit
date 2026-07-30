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
import { revokeOrbitActionKeyAction } from "./actions";
import styles from "./integrations.module.css";

export const metadata: Metadata = {
  title: "Connect ChatGPT to Orbit",
  robots: { index: false, follow: false },
};

const schemaUrl =
  "https://orbit-two-delta.vercel.app/orbit-gpt-actions.openapi.json";

export default async function FoundryIntegrationsPage() {
  const { supabase, workspace } = await requireFounderFoundry();
  const keys = await listOrbitActionKeys(supabase, workspace.id);
  const activeKeys = keys.filter(
    (key) =>
      !key.revoked_at &&
      (!key.expires_at || new Date(key.expires_at).getTime() > Date.now()),
  );

  return (
    <div className="foundry-page">
      <section className="foundry-page-title">
        <div>
          <span className="foundry-kicker">ChatGPT Plus · Custom GPT Actions</span>
          <h1>Connect ChatGPT to Orbit</h1>
          <p>
            Generate one private key, import Orbit&apos;s OpenAPI schema, and operate
            Foundry from a private Orbit Operator GPT.
          </p>
        </div>
        <a
          className="foundry-button foundry-button-primary"
          href={schemaUrl}
          rel="noreferrer"
          target="_blank"
        >
          Open schema
          <ExternalLink aria-hidden="true" size={17} />
        </a>
      </section>

      <section className="foundry-metric-grid" aria-label="Orbit GPT connection status">
        <article className="foundry-metric">
          <span className="foundry-metric-icon is-green">
            <ShieldCheck aria-hidden="true" size={20} />
          </span>
          <div>
            <small>Security model</small>
            <strong>Hashed</strong>
            <p>Only the SHA-256 key hash is stored.</p>
          </div>
        </article>
        <article className="foundry-metric">
          <span className="foundry-metric-icon is-blue">
            <Bot aria-hidden="true" size={20} />
          </span>
          <div>
            <small>GPT actions</small>
            <strong>8</strong>
            <p>Four read tools and four governed writes.</p>
          </div>
        </article>
        <article className="foundry-metric">
          <span className="foundry-metric-icon is-gold">
            <KeyRound aria-hidden="true" size={20} />
          </span>
          <div>
            <small>Active keys</small>
            <strong>{activeKeys.length}</strong>
            <p>Revoke any connection immediately.</p>
          </div>
        </article>
      </section>

      <section className="foundry-split-layout">
        <article className="foundry-card">
          <div className="foundry-card-head">
            <div>
              <span className="foundry-card-eyebrow">Step 1</span>
              <h2>Generate the private key</h2>
            </div>
            <KeyRound aria-hidden="true" size={20} />
          </div>
          <p>
            Orbit shows the plaintext key only once. ChatGPT sends it as a bearer
            credential; Orbit validates its hash, scope, expiry and revocation state.
          </p>
          <OrbitActionKeyManager />
        </article>

        <aside className="foundry-card">
          <div className="foundry-card-head">
            <div>
              <span className="foundry-card-eyebrow">Steps 2–5</span>
              <h2>Create Orbit Operator GPT</h2>
            </div>
            <Link2 aria-hidden="true" size={20} />
          </div>
          <ol className={styles.setupList}>
            <li>
              <CheckCircle2 aria-hidden="true" size={17} />
              Open ChatGPT → GPTs → Create.
            </li>
            <li>
              <CheckCircle2 aria-hidden="true" size={17} />
              Name it <strong>Orbit Operator</strong> and keep visibility set to Only me.
            </li>
            <li>
              <CheckCircle2 aria-hidden="true" size={17} />
              In Actions, import the schema URL shown above.
            </li>
            <li>
              <CheckCircle2 aria-hidden="true" size={17} />
              Choose API key → Bearer and paste the one-time Orbit key.
            </li>
            <li>
              <CheckCircle2 aria-hidden="true" size={17} />
              Test “Check Orbit health” before enabling write commands.
            </li>
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
            <h2>Orbit Operator keys</h2>
          </div>
          <ShieldCheck aria-hidden="true" size={20} />
        </div>
        {keys.length ? (
          <div className="foundry-attention-list">
            {keys.map((key) => {
              const inactive =
                Boolean(key.revoked_at) ||
                Boolean(
                  key.expires_at && new Date(key.expires_at).getTime() <= Date.now(),
                );
              return (
                <article className="foundry-attention-row" key={key.id}>
                  <span
                    className={`task-state ${inactive ? "task-state-cancelled" : "task-state-completed"}`}
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
                        title="Revoke this Orbit GPT connection"
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
          <p>No Orbit GPT key has been created yet.</p>
        )}
      </section>
    </div>
  );
}
