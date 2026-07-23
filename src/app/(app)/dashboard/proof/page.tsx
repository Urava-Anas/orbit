import type { Metadata } from "next";
import { FileCheck2 } from "lucide-react";
import {
  createProof,
  updateProofStatus,
} from "@/app/(app)/dashboard/actions";
import { EmptyState } from "@/components/EmptyState";
import { Notice } from "@/components/Notice";
import { PageHeader } from "@/components/PageHeader";
import { StatusPill } from "@/components/StatusPill";
import { humanize } from "@/lib/format";
import type { Project, Proof } from "@/lib/types";
import { requireWorkspace } from "@/lib/workspace";

export const metadata: Metadata = {
  title: "Proof",
  robots: { index: false, follow: false },
};

type PageProps = {
  searchParams: Promise<{ error?: string; notice?: string }>;
};

export default async function ProofPage({ searchParams }: PageProps) {
  const { supabase, workspace } = await requireWorkspace();
  const params = await searchParams;
  const [projectsResult, proofsResult] = await Promise.all([
    supabase
      .from("projects")
      .select("id, name")
      .eq("workspace_id", workspace.id)
      .order("name"),
    supabase
      .from("proofs")
      .select(
        "id, project_id, title, result, evidence_url, permission_scope, status, created_at, projects(name)",
      )
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: false }),
  ]);
  const projects = (projectsResult.data ?? []) as Pick<Project, "id" | "name">[];
  const proofs = (proofsResult.data ?? []) as unknown as Proof[];

  return (
    <div className="page">
      <PageHeader
        kicker="Evidence control"
        title="Proof"
        description="A result becomes usable proof only when evidence exists and permission is explicit. Private means private."
      />
      <Notice error={params.error} notice={params.notice} />

      <details className="create-panel">
        <summary>Capture proof</summary>
        <form action={createProof}>
          {projects.length ? (
            <>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="proof-project">Project</label>
                  <select id="proof-project" name="projectId" required>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="proof-title">Proof title</label>
                  <input
                    id="proof-title"
                    name="title"
                    minLength={2}
                    maxLength={180}
                    required
                  />
                </div>
                <div className="field field-wide">
                  <label htmlFor="proof-result">Measured or verified result</label>
                  <textarea
                    id="proof-result"
                    name="result"
                    minLength={10}
                    maxLength={4000}
                    required
                    placeholder="Describe what changed, how it was measured, and any limits."
                  />
                </div>
                <div className="field field-wide">
                  <label htmlFor="proof-evidence">Evidence URL</label>
                  <input
                    id="proof-evidence"
                    name="evidenceUrl"
                    type="url"
                    maxLength={500}
                    placeholder="https://"
                  />
                </div>
                <div className="field">
                  <label htmlFor="proof-permission">Permission scope</label>
                  <select
                    id="proof-permission"
                    name="permissionScope"
                    defaultValue="private"
                  >
                    <option value="private">Private</option>
                    <option value="anonymous">Anonymous use approved</option>
                    <option value="public">Public use approved</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="proof-status">Review state</label>
                  <select id="proof-status" name="status" defaultValue="draft">
                    <option value="draft">Draft</option>
                    <option value="approved">Approved</option>
                    <option value="published">Published</option>
                  </select>
                </div>
              </div>
              <div className="form-actions">
                <button className="button button-primary" type="submit">
                  Save proof
                </button>
              </div>
            </>
          ) : (
            <div className="notice">
              Complete a real project record before creating proof.
            </div>
          )}
        </form>
      </details>

      <section className="panel">
        <div className="panel-head">
          <h2>Proof library</h2>
          <span>{proofs.length} assets</span>
        </div>
        {proofs.length ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Proof</th>
                  <th>Project</th>
                  <th>Permission</th>
                  <th>Evidence</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {proofs.map((proof) => (
                  <tr key={proof.id}>
                    <td>
                      <span className="table-primary">
                        <strong>{proof.title}</strong>
                        <small>{proof.result}</small>
                      </span>
                    </td>
                    <td>{proof.projects?.name ?? "Unknown project"}</td>
                    <td>{humanize(proof.permission_scope)}</td>
                    <td>
                      {proof.evidence_url ? (
                        <a
                          className="text-link"
                          href={proof.evidence_url}
                          rel="noreferrer"
                          target="_blank"
                        >
                          Open evidence
                        </a>
                      ) : (
                        "Not linked"
                      )}
                    </td>
                    <td>
                      <form className="inline-form" action={updateProofStatus}>
                        <input type="hidden" name="id" value={proof.id} />
                        <StatusPill value={proof.status} />
                        <select
                          aria-label={`Update ${proof.title} status`}
                          name="status"
                          defaultValue={proof.status}
                        >
                          {["draft", "approved", "published"].map((status) => (
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
            icon={FileCheck2}
            title="No proof assets"
            description="Proof starts after delivery. Capture evidence, result, and permission—never a marketing claim with no source."
          />
        )}
      </section>
    </div>
  );
}

