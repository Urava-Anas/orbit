"use client";

import { useActionState, useState } from "react";
import { Check, Copy, KeyRound, RotateCcw, ShieldCheck } from "lucide-react";
import { createFoundryOrbitInvitation } from "@/app/(app)/dashboard/foundry/students/invitation-actions";
import styles from "./StudentOrbitInvitation.module.css";

type Props = {
  studentId: string;
  fullName: string;
  email: string | null;
  lifecycleStatus: string;
  connected: boolean;
};

type InvitationState = {
  status: "idle" | "success" | "error";
  message: string | null;
  invitationUrl: string | null;
  expiresAt: string | null;
};

const initialState: InvitationState = {
  status: "idle",
  message: null,
  invitationUrl: null,
  expiresAt: null,
};

function expiryLabel(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

export function StudentOrbitInvitation({
  studentId,
  fullName,
  email,
  lifecycleStatus,
  connected,
}: Props) {
  const [state, formAction, pending] = useActionState(
    createFoundryOrbitInvitation,
    initialState,
  );
  const [copied, setCopied] = useState(false);
  const eligibleLifecycle = ["accepted", "enrolled"].includes(lifecycleStatus);
  const expires = expiryLabel(state.expiresAt);

  async function copyInvitation() {
    if (!state.invitationUrl) return;
    try {
      await navigator.clipboard.writeText(state.invitationUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <article className={styles.card} aria-label="Orbit access invitation">
      <div className={styles.head}>
        <div className={styles.headCopy}>
          <span className={styles.eyebrow}>Orbit access boundary</span>
          <h2 className={styles.title}>Invite {fullName} to Orbit</h2>
          <p className={styles.copy}>
            The learner signs in with the exact verified email, reviews the
            organisation, then explicitly accepts access. Matching email alone
            never creates authority.
          </p>
        </div>
        <span className={styles.state}>
          <ShieldCheck size={14} aria-hidden="true" />
          {connected ? "Connected" : "Invitation required"}
        </span>
      </div>

      {connected ? (
        <div className={styles.blocked}>
          <strong>Orbit identity already connected.</strong>
          No new bearer invitation will be issued for this record.
        </div>
      ) : !email?.trim() ? (
        <div className={styles.blocked}>
          <strong>Email required first.</strong>
          Save the learner&apos;s exact email in the permanent record, then create
          the invitation.
        </div>
      ) : !eligibleLifecycle ? (
        <div className={styles.blocked}>
          <strong>Acceptance gate not reached.</strong>
          Move the learner to Accepted or Enrolled before Orbit access can be
          issued.
        </div>
      ) : (
        <>
          <form action={formAction}>
            <input type="hidden" name="studentId" value={studentId} />
            <button className={styles.action} disabled={pending} type="submit">
              {state.status === "success" ? (
                <RotateCcw size={15} aria-hidden="true" />
              ) : (
                <KeyRound size={15} aria-hidden="true" />
              )}{" "}
              {pending
                ? "Creating secure invitation…"
                : state.status === "success"
                  ? "Replace unused invitation"
                  : "Create 7-day invitation"}
            </button>
          </form>

          {state.message ? (
            <div className={styles.result} aria-live="polite">
              <p
                className={
                  state.status === "error" ? styles.error : styles.success
                }
              >
                {state.message}
              </p>

              {state.invitationUrl ? (
                <>
                  <div className={styles.linkRow}>
                    <input
                      className={styles.link}
                      readOnly
                      aria-label="Orbit invitation link"
                      value={state.invitationUrl}
                    />
                    <button
                      className={styles.copyButton}
                      type="button"
                      onClick={copyInvitation}
                    >
                      {copied ? (
                        <Check size={15} aria-hidden="true" />
                      ) : (
                        <Copy size={15} aria-hidden="true" />
                      )}{" "}
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <span className={styles.expiry}>
                    {expires ? `Expires ${expires}. ` : ""}
                    Creating a replacement immediately revokes the previous
                    unused link.
                  </span>
                </>
              ) : null}
            </div>
          ) : (
            <span className={styles.expiry}>
              Sent link is single-use and expires in 7 days. Reissuing revokes
              the previous unused link.
            </span>
          )}
        </>
      )}
    </article>
  );
}
