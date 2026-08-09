import type { Metadata } from "next";
import { randomUUID } from "node:crypto";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
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
import { createJourneyClass, updateJourneyClass } from "./journey-actions";
import styles from "./calendar.module.css";

export const metadata: Metadata = {
  title: "Foundry Classes",
  robots: { index: false, follow: false },
};

type Props = {
  searchParams: Promise<{
    notice?: string;
    error?: string;
    month?: string;
    date?: string;
    department?: string;
    classId?: string;
  }>;
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

const departments = [
  ["creative_ui", "Creative & UI"],
  ["web_app", "Web & App"],
  ["ai_automation", "AI & Automation"],
  ["sales_calling", "Sales & Calling"],
  ["operations", "Operations"],
  ["content_media", "Content & Media"],
] as const;

function pakistanDateKey(input: string | Date) {
  const date = typeof input === "string" ? new Date(input) : input;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const map = new Map(parts.map((part) => [part.type, part.value]));
  return `${map.get("year")}-${map.get("month")}-${map.get("day")}`;
}

function pakistanDateTimeLocal(input: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(input));
  const map = new Map(parts.map((part) => [part.type, part.value]));
  return `${map.get("year")}-${map.get("month")}-${map.get("day")}T${map.get("hour")}:${map.get("minute")}`;
}

function shiftMonth(month: string, delta: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, monthNumber - 1 + delta, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-PK", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, monthNumber - 1, 1)));
}

function classesUrl({
  month,
  date,
  department,
  classId,
}: {
  month: string;
  date?: string;
  department?: string;
  classId?: string;
}) {
  const params = new URLSearchParams({ month });
  if (date) params.set("date", date);
  if (department) params.set("department", department);
  if (classId) params.set("classId", classId);
  return `/dashboard/foundry/classes?${params.toString()}`;
}

