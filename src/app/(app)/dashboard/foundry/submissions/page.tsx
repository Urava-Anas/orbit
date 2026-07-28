import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowUpRight,
  CheckCircle2,
  ExternalLink,
  MessageSquareText,
  RotateCcw,
  Send,
} from "lucide-react";
import {
  EmptyFoundryState,
  FoundryNotice,
  HealthBadge,
} from "@/components/foundry/FoundryUI";
import { formatFoundryDate, listFoundrySubmissions } from "@/lib/foundry";
import { reviewFoundrySubmission } from "../actions";

export const metadata: Metadata = {
  title: "Foundry Submissions",
  robots: { index: false, follow: false },
};

type Props = {
  searchParams: Promise<{ notice?: string; error?: string }>;
};

export default async function FoundrySubmissionsPage({ searchParams }: Props) {
  const messages = await searchParams;
  const { submissions } = await listFoundrySubmissions();
  const pending = submissions.filter((submission) =>
    ["submitted", "under_review"].includes(submission.status),
  );
  const reviewed = submissions.filter(
    (submission) => !["submitted", "under_review"].includes(submission.status),
  );

  return (
    <div className="foundry-page">
      <FoundryNotice error={messages.error} notice={messages.notice} />
      <section className="foundry-page-title">
        <div>
          <span className="foundry-kicker">Feedback loop</span>
          <h1>Submissions</h1>
          <p>Simple feedback, clear revision, evidence-based score.</p>
        </div>
        <span className="foundry-title-stat">
          <Send aria-hidden="true" size={19} />
          {pending.length} awaiting review
        </span>
      </section>

      {pending.length ? (
        <section className="submission-review-grid">
          {pending.map((submission) => (
            <article className="foundry-card submission-review-card" key={submission.id}>
              <div className="submission-review-head">
                <div className="attendance-student-identity">
                  <span className="foundry-avatar is-small">
                    {(submission.foundry_students?.full_name ?? "S")
                      .split(" ")
                      .slice(0, 2)
                      .map((part) => part[0])
                      .join("")
                      .toUpperCase()}
                  </span>
                  <div>
                    <strong>{submission.foundry_students?.full_name ?? "Student"}</strong>
                    <small>{submission.foundry_students?.foundry_id}</small>
                  </div>
                  <HealthBadge
                    health={submission.foundry_students?.health_status ?? "yellow"}
                  />
                </div>
                <span className={`task-state task-state-${submission.status}`}>
                  {submission.status.replaceAll("_", " ")}
                </span>
              </div>
              <div className="submission-work">
                <span>Task</span>
                <h2>
                  {submission.foundry_task_assignments?.foundry_tasks?.title ??
                    "Submitted task"}
                </h2>
                <p>{submission.student_note ?? "Student note nahi diya."}</p>
                <time dateTime={submission.submitted_at}>
                  Submitted {formatFoundryDate(submission.submitted_at)}
                </time>
                {submission.submission_url ? (
                  <a
                    className="foundry-text-link"
                    href={submission.submission_url}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Open work <ExternalLink aria-hidden="true" size={14} />
                  </a>
                ) : (
                  <span className="submission-no-link">
                    Link nahi — note / in-class evidence review karein.
                  </span>
                )}
              </div>
              <form action={reviewFoundrySubmission} className="foundry-form">
                <input name="submissionId" type="hidden" value={submission.id} />
                <label>
                  Roman Urdu feedback
                  <textarea
                    name="feedback"
                    placeholder="Pehla step acha hai. Ab sirf heading ka size aur spacing improve karke dobara submit karein."
                    required
                    rows={4}
                  />
                </label>
                <label>
                  Evidence score
                  <input
                    defaultValue="70"
                    max="100"
                    min="0"
                    name="score"
                    required
                    type="number"
                  />
                </label>
                <div className="submission-review-actions">
                  <button
                    className="foundry-button foundry-button-soft"
                    name="status"
                    type="submit"
                    value="revision_required"
                  >
                    <RotateCcw aria-hidden="true" size={15} />
                    Send revision
                  </button>
                  <button
                    className="foundry-button foundry-button-dark"
                    name="status"
                    type="submit"
                    value="accepted"
                  >
                    <CheckCircle2 aria-hidden="true" size={15} />
                    Accept work
                  </button>
                </div>
              </form>
            </article>
          ))}
        </section>
      ) : (
        <EmptyFoundryState
          title="Review queue clear hai"
          detail="New student submission yahan automatically aayegi."
          href="/dashboard/foundry/tasks"
          action="Open tasks"
        />
      )}

      <section className="foundry-card">
        <div className="foundry-card-head">
          <div>
            <span className="foundry-card-eyebrow">Recent decisions</span>
            <h2>Reviewed work</h2>
          </div>
          <MessageSquareText aria-hidden="true" size={20} />
        </div>
        {reviewed.length ? (
          <div className="foundry-data-list">
            {reviewed.map((submission) => (
              <Link
                className="foundry-data-row"
                href={`/dashboard/foundry/students/${submission.student_id}`}
                key={submission.id}
              >
                <span className={`task-state task-state-${submission.status}`}>
                  {submission.status.replaceAll("_", " ")}
                </span>
                <div>
                  <strong>
                    {submission.foundry_students?.full_name} ·{" "}
                    {submission.foundry_task_assignments?.foundry_tasks?.title}
                  </strong>
                  <p>{submission.feedback ?? "Reviewed"}</p>
                </div>
                <b>{submission.score ?? "—"}/100</b>
                <ArrowUpRight aria-hidden="true" size={15} />
              </Link>
            ))}
          </div>
        ) : (
          <EmptyFoundryState
            title="No reviewed work yet"
            detail="First decision ke baad feedback history yahan rahegi."
          />
        )}
      </section>
    </div>
  );
}
