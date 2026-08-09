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
import { EmptyFoundryState, FoundryNotice } from "@/components/foundry/FoundryUI";
import {
  formatFoundryDate,
  foundryDepartmentLabel,
  requireFounderFoundry,
} from "@/lib/foundry";
import { updateFoundryClassStatus } from "../actions";
import { createJourneyClass } from "./journey-actions";

export const metadata: Metadata = {
  title: "Foundry Classes",
  robots: { index: false, follow: false },
};

type Props = {
  searchParams: Promise<{ notice?: string; error?: string }>;
};

type FoundryClass = {
  id: string;
  title: string;
  department: string | null;
  instructor_name: string;
  starts_at: string;
  ends_at: string;
  mode: string;
  join_url: string | null;
  status: string;
  notes: string | null;
  level_number: number;
};

type Student = {
  id: string;
  department: string;
  lifecycle_status: string;
};

type Attendance = {
  class_id: string;
  student_id: string;
  status: string;
};

export default async function FoundryClassesPage({ searchParams }: Props) {
  const messages = await searchParams;
  const { supabase, workspace } = await requireFounderFoundry();
  const [classesResult, studentsResult, attendanceResult] = await Promise.all([
    supabase
      .from("foundry_classes")
      .select(
        "id, title, department, instructor_name, starts_at, ends_at, mode, join_url, status, notes, level_number",
      )
      .eq("workspace_id", workspace.id)
      .order("level_number")
      .order("starts_at"),
    supabase
      .from("foundry_students")
      .select("id, department, lifecycle_status")
      .eq("workspace_id", workspace.id),
    supabase
      .from("foundry_attendance")
      .select("class_id, student_id, status")
      .eq("workspace_id", workspace.id),
  ]);

  const classes = (classesResult.data ?? []) as FoundryClass[];
  const students = (studentsResult.data ?? []) as Student[];
  const attendance = (attendanceResult.data ?? []) as Attendance[];
  const attendanceByClass = new Map<string, number>();
  const markedStudentsByClass = new Map<string, Set<string>>();

  for (const record of attendance) {
    attendanceByClass.set(
      record.class_id,
      (attendanceByClass.get(record.class_id) ?? 0) +
        (["present", "late"].includes(record.status) ? 1 : 0),
    );
    const marked = markedStudentsByClass.get(record.class_id) ?? new Set<string>();
    marked.add(record.student_id);
    markedStudentsByClass.set(record.class_id, marked);
  }

  const levels = [...new Set(classes.map((item) => item.level_number))].sort(
    (a, b) => a - b,
  );
  const now = Date.now();
  const liveCount = classes.filter(
    (item) =>
      item.status === "live" ||
      (new Date(item.starts_at).getTime() <= now &&
        new Date(item.ends_at).getTime() >= now &&
        item.status !== "completed"),
  ).length;
  const upcomingCount = classes.filter(
    (item) => item.status === "scheduled" && new Date(item.starts_at).getTime() > now,
  ).length;
  const completedCount = classes.filter((item) => item.status === "completed").length;

  return (
    <div className="foundry-page">
      <FoundryNotice error={messages.error} notice={messages.notice} />

      <section className="foundry-page-title">
        <div>
          <span className="foundry-kicker">Schedule → level → member map</span>
          <h1>Classes</h1>
          <p>
            Every scheduled class belongs to a level and appears automatically on
            the member Journey Map.
          </p>
        </div>
        <Link className="foundry-button foundry-button-primary" href="/dashboard/foundry/map">
          Open Journey Map
          <ArrowUpRight aria-hidden="true" size={17} />
        </Link>
      </section>

      <section className="foundry-summary-strip">
        <span>
          <Radio aria-hidden="true" size={18} />
          <b>{liveCount}</b> live/current
        </span>
        <span>
          <CalendarDays aria-hidden="true" size={18} />
          <b>{upcomingCount}</b> upcoming
        </span>
        <span>
          <CheckCircle2 aria-hidden="true" size={18} />
          <b>{completedCount}</b> completed
        </span>
      </section>

      <section className="foundry-split-layout">
        <article className="foundry-card">
          <div className="foundry-card-head">
            <div>
              <span className="foundry-card-eyebrow">All schedules</span>
              <h2>Class level map</h2>
            </div>
            <CalendarDays aria-hidden="true" size={20} />
          </div>

          {levels.length ? (
            <div className="foundry-timeline">
              {levels.map((level) => (
                <article key={level}>
                  <span />
                  <div style={{ width: "100%" }}>
                    <time>Level {level}</time>
                    <strong>
                      {classes.filter((item) => item.level_number === level).length} scheduled
                      session{classes.filter((item) => item.level_number === level).length === 1 ? "" : "s"}
                    </strong>
                    <div className="foundry-class-cards" style={{ marginTop: 10 }}>
                      {classes
                        .filter((item) => item.level_number === level)
                        .map((foundryClass) => {
                          const eligibleStudents = students.filter(
                            (student) =>
                              !["inactive", "graduated", "rejected"].includes(
                                student.lifecycle_status,
                              ) &&
                              (!foundryClass.department ||
                                student.department === foundryClass.department),
                          );
                          const marked =
                            markedStudentsByClass.get(foundryClass.id) ?? new Set<string>();
                          const rosterComplete = eligibleStudents.every((student) =>
                            marked.has(student.id),
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
                                    <a href={foundryClass.join_url} rel="noreferrer" target="_blank">
                                      Open room
                                      <ExternalLink aria-hidden="true" size={13} />
                                    </a>
                                  ) : null}
                                  {foundryClass.status === "scheduled" ? (
                                    <form action={updateFoundryClassStatus}>
                                      <input name="classId" type="hidden" value={foundryClass.id} />
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
                            </article>
                          );
                        })}
                    </div>
                  </div>
                  <b>#{level}</b>
                </article>
              ))}
            </div>
          ) : (
            <EmptyFoundryState
              title="No class scheduled"
              detail="Schedule the first level session from the form."
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
          <form action={createJourneyClass} className="foundry-form">
            <input name="requestId" type="hidden" value={randomUUID()} />
            <label>
              Level
              <input defaultValue="1" max="100" min="1" name="levelNumber" required type="number" />
            </label>
            <label>
              Class title
              <input name="title" placeholder="Level 3 · Practical UI Lab" required />
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
                Class note
                <textarea
                  name="notes"
                  placeholder="What should the member prepare before this level session?"
                  rows={3}
                />
              </label>
            </div>
            <FoundryActionButton
              className="foundry-button foundry-button-dark"
              pendingLabel="Scheduling class…"
            >
              Schedule & add to map
            </FoundryActionButton>
          </form>
        </aside>
      </section>
    </div>
  );
}
