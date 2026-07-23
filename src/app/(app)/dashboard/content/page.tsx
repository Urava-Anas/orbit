import type { Metadata } from "next";
import { MessageSquareText } from "lucide-react";
import {
  createContentDraft,
  updateContentStatus,
} from "@/app/(app)/dashboard/actions";
import { EmptyState } from "@/components/EmptyState";
import { Notice } from "@/components/Notice";
import { PageHeader } from "@/components/PageHeader";
import { StatusPill } from "@/components/StatusPill";
import { humanize } from "@/lib/format";
import type { ContentDraft, Proof } from "@/lib/types";
import { requireWorkspace } from "@/lib/workspace";

export const metadata: Metadata = {
  title: "Content",
  robots: { index: false, follow: false },
};

type PageProps = {
  searchParams: Promise<{ error?: string; notice?: string }>;
};

export default async function ContentPage({ searchParams }: PageProps) {
  const { supabase, workspace } = await requireWorkspace();
  const params = await searchParams;
  const [proofsResult, contentResult] = await Promise.all([
    supabase
      .from("proofs")
      .select("id, title")
      .eq("workspace_id", workspace.id)
      .eq("status", "approved")
      .order("title"),
    supabase
      .from("content_drafts")
      .select(
        "id, proof_id, channel, title, body, status, created_at, proofs(title)",
      )
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: false }),
  ]);
  const approvedProofs = (proofsResult.data ?? []) as Pick<Proof, "id" | "title">[];
  const drafts = (contentResult.data ?? []) as unknown as ContentDraft[];

  return (
    <div className="page">
      <PageHeader
        kicker="Distribution control"
        title="Content"
        description="Content begins with approved proof and ends with human review. Orbit drafts and tracks; it does not pretend to publish."
      />
      <Notice error={params.error} notice={params.notice} />

      <details className="create-panel">
        <summary>Create draft from proof</summary>
        <form action={createContentDraft}>
          {approvedProofs.length ? (
            <>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="content-proof">Approved proof</label>
                  <select id="content-proof" name="proofId" required>
                    {approvedProofs.map((proof) => (
                      <option key={proof.id} value={proof.id}>
                        {proof.title}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="content-channel">Channel</label>
                  <select id="content-channel" name="channel" defaultValue="linkedin">
                    {["website", "linkedin", "facebook", "instagram", "whatsapp"].map(
                      (channel) => (
                        <option value={channel} key={channel}>
                          {humanize(channel)}
                        </option>
                      ),
                    )}
                  </select>
                </div>
                <div className="field field-wide">
                  <label htmlFor="content-title">Title</label>
                  <input
                    id="content-title"
                    name="title"
                    minLength={2}
                    maxLength={180}
                    required
                  />
                </div>
                <div className="field field-wide">
                  <label htmlFor="content-body">Draft</label>
                  <textarea
                    id="content-body"
                    name="body"
                    minLength={10}
                    maxLength={8000}
                    required
                    placeholder="Problem → evidence → mechanism → limit → next action"
                  />
                </div>
              </div>
              <div className="form-actions">
                <button className="button button-primary" type="submit">
                  Save draft
                </button>
              </div>
            </>
          ) : (
            <div className="notice">
              Approve a proof asset first. Orbit will not turn unverified claims into
              marketing.
            </div>
          )}
        </form>
      </details>

      <section className="panel">
        <div className="panel-head">
          <h2>Editorial queue</h2>
          <span>{drafts.length} drafts</span>
        </div>
        {drafts.length ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Draft</th>
                  <th>Proof source</th>
                  <th>Channel</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {drafts.map((draft) => (
                  <tr key={draft.id}>
                    <td>
                      <span className="table-primary">
                        <strong>{draft.title}</strong>
                        <small>{draft.body}</small>
                      </span>
                    </td>
                    <td>{draft.proofs?.title ?? "Unknown proof"}</td>
                    <td>{humanize(draft.channel)}</td>
                    <td>
                      <form className="inline-form" action={updateContentStatus}>
                        <input type="hidden" name="id" value={draft.id} />
                        <StatusPill value={draft.status} />
                        <select
                          aria-label={`Update ${draft.title} status`}
                          name="status"
                          defaultValue={draft.status}
                        >
                          {[
                            "draft",
                            "review",
                            "approved",
                            "published",
                            "archived",
                          ].map((status) => (
                            <option value={status} key={status}>
                              {humanize(status)}
                            </option>
                          ))}
                        </select>
                        <button className="button button-quiet" type="submit">
                          Update
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={MessageSquareText}
            title="No content drafts"
            description="Approve real proof, then turn it into one evidence-rich source asset. Direct publishing is intentionally not connected."
          />
        )}
      </section>
    </div>
  );
}

