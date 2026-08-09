import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowUpRight,
  CircleCheck,
  Clock3,
  Filter,
  Plus,
  Search,
  Smartphone,
  Sparkles,
  UserPlus,
  UsersRound,
} from "lucide-react";
import {
  EmptyFoundryState,
  FoundryNotice,
  FoundryProgressBar,
  HealthBadge,
} from "@/components/foundry/FoundryUI";
import { StudentRosterActions } from "@/components/foundry/StudentRosterActions";
import {
  foundryDepartmentLabel,
  foundryLevelLabel,
  listFoundryStudents,
} from "@/lib/foundry";
import { createFoundryStudent } from "./actions";

export const metadata: Metadata = {
  title: "Foundry Students",
  robots: { index: false, follow: false },
};

type Props = {
  searchParams: Promise<{
    q?: string;
    health?: string;
    department?: string;
    mode?: string;
    notice?: string;
    error?: string;
  }>;
};

export default async function FoundryStudentsPage({ searchParams }: Props) {
  const { students } = await listFoundryStudents();
  const filters = await searchParams;
  const query = (filters.q ?? "").trim().toLowerCase();
  const adding = filters.mode === "add";

  const activeStudents = students.filter(
    (student) => !["inactive", "graduated", "rejected"].includes(student.lifecycle_status),
  );
  const visibleStudents = activeStudents.filter((student) => {
    const matchesQuery =
      !query ||
      student.full_name.toLowerCase().includes(query) ||
      student.foundry_id.toLowerCase().includes(query) ||
      student.email?.toLowerCase().includes(query);
    const matchesHealth =
      !filters.health || student.health_status === filters.health;
    const matchesDepartment =
      !filters.department || student.department === filters.department;
    return matchesQuery && matchesHealth && matchesDepartment;
  });

  return (
    <div className="foundry-page">
      <FoundryNotice error={filters.error} notice={filters.notice} />

      <section className="foundry-page-title">
        <div>
          <span className="foundry-kicker">Roster → profile → journey → real work</span>
          <h1>Students</h1>
          <p>
            This is the Foundry roster. Add a student, open their full record, edit
            their learning setup, or remove them from active Foundry without deleting
            their history.
          </p>
        </div>
        <div className="foundry-row-actions">
          <span className="foundry-title-stat">
            <UsersRound aria-hidden="true" size={20} />
            {activeStudents.length} active
          </span>
          <Link
            className="foundry-button foundry-button-primary"
            href={adding ? "/dashboard/foundry/students" : "/dashboard/foundry/students?mode=add"}
          >
            <Plus aria-hidden="true" size={16} />
            {adding ? "Close add form" : "Add student"}
          </Link>
        </div>
      </section>

      <section className="foundry-summary-strip" aria-label="How the student page works">
        <span><b>1</b> Add identity & department</span>
        <span><b>2</b> Open record to edit goals/access</span>
        <span><b>3</b> Open Map, Tasks or Studio from that record</span>
      </section>

      {adding ? (
        <section className="foundry-card" id="add-student">
          <div className="foundry-card-head">
            <div>
              <span className="foundry-card-eyebrow">New permanent record</span>
              <h2>Add student</h2>
            </div>
            <UserPlus aria-hidden="true" size={20} />
          </div>
          <p className="foundry-long-copy">
            Start with the minimum reliable information. Orbit creates the next UFS ID;
            the full profile remains editable after creation.
          </p>
          <form action={createFoundryStudent} className="foundry-form">
            <div className="foundry-form-grid">
              <label>
                Full name
                <input name="fullName" placeholder="Student full name" required />
              </label>
              <label>
                Sign-in email (optional)
                <input name="email" placeholder="student@example.com" type="email" />
                <small>Use the exact Google/email account the student will use in Orbit.</small>
              </label>
              <label>
                Phone (optional)
                <input inputMode="tel" name="phone" placeholder="03xx..." />
              </label>
              <label>
                Department
                <select defaultValue="unassigned" name="department">
                  <option value="unassigned">Unassigned</option>
                  <option value="creative_ui">Creative & UI</option>
                  <option value="web_app">Web & App</option>
                  <option value="ai_automation">AI & Automation</option>
                  <option value="sales_calling">Sales & Calling</option>
                  <option value="operations">Operations</option>
                  <option value="content_media">Content & Media</option>
                </select>
              </label>
              <label>
                Foundry stage
                <select defaultValue="applied" name="level">
                  <option value="applied">Applied</option>
                  <option value="screening">Screening</option>
                  <option value="trial">Trial</option>
                  <option value="accepted">Accepted</option>
                  <option value="onboarding">Onboarding</option>
                  <option value="explorer">Explorer</option>
                  <option value="apprentice">Apprentice</option>
                  <option value="operator">Operator</option>
                  <option value="specialist">Specialist</option>
                  <option value="mentor_alumni">Mentor / Alumni</option>
                </select>
              </label>
              <label>
                Lifecycle
                <select defaultValue="new" name="lifecycleStatus">
                  <option value="new">New</option>
                  <option value="reviewing">Reviewing</option>
                  <option value="shortlisted">Shortlisted</option>
                  <option value="accepted">Accepted</option>
                  <option value="waitlisted">Waitlisted</option>
                  <option value="enrolled">Enrolled</option>
                </select>
              </label>
              <label>
                Device access
                <select defaultValue="unknown" name="deviceAccess">
                  <option value="unknown">Unknown</option>
                  <option value="own_laptop">Own laptop</option>
                  <option value="shared_laptop">Shared laptop</option>
                  <option value="mobile_only">Mobile only</option>
                  <option value="no_reliable_device">No reliable device</option>
                </select>
              </label>
              <label>
                Preferred language
                <select defaultValue="roman_urdu" name="preferredLanguage">
                  <option value="roman_urdu">Roman Urdu</option>
                  <option value="urdu">Urdu</option>
                  <option value="english">English</option>
                  <option value="bilingual">Bilingual</option>
                </select>
              </label>
              <label className="is-wide">
                30-day goal (optional)
                <textarea name="mainGoal" placeholder="One measurable outcome." rows={2} />
              </label>
              <label className="is-wide">
                First next action (optional)
                <textarea name="nextAction" placeholder="One clear action the student should do next." rows={2} />
              </label>
            </div>
            <button className="foundry-button foundry-button-dark" type="submit">
              <UserPlus aria-hidden="true" size={16} />
              Create student record
            </button>
          </form>
        </section>
      ) : null}

      <section className="foundry-segment-row" aria-label="Student health summary">
        {(["green", "yellow", "red", "gold"] as const).map((health) => (
          <Link
            className={`foundry-segment health-segment-${health}`}
            href={`/dashboard/foundry/students?health=${health}`}
            key={health}
          >
            <HealthBadge health={health} />
            <strong>
              {activeStudents.filter((student) => student.health_status === health).length}
            </strong>
          </Link>
        ))}
      </section>

      <form className="foundry-filter-bar" method="get">
        <label className="foundry-search">
          <Search aria-hidden="true" size={17} />
          <span className="sr-only">Search students</span>
          <input
            defaultValue={filters.q}
            name="q"
            placeholder="Name, UFS ID or email"
            type="search"
          />
        </label>
        <label>
          <span className="sr-only">Health</span>
          <select defaultValue={filters.health ?? ""} name="health">
            <option value="">All health states</option>
            <option value="green">Green</option>
            <option value="yellow">Yellow</option>
            <option value="red">Red</option>
            <option value="gold">Gold</option>
          </select>
        </label>
        <label>
          <span className="sr-only">Department</span>
          <select defaultValue={filters.department ?? ""} name="department">
            <option value="">All departments</option>
            <option value="unassigned">Unassigned</option>
            <option value="creative_ui">Creative & UI</option>
            <option value="web_app">Web & App</option>
            <option value="ai_automation">AI & Automation</option>
            <option value="sales_calling">Sales & Calling</option>
            <option value="operations">Operations</option>
            <option value="content_media">Content & Media</option>
          </select>
        </label>
        <button className="foundry-button foundry-button-dark" type="submit">
          <Filter aria-hidden="true" size={16} />
          Filter roster
        </button>
      </form>

      {visibleStudents.length ? (
        <section className="foundry-student-grid" aria-label="Student roster">
          {visibleStudents.map((student) => (
            <article className="foundry-student-card" key={student.id}>
              <div className="foundry-student-card-top">
                <span className="foundry-avatar">
                  {student.full_name
                    .split(" ")
                    .slice(0, 2)
                    .map((part) => part[0])
                    .join("")
                    .toUpperCase()}
                </span>
                <div>
                  <span className="foundry-id">{student.foundry_id}</span>
                  <h2>{student.full_name}</h2>
                  <p>
                    {foundryDepartmentLabel(student.department)} · {foundryLevelLabel(student.level)}
                  </p>
                </div>
                <Link
                  className="foundry-icon-link"
                  href={`/dashboard/foundry/students/${student.id}`}
                  aria-label={`Open ${student.full_name} record`}
                >
                  <ArrowUpRight aria-hidden="true" size={18} />
                </Link>
              </div>

              <div className="foundry-student-signals">
                <HealthBadge health={student.health_status} />
                <span className={student.auth_user_id ? "foundry-access-state is-connected" : "foundry-access-state"}>
                  {student.auth_user_id ? <CircleCheck aria-hidden="true" size={14} /> : <Clock3 aria-hidden="true" size={14} />}
                  {student.auth_user_id ? "Connected" : "Awaiting access"}
                </span>
                <span>
                  <Smartphone aria-hidden="true" size={14} />
                  {student.device_access.replaceAll("_", " ")}
                </span>
                {student.studio_eligible ? (
                  <span className="studio-ready-pill">
                    <Sparkles aria-hidden="true" size={13} />
                    Studio Ready
                  </span>
                ) : null}
              </div>

              <div className="foundry-student-progress">
                <span>
                  Recorded progress <b>{student.progress_percent}%</b>
                </span>
                <FoundryProgressBar value={student.progress_percent} compact />
              </div>

              <p className="foundry-next-step">
                <small>Next step</small>
                {student.next_action ?? "Open the record and set one clear next action."}
              </p>

              <div className="foundry-row-actions">
                <Link
                  className="foundry-button foundry-button-primary"
                  href={`/dashboard/foundry/students/${student.id}`}
                >
                  Open record
                  <ArrowUpRight aria-hidden="true" size={14} />
                </Link>
                <Link
                  className="foundry-button foundry-button-quiet"
                  href={`/dashboard/foundry/map?studentId=${student.id}`}
                >
                  Open map
                </Link>
              </div>
              <StudentRosterActions
                foundryId={student.foundry_id}
                studentId={student.id}
                studentName={student.full_name}
              />
            </article>
          ))}
        </section>
      ) : (
        <EmptyFoundryState
          title="No matching students"
          detail="Clear filters, or add the first student if the active roster is empty."
          href={activeStudents.length ? "/dashboard/foundry/students" : "/dashboard/foundry/students?mode=add"}
          action={activeStudents.length ? "Clear filters" : "Add student"}
        />
      )}
    </div>
  );
}
