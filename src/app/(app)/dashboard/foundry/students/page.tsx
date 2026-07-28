import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowUpRight,
  Filter,
  Search,
  Smartphone,
  Sparkles,
  UsersRound,
} from "lucide-react";
import {
  EmptyFoundryState,
  FoundryProgressBar,
  HealthBadge,
} from "@/components/foundry/FoundryUI";
import {
  foundryDepartmentLabel,
  foundryLevelLabel,
  listFoundryStudents,
} from "@/lib/foundry";

export const metadata: Metadata = {
  title: "Foundry Students",
  robots: { index: false, follow: false },
};

type Props = {
  searchParams: Promise<{
    q?: string;
    health?: string;
    department?: string;
  }>;
};

export default async function FoundryStudentsPage({ searchParams }: Props) {
  const { students } = await listFoundryStudents();
  const filters = await searchParams;
  const query = (filters.q ?? "").trim().toLowerCase();

  const visibleStudents = students.filter((student) => {
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
      <section className="foundry-page-title">
        <div>
          <span className="foundry-kicker">Permanent student records</span>
          <h1>Students</h1>
          <p>
            Goal se Studio readiness tak — har learner ki ek hi trusted record.
          </p>
        </div>
        <span className="foundry-title-stat">
          <UsersRound aria-hidden="true" size={20} />
          {students.length} total
        </span>
      </section>

      <section className="foundry-segment-row" aria-label="Student health summary">
        {(["green", "yellow", "red", "gold"] as const).map((health) => (
          <Link
            className={`foundry-segment health-segment-${health}`}
            href={`/dashboard/foundry/students?health=${health}`}
            key={health}
          >
            <HealthBadge health={health} />
            <strong>
              {students.filter((student) => student.health_status === health).length}
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
            placeholder="Name, ID or email"
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
          Filter
        </button>
      </form>

      {visibleStudents.length ? (
        <section className="foundry-student-grid" aria-label="Student roster">
          {visibleStudents.map((student) => (
            <Link
              className="foundry-student-card"
              href={`/dashboard/foundry/students/${student.id}`}
              key={student.id}
            >
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
                    {foundryDepartmentLabel(student.department)} ·{" "}
                    {foundryLevelLabel(student.level)}
                  </p>
                </div>
                <ArrowUpRight aria-hidden="true" size={18} />
              </div>
              <div className="foundry-student-signals">
                <HealthBadge health={student.health_status} />
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
                  Progress <b>{student.progress_percent}%</b>
                </span>
                <FoundryProgressBar value={student.progress_percent} compact />
              </div>
              <p className="foundry-next-step">
                <small>Next step</small>
                {student.next_action ?? "Next action set karein."}
              </p>
            </Link>
          ))}
        </section>
      ) : (
        <EmptyFoundryState
          title="No matching students"
          detail="Search ya filters clear karke roster dobara dekhein."
          href="/dashboard/foundry/students"
          action="Clear filters"
        />
      )}
    </div>
  );
}
