import type { Metadata } from "next";
import Link from "next/link";
import {
  BellRing,
  Check,
  CircleAlert,
  CircleDashed,
  DatabaseZap,
  ExternalLink,
  Link2,
  Mail,
  MessageCircle,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Sparkles,
  TestTubeDiagonal,
  UserRoundCheck,
} from "lucide-react";
import { FoundryActionButton } from "@/components/foundry/FoundryActionButton";
import { FoundryNotice } from "@/components/foundry/FoundryUI";
import { getFoundryIntegrationHealth } from "@/lib/foundry-integrations/config";
import {
  formatFoundryDate,
  getFoundryOperations,
} from "@/lib/foundry";
import {
  queueFoundryFullSync,
  recordFoundryDailyIssue,
  runFoundryWorkerNow,
  updateFoundryDeliveryPreferences,
} from "../actions";

export const metadata: Metadata = {
  title: "Foundry Operations",
  robots: { index: false, follow: false },
};

type Props = {
  searchParams: Promise<{ notice?: string; error?: string }>;
};

type CheckpointValue = string | null | undefined;

function Checkpoint({
  value,
  applicable = true,
  blocked = false,
  label,
}: {
  value: CheckpointValue;
  applicable?: boolean;
  blocked?: boolean;
  label: string;
}) {
  if (blocked) {
    return (
      <span className="ops-checkpoint is-blocked" title={`${label}: account blocked`}>
        <CircleAlert aria-hidden="true" size={15} />
        <span className="sr-only">{label}: blocked</span>
      </span>
    );
  }
  if (!applicable) {
    return (
      <span className="ops-checkpoint is-na" title={`${label}: not applicable today`}>
        —
        <span className="sr-only">{label}: not applicable today</span>
      </span>
    );
  }
  return value ? (
    <span className="ops-checkpoint is-complete" title={`${label}: complete`}>
      <Check aria-hidden="true" size={15} />
      <span className="sr-only">{label}: complete</span>
    </span>
  ) : (
    <span className="ops-checkpoint is-pending" title={`${label}: pending`}>
      <CircleDashed aria-hidden="true" size={15} />
      <span className="sr-only">{label}: pending</span>
    </span>
  );
}

function channelState(
  configured: boolean,
  enabled: boolean,
  label: string,
) {
  if (!configured) return `${label} needs server credentials`;
  if (!enabled) return `${label} ready · no student consent yet`;
  return `${label} live for consented students`;
}