export default async function FoundryClassesPage({ searchParams }: Props) {
  const query = await searchParams;
  const { supabase, workspace } = await requireFounderFoundry();
  const [classesResult, studentsResult, attendanceResult] = await Promise.all([
    supabase
      .from("foundry_classes")
      .select(
        "id, title, department, instructor_name, starts_at, ends_at, mode, join_url, status, notes, level_number",
      )
      .eq("workspace_id", workspace.id)
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
  const today = pakistanDateKey(new Date());
  const currentMonth = today.slice(0, 7);
  const month = /^\d{4}-\d{2}$/.test(query.month ?? "") ? query.month! : currentMonth;
  const [year, monthNumber] = month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const firstWeekday = new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay();
  const departmentFilter = departments.some(([value]) => value === query.department)
    ? query.department
    : "";
  const selectedDate =
    query.date?.startsWith(`${month}-`) && /^\d{4}-\d{2}-\d{2}$/.test(query.date)
      ? query.date
      : month === currentMonth
        ? today
        : `${month}-01`;

  const filteredClasses = classes.filter(
    (item) => !departmentFilter || item.department === departmentFilter,
  );
  const monthClasses = filteredClasses.filter(
    (item) => pakistanDateKey(item.starts_at).slice(0, 7) === month,
  );
  const selectedDateClasses = filteredClasses.filter(
    (item) => pakistanDateKey(item.starts_at) === selectedDate,
  );
  const selectedClass =
    selectedDateClasses.find((item) => item.id === query.classId) ??
    selectedDateClasses[0] ??
    null;

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

  const previousMonth = shiftMonth(month, -1);
  const nextMonth = shiftMonth(month, 1);
  const selectedDateLabel = new Intl.DateTimeFormat("en-PK", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${selectedDate}T00:00:00Z`));

  const createStart = `${selectedDate}T19:00`;
  const createEnd = `${selectedDate}T20:00`;

  return (
    <div className="foundry-page">
      <FoundryNotice error={query.error} notice={query.notice} />

      <section className="foundry-page-title">
        <div>
          <span className="foundry-kicker">Department → calendar → date → class controls</span>
          <h1>Classes</h1>
          <p>
            The calendar is the schedule source. See every department together, filter
            one department when needed, open a date, then create or customise the class
            without leaving the page.
          </p>
        </div>
        <Link className="foundry-button foundry-button-primary" href="/dashboard/foundry/map">
          Open Journey Map
          <ArrowRight aria-hidden="true" size={16} />
        </Link>
      </section>

      <section className="foundry-summary-strip" aria-label="How Classes works">
        <span><b>1</b> Choose all departments or one team</span>
        <span><b>2</b> Open a calendar date</span>
        <span><b>3</b> Edit, go live, mark attendance or add another class</span>
      </section>

      <section className="foundry-card">
        <div className="foundry-card-head">
          <div>
            <span className="foundry-card-eyebrow">Department schedules</span>
            <h2>What should the calendar show?</h2>
          </div>
          <CalendarDays aria-hidden="true" size={20} />
        </div>
        <div className={styles.departmentBar}>
          <Link
            data-active={!departmentFilter}
            href={classesUrl({ month, date: selectedDate })}
          >
            All departments <small>{classes.length}</small>
          </Link>
          {departments.map(([value, label]) => (
            <Link
              data-active={departmentFilter === value}
              href={classesUrl({ month, date: selectedDate, department: value })}
              key={value}
            >
              {label}
              <small>{classes.filter((item) => item.department === value).length}</small>
            </Link>
          ))}
        </div>
      </section>

      <section className={styles.calendarShell} aria-label={`${monthLabel(month)} class calendar`}>
        <header className={styles.calendarHead}>
          <div>
            <h2>{monthLabel(month)}</h2>
            <p>{monthClasses.length} class{monthClasses.length === 1 ? "" : "es"} visible in this month</p>
          </div>
          <div className={styles.monthControls}>
            <Link href={classesUrl({ month: previousMonth, department: departmentFilter })}>
              <ArrowLeft aria-hidden="true" size={14} /> Previous
            </Link>
            <Link href={classesUrl({ month: currentMonth, date: today, department: departmentFilter })}>
              Today
            </Link>
            <Link href={classesUrl({ month: nextMonth, department: departmentFilter })}>
              Next <ArrowRight aria-hidden="true" size={14} />
            </Link>
          </div>
        </header>

        <div className={styles.weekdays} aria-hidden="true">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <span key={day}>{day}</span>)}
        </div>
        <div className={styles.calendarGrid}>
          {Array.from({ length: firstWeekday }, (_, index) => (
            <div className={styles.blank} key={`blank-${index}`} />
          ))}
          {Array.from({ length: daysInMonth }, (_, index) => {
            const dayNumber = index + 1;
            const dateKey = `${month}-${String(dayNumber).padStart(2, "0")}`;
            const dateClasses = monthClasses.filter(
              (item) => pakistanDateKey(item.starts_at) === dateKey,
            );
            return (
              <Link
                className={styles.day}
                data-selected={selectedDate === dateKey}
                data-today={today === dateKey}
                href={classesUrl({ month, date: dateKey, department: departmentFilter })}
                key={dateKey}
              >
                <span className={styles.dayNumber}>{dayNumber}</span>
                {dateClasses.slice(0, 3).map((item) => (
                  <span className={styles.classChip} key={item.id}>
                    <strong>{item.title}</strong>
                    <small>
                      L{item.level_number} · {foundryDepartmentLabel(item.department)}
                    </small>
                  </span>
                ))}
                {dateClasses.length > 3 ? (
                  <span className={styles.more}>+{dateClasses.length - 3} more</span>
                ) : null}
              </Link>
            );
          })}
        </div>
      </section>

      <section className={styles.dayLayout}>
        <article className="foundry-card">
          <div className="foundry-card-head">
            <div>
              <span className="foundry-card-eyebrow">Selected date</span>
              <h2>{selectedDateLabel}</h2>
            </div>
            <span className="foundry-count">{selectedDateClasses.length}</span>
          </div>
          <p className="foundry-long-copy">
            Open a class to customise it. If the date is empty, use the schedule form
            on the right to create the first session.
          </p>
          {selectedDateClasses.length ? (
            <div className={styles.dayList}>
              {selectedDateClasses.map((item) => (
                <Link
                  data-active={selectedClass?.id === item.id}
                  href={classesUrl({
                    month,
                    date: selectedDate,
                    department: departmentFilter,
                    classId: item.id,
                  })}
                  key={item.id}
                >
                  <span>
                    <strong>{item.title}</strong>
                    <small>
                      Level {item.level_number} · {foundryDepartmentLabel(item.department)} · {formatFoundryDate(item.starts_at)}
                    </small>
                  </span>
                  <span className={`task-state task-state-${item.status}`}>{item.status}</span>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyFoundryState
              title="No class on this date"
              detail="Use the schedule form to add one. The selected date is already filled in."
            />
          )}
        </article>

        <div className={styles.editStack}>
          {selectedClass ? (
            <article className="foundry-card">
              <div className="foundry-card-head">
                <div>
                  <span className="foundry-card-eyebrow">Customise selected class</span>
                  <h2>{selectedClass.title}</h2>
                </div>
                <span className={`task-state task-state-${selectedClass.status}`}>{selectedClass.status}</span>
              </div>

              <form action={updateJourneyClass} className="foundry-form">
                <input name="classId" type="hidden" value={selectedClass.id} />
                <input name="returnMonth" type="hidden" value={month} />
                <input name="returnDate" type="hidden" value={selectedDate} />
                <input name="filterDepartment" type="hidden" value={departmentFilter} />
                <div className="foundry-form-grid">
                  <label>
                    Level
                    <input defaultValue={selectedClass.level_number} max="100" min="1" name="levelNumber" required type="number" />
                  </label>
                  <label>
                    Department
                    <select defaultValue={selectedClass.department ?? ""} name="department">
                      <option value="">All departments</option>
                      {departments.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
                    </select>
                  </label>
                  <label className="is-wide">
                    Class title
                    <input defaultValue={selectedClass.title} name="title" required />
                  </label>
                  <label>
                    Teacher
                    <input defaultValue={selectedClass.instructor_name} name="instructorName" required />
                  </label>
                  <label>
                    Mode
                    <select defaultValue={selectedClass.mode} name="mode">
                      <option value="online">Online</option>
                      <option value="onsite">Onsite</option>
                      <option value="hybrid">Hybrid</option>
                    </select>
                  </label>
                  <label>
                    Starts (PKT)
                    <input defaultValue={pakistanDateTimeLocal(selectedClass.starts_at)} name="startsAt" required type="datetime-local" />
                  </label>
                  <label>
                    Ends (PKT)
                    <input defaultValue={pakistanDateTimeLocal(selectedClass.ends_at)} name="endsAt" required type="datetime-local" />
                  </label>
                  <label className="is-wide">
                    Join link
                    <input defaultValue={selectedClass.join_url ?? ""} name="joinUrl" type="url" />
                  </label>
                  <label className="is-wide">
                    Preparation / class note
                    <textarea defaultValue={selectedClass.notes ?? ""} name="notes" rows={3} />
                  </label>
                </div>
                <FoundryActionButton className="foundry-button foundry-button-dark" pendingLabel="Updating class…">
                  Save class changes
                </FoundryActionButton>
              </form>

              <div className="foundry-class-meta" style={{ marginTop: 14 }}>
                <span><Clock3 aria-hidden="true" size={14} />{formatFoundryDate(selectedClass.starts_at)}</span>
                <span>
                  {selectedClass.mode === "online" ? <Video aria-hidden="true" size={14} /> : <MapPin aria-hidden="true" size={14} />}
                  {selectedClass.mode}
                </span>
                <span><UserRoundCheck aria-hidden="true" size={14} />{attendanceByClass.get(selectedClass.id) ?? 0} attended</span>
              </div>

              <div className="foundry-class-actions" style={{ marginTop: 12 }}>
                {selectedClass.join_url && !["completed", "cancelled"].includes(selectedClass.status) ? (
                  <a href={selectedClass.join_url} rel="noreferrer" target="_blank">
                    Open room <ExternalLink aria-hidden="true" size={13} />
                  </a>
                ) : null}
                {selectedClass.status === "scheduled" ? (
                  <form action={updateFoundryClassStatus}>
                    <input name="classId" type="hidden" value={selectedClass.id} />
                    <FoundryActionButton className="foundry-class-action is-live" name="status" pendingLabel="Starting…" value="live">
                      <Radio aria-hidden="true" size={13} /> Go live
                    </FoundryActionButton>
                  </form>
                ) : null}
                {(() => {
                  const eligible = students.filter(
                    (student) =>
                      !["inactive", "graduated", "rejected"].includes(student.lifecycle_status) &&
                      (!selectedClass.department || student.department === selectedClass.department),
                  );
                  const marked = markedStudentsByClass.get(selectedClass.id) ?? new Set<string>();
                  const rosterComplete = eligible.every((student) => marked.has(student.id));
                  if (!["scheduled", "live"].includes(selectedClass.status)) return null;
                  return rosterComplete ? (
                    <form action={updateFoundryClassStatus}>
                      <input name="classId" type="hidden" value={selectedClass.id} />
                      <FoundryActionButton className="foundry-class-action" name="status" pendingLabel="Completing…" value="completed">
                        <CheckCircle2 aria-hidden="true" size={13} /> Complete
                      </FoundryActionButton>
                    </form>
                  ) : (
                    <Link className="is-required" href={`/dashboard/foundry/attendance?classId=${selectedClass.id}`}>
                      Mark roster to complete
                    </Link>
                  );
                })()}
                {["scheduled", "live"].includes(selectedClass.status) ? (
                  <form action={updateFoundryClassStatus}>
                    <input name="classId" type="hidden" value={selectedClass.id} />
                    <FoundryActionButton className="foundry-class-action is-danger" name="status" pendingLabel="Cancelling…" value="cancelled">
                      <XCircle aria-hidden="true" size={13} /> Cancel
                    </FoundryActionButton>
                  </form>
                ) : null}
              </div>
            </article>
          ) : null}

          <article className="foundry-card">
            <div className="foundry-card-head">
              <div>
                <span className="foundry-card-eyebrow">Add to {selectedDateLabel}</span>
                <h2>Schedule another class</h2>
              </div>
              <Plus aria-hidden="true" size={20} />
            </div>
            <form action={createJourneyClass} className="foundry-form">
              <input name="requestId" type="hidden" value={randomUUID()} />
              <div className="foundry-form-grid">
                <label>
                  Level
                  <input defaultValue="1" max="100" min="1" name="levelNumber" required type="number" />
                </label>
                <label>
                  Department
                  <select defaultValue={departmentFilter} name="department">
                    <option value="">All departments</option>
                    {departments.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
                  </select>
                </label>
                <label className="is-wide">
                  Class title
                  <input name="title" placeholder="Level 3 · Practical UI Lab" required />
                </label>
                <label>
                  Teacher
                  <input name="instructorName" placeholder="Foundry Mentor" required />
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
                  <input defaultValue={createStart} name="startsAt" required type="datetime-local" />
                </label>
                <label>
                  Ends (PKT)
                  <input defaultValue={createEnd} name="endsAt" required type="datetime-local" />
                </label>
                <label className="is-wide">
                  Join link
                  <input name="joinUrl" placeholder="https://meet.google.com/..." type="url" />
                </label>
                <label className="is-wide">
                  Preparation / class note
                  <textarea name="notes" placeholder="What should students prepare before this class?" rows={3} />
                </label>
              </div>
              <FoundryActionButton className="foundry-button foundry-button-dark" pendingLabel="Scheduling class…">
                Schedule class
              </FoundryActionButton>
            </form>
          </article>
        </div>
      </section>
    </div>
  );
}
