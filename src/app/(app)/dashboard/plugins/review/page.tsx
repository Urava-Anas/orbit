import Link from "next/link";
import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/workspace";
import { getMarketplaceReviewQueue, isOrbitPlatformAdmin } from "@/lib/plugins/marketplace";
import { safeParsePluginManifest } from "@/lib/plugins/contracts";
import { approvePluginSubmission, rejectPluginSubmission } from "./actions";
import styles from "../develop/develop.module.css";

export default async function PluginReviewPage() {
  const { user } = await requireWorkspace();
  if (!(await isOrbitPlatformAdmin(user.id))) notFound();
  const queue = await getMarketplaceReviewQueue(user.id);

  return (
    <main className={styles.page}>
      <Link className={styles.back} href="/dashboard/plugins">← Plugin directory</Link>
      <section className={styles.hero}>
        <small>Orbit platform review</small>
        <h1>Marketplace review queue</h1>
        <p>Only approved manifests can enter the public catalog. Review permissions and the remote runtime boundary before promotion. Approval writes an immutable version snapshot.</p>
      </section>

      <section className={styles.submissionList}>
        {queue.length ? queue.map((submission) => {
          const parsed = safeParsePluginManifest(submission.manifest);
          const manifest = parsed.success ? parsed.data : null;
          const publisherRaw = submission.plugin_publishers;
          const publisher = Array.isArray(publisherRaw) ? publisherRaw[0] : publisherRaw;
          return (
            <article className={styles.panel} key={submission.id}>
              <h2>{submission.proposed_slug} · v{submission.proposed_version}</h2>
              <p>{publisher && typeof publisher === "object" && "display_name" in publisher ? String(publisher.display_name) : "Unknown publisher"} · Digest {submission.manifest_hash.slice(0, 16)}…</p>
              {manifest ? (
                <>
                  <div className={styles.submissionList}>
                    <div className={styles.submission}><span><strong>Permissions</strong><small>{manifest.permissions.join(" · ") || "None"}</small></span><span className={styles.status}>{manifest.permissions.length}</span></div>
                    <div className={styles.submission}><span><strong>Connected apps</strong><small>{manifest.apps.map((app) => `${app.provider}${app.required ? " (required)" : " (optional)"}`).join(" · ") || "None"}</small></span><span className={styles.status}>{manifest.apps.length}</span></div>
                    <div className={styles.submission}><span><strong>MCP runtime</strong><small>{manifest.mcp?.url ?? "No remote runtime"}</small></span><span className={styles.status}>{manifest.mcp ? "remote" : "local"}</span></div>
                  </div>
                  <form className={styles.form} action={approvePluginSubmission} style={{ marginTop: 12 }}>
                    <input type="hidden" name="submissionId" value={submission.id} />
                    <label>Review notes<textarea name="reviewNotes" style={{ minHeight: 90 }} maxLength={4000} placeholder="Verified manifest, permission boundary and runtime endpoint." /></label>
                    <button className={styles.button} type="submit">Approve & publish immutable version</button>
                  </form>
                  <form className={styles.form} action={rejectPluginSubmission} style={{ marginTop: 10 }}>
                    <input type="hidden" name="submissionId" value={submission.id} />
                    <label>Rejection reason<textarea name="reviewNotes" required style={{ minHeight: 70 }} minLength={3} maxLength={4000} placeholder="Explain what must change before resubmission." /></label>
                    <button className={styles.button} type="submit">Reject submission</button>
                  </form>
                </>
              ) : <p>Manifest validation failed. Reject this submission and require a new version.</p>}
            </article>
          );
        }) : <section className={styles.panel}><h2>Queue clear</h2><p>No plugin versions are waiting for Orbit review.</p></section>}
      </section>
    </main>
  );
}
