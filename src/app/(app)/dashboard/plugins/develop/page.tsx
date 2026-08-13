import Link from "next/link";
import { requireWorkspace } from "@/lib/workspace";
import { getWorkspacePluginSubmissions, getWorkspacePublishers, isOrbitPlatformAdmin } from "@/lib/plugins/marketplace";
import { orbitPluginExample } from "@/lib/plugins/sdk";
import { createPluginPublisher, submitPluginManifest } from "./actions";
import styles from "./develop.module.css";

export default async function PluginDeveloperPage() {
  const { supabase, workspace, user, role } = await requireWorkspace();
  const [publishers, submissions, platformAdmin] = await Promise.all([
    getWorkspacePublishers(supabase, workspace.id),
    getWorkspacePluginSubmissions(supabase, workspace.id),
    isOrbitPlatformAdmin(user.id),
  ]);
  const canPublish = role === "owner" || role === "admin";

  return (
    <main className={styles.page}>
      <Link className={styles.back} href="/dashboard/plugins">← Plugin directory</Link>
      <section className={styles.hero}>
        <small>Orbit Plugin SDK v1</small>
        <h1>Developer portal</h1>
        <p>Register a publisher, validate a strict manifest and submit immutable versions for Orbit review. Approved plugins enter the marketplace; publishers never receive direct write access to the public catalog.</p>
        <div className={styles.links}>
          <a href="https://github.com/Urava-Anas/orbit/blob/main/docs/orbit-plugin-v1.md" target="_blank" rel="noreferrer">SDK documentation</a>
          <a href="https://github.com/Urava-Anas/orbit/blob/main/examples/orbit.plugin.json" target="_blank" rel="noreferrer">Example manifest</a>
          {platformAdmin ? <Link href="/dashboard/plugins/review">Marketplace review queue</Link> : null}
        </div>
      </section>

      <section className={styles.grid}>
        <article className={styles.panel}>
          <h2>Publisher identity</h2>
          <p>One organisation can maintain multiple publisher identities. Verification is controlled by Orbit review and cannot be self-granted.</p>
          <div className={styles.submissionList}>
            {publishers.map((publisher) => (
              <div className={styles.publisher} key={publisher.id}>
                <span><strong>{publisher.display_name}</strong><small>{publisher.slug}{publisher.website ? ` · ${publisher.website}` : ""}</small></span>
                <span className={styles.badge}>{publisher.verified ? "Verified" : publisher.status}</span>
              </div>
            ))}
          </div>
          {canPublish ? (
            <form className={styles.form} action={createPluginPublisher} style={{ marginTop: 12 }}>
              <label>Publisher name<input name="displayName" required maxLength={100} placeholder="Acme Labs" /></label>
              <label>Publisher slug<input name="publisherSlug" required maxLength={80} placeholder="acme-labs" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" /></label>
              <label>Website<input name="website" type="url" placeholder="https://example.com" /></label>
              <button className={styles.button} type="submit">Register publisher</button>
            </form>
          ) : null}
        </article>

        <article className={styles.panel}>
          <h2>Submit a plugin</h2>
          <p>Orbit validates the manifest again on the server and the database records its own canonical digest before the submission can enter review.</p>
          {canPublish && publishers.length ? (
            <form className={styles.form} action={submitPluginManifest}>
              <label>Publisher
                <select name="publisherId" required defaultValue={publishers[0]?.id}>
                  {publishers.filter((publisher) => publisher.status === "active").map((publisher) => <option key={publisher.id} value={publisher.id}>{publisher.display_name}</option>)}
                </select>
              </label>
              <label>orbit.plugin.json
                <textarea name="manifest" required defaultValue={JSON.stringify(orbitPluginExample, null, 2)} spellCheck={false} />
              </label>
              <button className={styles.button} type="submit">Validate & submit for review</button>
            </form>
          ) : <p>Register an active publisher before submitting a plugin.</p>}
        </article>
      </section>

      <section className={styles.panel}>
        <h2>Submission history</h2>
        <p>Submitted manifests cannot be edited. A change requires a new semantic version.</p>
        <div className={styles.submissionList}>
          {submissions.length ? submissions.map((submission) => (
            <div className={styles.submission} key={submission.id}>
              <span><strong>{submission.proposed_slug} · v{submission.proposed_version}</strong><small>Digest {submission.manifest_hash.slice(0, 12)}…{submission.review_notes ? ` · ${submission.review_notes}` : ""}</small></span>
              <span className={styles.status}>{submission.review_status.replaceAll("_", " ")}</span>
            </div>
          )) : <p>No plugin versions submitted yet.</p>}
        </div>
      </section>
    </main>
  );
}
