import type { Metadata } from "next";
import { randomUUID } from "node:crypto";
import Link from "next/link";
import {
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  ExternalLink,
  MapPin,
  Plus,
  Radio,
  UserRoundCheck,
  Video,
  XCircle,
} from "lucide-react";
import { FoundryActionButton } from "@/components/foundry/FoundryActionButton";
import {
  EmptyFoundryState,
  FoundryNotice,
} from "@/components/foundry/FoundryUI";
import {
  formatFoundryDate,
  foundryDepartmentLabel,
  listFoundryClasses,
} from "@/lib/foundry";
import { createFoundryClass, updateFoundryClassStatus } from "../actions";

export const metadata: Metadata = {
  title: "Foundry Classes",
  robots: { index: false, follow: false },
};

type Props = {
  searchParams: Promise<{ notice?: string; error?: string }>;
};

export default async function FoundryClassesPage({ searchParams }: Props) {
  const messages = await searchParams;
  const { classes, attendance, students } = await listFoundryClasses();
  const attendanceByClass = new Map<string, number>();
  const markedStudentsByClass = new Map<string, Set<string>>();
  for (const record of attendance) {
    attendanceByClass.set(
      record.class_id,
      (attendanceByClass.get(record.class_id) ?? 0) +
        (["present", "late"].includes(record.status) ? 1 : 0),
    );
    const markedStudents =
      markedStudentsByClass.get(record.class_id) ?? new Set<string>();
    markedStudents.add(record.student_id);
    markedStudentsByClass.set(record.class_id, markedStudents);
  }

  return (
    <div className="foundry-page">
      <FoundryNotice error={messages.error} notice={messages.notice} />
      <section className="foundry-page-title">
        <div>
          <span className="foundry-kicker">Live learning rhythm</span>
          <h1>Classes</h1>
          <p>Monday release, Wednesday clarity, Saturday review — one clean schedule.</p>
        </div>
        <Link
          className="foundry-button foundry-button-primary"
          href="/dashboard/foundry/attendance"
        >
          Mark attendance
          <UserRoundCheck aria-hidden="true" size={17} />
        </Link>
      </section>

      <section className="foundry-split-layout">
        <article className="foundry-card">
          <div className="foundry-card-head">
            <div>
              <span className="foundry-card-eyebrow">Schedule</span>
              <h2>Class calendar</h2>
            </div>
            <CalendarDays aria-hidden="true" size={20} />
          </div>
          {classes.length ? (
            <div className="foundry-class-cards">
              {classes.map((foundryClass) => {
                const eligibleStudents = students.filter(
                  (student) =>
                    !["inactive", "graduated", "rejected"].includes(
                      student.lifecycle_status,
                    ) &&
                    (!foundryClass.department ||
                      student.department === foundryClass.department),
                );
                const markedStudents =
                  markedStudentsByClass.get(foundryClass.id) ?? new Set<string>();
                const rosterComplete = eligibleStudents.every((student) =>
                  markedStudents.has(student.id),
                );

                return (
                  <article className="foundry-class-card" key={foundryClass.id}>
                  <div className="foundry-class-date">
                    <strong>
                      {new Intl.DateTimeFormat("en-PK", {
                        timeZone: "Asia/Karachi",
                        day: "2-digit",
                      }).format(new Date(foundryClass.starts_at))}
                    </strong>
                    <span>
                      {new Intl.DateTimeFormat("en-PK", {
                        timeZone: "Asia/Karachi",
                        month: "short",
                      }).format(new Date(foundryClass.starts_at))}
                    </span>
                  </div>
                  <div className="foundry-class-main">
                    <div>
                      <span className={`task-state task-state-${foundryClass.status}`}>
                        {foundryClass.status}
                      </span>
                      <small>{foundryDepartmentLabel(foundryClass.department)}</small>
                    </div>
                    <h3>{foundryClass.title}</h3>
                    <p>{foundryClass.notes}</p>
                    <div className="foundry-class-meta">
                      <span>
                        <Clock3 aria-hidden="true" size={14} />
                        {formatFoundryDate(foundryClass.starts_at)}
                      </span>
                      <span>
                        {foundryClass.mode === "online" ? (
                          <Video aria-hidden="true" size={14} />
                        ) : (
                          <MapPin aria-hidden="true" size={14} />
                        )}
                        {foundryClass.mode}
                      </span>
                      <span>
                        <UserRoundCheck aria-hidden="true" size={14} />
                        {attendanceByClass.get(foundryClass.id) ?? 0} attended
                      </span>
                    </div>
                    <div className="foundry-class-actions">
                      {foundryClass.join_url &&
                      !["completed", "cancelled"].includes(foundryClass.status) ? (
                        <a
                          href={foundryClass.join_url}
                          rel="noreferrer"
                          target="_blank"
                        >
                          Open room
                          <ExternalLink aria-hidden="true" size={13} />
                        </a>
                      ) : null}
                      {foundryClass.status === "scheduled" ? (
                        <form action={updateFoundryClassStatus}>
                          <input
                            name="classId"
                            type="hidden"
                            value={foundryClass.id}
                          />
                          <FoundryActionButton
                            className="foundry-class-action is-live"
                            name="status"
                            pendingLabel="Starting…"
                            value="live"
                          >
                            <Radio aria-hidden="true" size={13} />
                            Go live
                          </FoundryActionButton>
                        </form>
                      ) : null}
                      {["scheduled", "live"].includes(foundryClass.status) ? (
                        <>
                          {rosterComplete ? (
                            <form action={updateFoundryClassStatus}>
                              <input
                                name="classId"
                                type="hidden"
                                value={foundryClass.id}
                              />
                              <FoundryActionButton
                                className="foundry-class-action"
                                name="status"
                                pendingLabel="Completing…"
                                value="completed"
                              >
                                <CheckCircle2 aria-hidden="true" size={13} />
                                Complete
                              </FoundryActionButton>
                            </form>
                          ) : (
                            <Link
                              className="is-required"
                              href={`/dashboard/foundry/attendance?classId=${foundryClass.id}`}
                            >
                              <UserRoundCheck aria-hidden="true" size={13} />
                              Mark roster to complete
                            </Link>
                          )}
                          <form action={updateFoundryClassStatus}>
                            <input
                              name="classId"
                              type="hidden"
                              value={foundryClass.id}
                            />
                            <FoundryActionButton
                              className="foundry-class-action is-danger"
                              name="status"
                              pendingLabel="Cancelling…"
                              value="cancelled"
                            >
                              <XCircle aria-hidden="true" size={13} />
                              Cancel
                            </FoundryActionButton>
                          </form>
                        </>
                      ) : null}
                    </div>
                  </div>
                  <Link
                    className="foundry-icon-link"
                    href={`/dashboard/foundry/attendance?classId=${foundryClass.id}`}
                    aria-label={`Mark attendance for ${foundryClass.title}`}
                  >
                    <ArrowUpRight aria-hidden="true" size={17} />
                  </Link>
                  </article>
                );
              })}
            </div>
          ) : (
            <EmptyFoundryState
              title="No class scheduled"
              detail="Form se first Foundry class add karein."
            />
          )}
        </article>

        <aside className="foundry-card">
          <div className="foundry-card-head">
            <div>
              <span className="foundry-card-eyebrow">New session</span>
              <h2>Schedule class</h2>
            </div>
            <Plus aria-hidden="true" size={20} />
          </div>
          <form action={createFoundryClass} className="foundry-form">
            <input name="requestId" type="hidden" value={randomUUID()} />
            <label>
              Class title
              <input name="title" placeholder="Day 3 Practical Lab" required />
            </label>
            <label>
              Teacher
              <input name="instructorName" placeholder="Foundry Mentor" required />
            </label>
            <div className="foundry-form-grid">
              <label>
                Department
                <select defaultValue="" name="department">
                  <option value="">All departments</option>
                  <option value="creative_ui">Creative & UI</option>
                  <option value="web_app">Web & App</option>
                  <option value="ai_automation">AI & Automation</option>
                  <option value="sales_calling">Sales & Calling</option>
                  <option value="operations">Operations</option>
                  <option value="content_media">Content & Media</option>
                </select>
              </label>
              <label>
                Mode
                <select defaultValue="online" name="mode">
                  <option value="online">Online</option>
                  <option value="onsite">Onsite</option>
                  <option value="hybrid">Hybrid</option>
                </select>
              </label>
              <label>
                Starts (PKT)
                <input name="startsAt" required type="datetime-local" />
              </label>
              <label>
                Ends (PKT)
                <input name="endsAt" required type="datetime-local" />
              </label>
              <label className="is-wide">
                Join link
                <input name="joinUrl" placeholder="https://meet.google.com/..." type="url" />
              </label>
              <label className="is-wide">
                Simple class note
                <textarea
                  name="notes"
                  placeholder="Students ko class se pehle kya ready rakhna hai?"
                  rows={3}
                />
              </label>
            </div>
            <FoundryActionButton
              className="foundry-button foundry-button-dark"
              pendingLabel="Scheduling class…"
            >
              Schedule class
            </FoundryActionButton>
          </form>
        </aside>
      </section>
    </div>
  );
}