export default async function FoundryOperationsPage({
  searchParams,
}: Props) {
  const messages = await searchParams;
  const data = await getFoundryOperations();
  const integration = getFoundryIntegrationHealth();
  const activeStudents = data.students.filter(
    (student) =>
      !["inactive", "graduated", "rejected"].includes(
        student.lifecycle_status,
      ),
  );
  const checkByStudent = new Map(
    data.checks.map((check) => [check.student_id, check]),
  );
  const preferenceByStudent = new Map(
    data.preferences.map((preference) => [
      preference.student_id,
      preference,
    ]),
  );
  const recordsByStudent = new Map(
    activeStudents.map((student) => [
      student.id,
      data.externalRecords.filter((record) => record.student_id === student.id),
    ]),
  );
  const connectedCount = activeStudents.filter(
    (student) => student.auth_user_id,
  ).length;
  const consentedEmail = data.preferences.filter(
    (preference) => preference.email_enabled,
  ).length;
  const consentedWhatsApp = data.preferences.filter(
    (preference) => preference.whatsapp_enabled,
  ).length;
  const pendingOutbox = data.outbox.filter((event) =>
    ["pending", "processing", "failed"].includes(event.status),
  ).length;
  const failedDeliveries = data.deliveries.filter(
    (delivery) => delivery.status === "failed",
  ).length;

  function hasTask(studentId: string) {
    return data.activeAssignments.some(
      (assignment) => assignment.student_id === studentId,
    );
  }

  function hasFeedback(studentId: string) {
    return data.reviewedSubmissions.some(
      (submission) => submission.student_id === studentId,
    );
  }

  function hasClass(department: string) {
    return data.todayClasses.some(
      (item) => !item.department || item.department === department,
    );
  }

  function rowComplete(
    studentId: string,
    department: string,
    connected: boolean,
  ) {
    const check = checkByStudent.get(studentId);
    if (!connected || !check?.portal_opened_at) return false;
    if (hasTask(studentId) && !check.task_opened_at) return false;
    if (hasTask(studentId) && !check.submission_tested_at) return false;
    if (hasFeedback(studentId) && !check.feedback_viewed_at) return false;
    if (hasClass(department) && !check.attendance_recorded_at) return false;
    return !check.issue_code || Boolean(check.resolved_at);
  }

  const fullyTested = activeStudents.filter((student) =>
    rowComplete(
      student.id,
      student.department,
      Boolean(student.auth_user_id),
    ),
  ).length;

  return (
    <div className="foundry-page ops-page">
      <FoundryNotice error={messages.error} notice={messages.notice} />
      <section className="foundry-page-title">
        <div>
          <span className="foundry-kicker">Final 7 command</span>
          <h1>Production operations</h1>
          <p>
            Real student checks, account readiness, consented delivery, durable
            sync, Studio review and certificate evidence in one place.
          </p>
        </div>
        <Link className="foundry-button foundry-button-light" href="/dashboard/foundry/more">
          <Settings2 aria-hidden="true" size={16} />
          System settings
        </Link>
      </section>

      <section className="ops-metric-grid" aria-label="Foundry completion metrics">
        <article>
          <UserRoundCheck aria-hidden="true" size={20} />
          <span>
            <strong>
              {connectedCount}/{activeStudents.length}
            </strong>
            <small>Accounts connected</small>
          </span>
        </article>
        <article>
          <TestTubeDiagonal aria-hidden="true" size={20} />
          <span>
            <strong>
              {fullyTested}/{activeStudents.length}
            </strong>
            <small>Full daily loop today</small>
          </span>
        </article>
        <article>
          <BellRing aria-hidden="true" size={20} />
          <span>
            <strong>{consentedEmail + consentedWhatsApp}</strong>
            <small>Consented channels</small>
          </span>
        </article>
        <article>
          <DatabaseZap aria-hidden="true" size={20} />
          <span>
            <strong>{pendingOutbox}</strong>
            <small>Durable events queued</small>
          </span>
        </article>
        <article className={failedDeliveries ? "is-warning" : ""}>
          <ShieldCheck aria-hidden="true" size={20} />
          <span>
            <strong>{failedDeliveries}</strong>
            <small>Retryable delivery failures</small>
          </span>
        </article>
      </section>

      <section className="foundry-card ops-daily-card">
        <div className="foundry-card-head">
          <div>
            <span className="foundry-card-eyebrow">Real use · {data.today}</span>
            <h2>Every-student daily test</h2>
          </div>
          <TestTubeDiagonal aria-hidden="true" size={20} />
        </div>
        <p className="foundry-long-copy">
          Checks turn green only from real portal opens, task views,
          submissions, feedback views and saved attendance. A dash means that
          step is not applicable today.
        </p>
        <div className="ops-table-wrap">
          <table className="ops-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Account</th>
                <th>Portal</th>
                <th>Task</th>
                <th>Submit</th>
                <th>Feedback</th>
                <th>Attend</th>
                <th>Issue</th>
              </tr>
            </thead>
            <tbody>
              {activeStudents.map((student) => {
                const check = checkByStudent.get(student.id);
                const connected = Boolean(student.auth_user_id);
                const accountState = connected
                  ? "Connected"
                  : student.email
                    ? "Ready after sign-in"
                    : "Missing email";
                return (
                  <tr key={student.id}>
                    <td>
                      <strong>{student.full_name}</strong>
                      <small>{student.foundry_id}</small>
                    </td>
                    <td>
                      <span
                        className={`ops-account-state ${
                          connected
                            ? "is-connected"
                            : student.email
                              ? "is-ready"
                              : "is-blocked"
                        }`}
                      >
                        {connected ? (
                          <Link2 aria-hidden="true" size={13} />
                        ) : (
                          <CircleAlert aria-hidden="true" size={13} />
                        )}
                        {accountState}
                      </span>
                    </td>
                    <td>
                      <Checkpoint
                        blocked={!connected}
                        label="Portal"
                        value={check?.portal_opened_at}
                      />
                    </td>
                    <td>
                      <Checkpoint
                        applicable={hasTask(student.id)}
                        blocked={!connected}
                        label="Task"
                        value={check?.task_opened_at}
                      />
                    </td>
                    <td>
                      <Checkpoint
                        applicable={hasTask(student.id)}
                        blocked={!connected}
                        label="Submission"
                        value={check?.submission_tested_at}
                      />
                    </td>
                    <td>
                      <Checkpoint
                        applicable={hasFeedback(student.id)}
                        blocked={!connected}
                        label="Feedback"
                        value={check?.feedback_viewed_at}
                      />
                    </td>
                    <td>
                      <Checkpoint
                        applicable={hasClass(student.department)}
                        blocked={!connected}
                        label="Attendance"
                        value={check?.attendance_recorded_at}
                      />
                    </td>
                    <td>
                      {check?.issue_code && !check.resolved_at ? (
                        <span className="ops-issue" title={check.issue_note ?? ""}>
                          {check.issue_code.replaceAll("_", " ")}
                        </span>
                      ) : (
                        <span className="ops-clear">Clear</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <form action={recordFoundryDailyIssue} className="ops-issue-form">
          <input name="checkDate" type="hidden" value={data.today} />
          <label>
            Student
            <select name="studentId" required>
              <option value="">Select</option>
              {activeStudents.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.foundry_id} · {student.full_name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Issue
            <select name="issueCode" required>
              <option value="login">Login</option>
              <option value="account_link">Account link</option>
              <option value="task">Task</option>
              <option value="submission">Submission</option>
              <option value="feedback">Feedback</option>
              <option value="attendance">Attendance</option>
              <option value="device">Device</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label className="is-wide">
            Founder note
            <input
              maxLength={1000}
              name="issueNote"
              placeholder="What failed, or how it was resolved"
            />
          </label>
          <label className="ops-checkbox">
            <input name="resolved" type="checkbox" />
            Resolved
          </label>
          <FoundryActionButton
            className="foundry-button foundry-button-dark"
            pendingLabel="Saving…"
          >
            Save test note
          </FoundryActionButton>
        </form>
      </section>

      <section className="foundry-split-layout ops-integration-layout">
        <article className="foundry-card">
          <div className="foundry-card-head">
            <div>
              <span className="foundry-card-eyebrow">Durable worker</span>
              <h2>Delivery & background sync</h2>
            </div>
            <RefreshCw aria-hidden="true" size={20} />
          </div>
          <div className="ops-provider-list">
            {[
              {
                name: "Airtable",
                configured: integration.airtable,
                detail: "Roster upsert by permanent UFS ID",
              },
              {
                name: "Notion",
                configured: integration.notion,
                detail: "Page upsert by Airtable Record ID",
              },
              {
                name: "Email",
                configured: integration.email,
                detail: channelState(
                  integration.email,
                  consentedEmail > 0,
                  "Email",
                ),
              },
              {
                name: "WhatsApp",
                configured: integration.whatsapp,
                detail: channelState(
                  integration.whatsapp,
                  consentedWhatsApp > 0,
                  "WhatsApp",
                ),
              },
            ].map((provider) => (
              <div key={provider.name}>
                <span
                  className={provider.configured ? "is-ready" : "is-missing"}
                />
                <strong>{provider.name}</strong>
                <small>{provider.detail}</small>
              </div>
            ))}
          </div>
          <div className="ops-action-row">
            <form action={queueFoundryFullSync}>
              <FoundryActionButton
                className="foundry-button foundry-button-light"
                pendingLabel="Queueing…"
              >
                Queue full roster sync
              </FoundryActionButton>
            </form>
            <form action={runFoundryWorkerNow}>
              <FoundryActionButton
                className="foundry-button foundry-button-dark"
                pendingLabel="Processing…"
              >
                Run worker now
              </FoundryActionButton>
            </form>
          </div>
          <p className="foundry-form-note">
            Every target retries independently. A Notion outage cannot roll
            back Airtable or send a notification twice.
          </p>
        </article>

        <article className="foundry-card">
          <div className="foundry-card-head">
            <div>
              <span className="foundry-card-eyebrow">Sync coverage</span>
              <h2>Student source map</h2>
            </div>
            <DatabaseZap aria-hidden="true" size={20} />
          </div>
          <div className="ops-sync-list">
            {activeStudents.map((student) => {
              const records = recordsByStudent.get(student.id) ?? [];
              const airtable = records.find(
                (record) => record.provider === "airtable",
              );
              const notion = records.find(
                (record) => record.provider === "notion",
              );
              return (
                <div key={student.id}>
                  <span>
                    <strong>{student.full_name}</strong>
                    <small>{student.foundry_id}</small>
                  </span>
                  <i className={airtable ? "is-synced" : ""}>A</i>
                  {notion?.remote_url ? (
                    <Link href={notion.remote_url} target="_blank">
                      N <ExternalLink aria-hidden="true" size={11} />
                    </Link>
                  ) : (
                    <i className={notion ? "is-synced" : ""}>N</i>
                  )}
                  <time dateTime={notion?.last_synced_at ?? airtable?.last_synced_at ?? ""}>
                    {notion?.last_synced_at || airtable?.last_synced_at
                      ? formatFoundryDate(
                          notion?.last_synced_at ??
                            airtable?.last_synced_at ??
                            "",
                        )
                      : "Queued"}
                  </time>
                </div>
              );
            })}
          </div>
        </article>
      </section>

      <section className="foundry-card">
        <div className="foundry-card-head">
          <div>
            <span className="foundry-card-eyebrow">Explicit permission</span>
            <h2>Email & WhatsApp consent</h2>
          </div>
          <MessageCircle aria-hidden="true" size={20} />
        </div>
        <p className="foundry-long-copy">
          External messages are off by default. Enable a channel only after the
          student or guardian has agreed; in-app updates continue regardless.
        </p>
        <div className="ops-consent-grid">
          {activeStudents.map((student) => {
            const preference = preferenceByStudent.get(student.id);
            return (
              <details key={student.id}>
                <summary>
                  <span>
                    <strong>{student.full_name}</strong>
                    <small>
                      {preference?.email_enabled ? "Email on" : "Email off"} ·{" "}
                      {preference?.whatsapp_enabled
                        ? "WhatsApp on"
                        : "WhatsApp off"}
                    </small>
                  </span>
                  <Settings2 aria-hidden="true" size={16} />
                </summary>
                <form
                  action={updateFoundryDeliveryPreferences}
                  className="foundry-form"
                >
                  <input name="studentId" type="hidden" value={student.id} />
                  <div className="ops-channel-toggles">
                    <label>
                      <input
                        defaultChecked={preference?.email_enabled}
                        disabled={!student.email}
                        name="emailEnabled"
                        type="checkbox"
                      />
                      <Mail aria-hidden="true" size={16} />
                      Email
                    </label>
                    <label>
                      <input
                        defaultChecked={preference?.whatsapp_enabled}
                        name="whatsappEnabled"
                        type="checkbox"
                      />
                      <MessageCircle aria-hidden="true" size={16} />
                      WhatsApp
                    </label>
                  </div>
                  <label>
                    WhatsApp number
                    <input
                      defaultValue={
                        preference?.whatsapp_number ?? student.phone ?? ""
                      }
                      maxLength={40}
                      name="whatsappNumber"
                      placeholder="+92…"
                    />
                  </label>
                  <label>
                    Consent note
                    <textarea
                      defaultValue={preference?.consent_note ?? ""}
                      maxLength={1000}
                      name="consentNote"
                      placeholder="Who agreed, when, and through which channel"
                      rows={3}
                    />
                  </label>
                  <FoundryActionButton
                    className="foundry-button foundry-button-dark"
                    pendingLabel="Saving consent…"
                  >
                    Save consent
                  </FoundryActionButton>
                </form>
              </details>
            );
          })}
        </div>
      </section>

      <section className="ops-next-gate">
        <Sparkles aria-hidden="true" size={19} />
        <p>
          Studio transfer and certificates are Founder decisions against six
          evidence standards—not automatic promises.
        </p>
        <Link href="/dashboard/foundry/progress?view=studio">
          Open Studio gate
        </Link>
      </section>
    </div>
  );
}
