import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Map, UsersRound } from "lucide-react";
import { EmptyFoundryState } from "@/components/foundry/FoundryUI";
import { StudentLearningMap } from "@/components/foundry/StudentLearningMap";
import {
  foundryDepartmentLabel,
  requireFounderFoundry,
} from "@/lib/foundry";
import {
  loadFoundryJourney,
  type FoundryJourney,
} from "@/lib/foundry-journey";

export const metadata: Metadata = {
  title: "Foundry Journey Map",
  robots: { index: false, follow: false },
};

type Props = {
  searchParams: Promise<{ studentId?: string; view?: string }>;
};

type Student = {
  id: string;
  foundry_id: string;
  full_name: string;
  department: string;
  level: string;
  next_action: string | null;
  lifecycle_status: string;
};

function currentJourneyLevel(journey: FoundryJourney) {
  const now = Date.now();
  const classLevel = new Map(journey.classes.map((item) => [item.id, item.level_number]));
  const startedLevels = [
    ...journey.classes
      .filter(
        (item) =>
          item.status === "completed" ||
          item.status === "live" ||
          new Date(item.starts_at).getTime() <= now,
      )
      .map((item) => item.level_number),
    ...journey.assignments
      .filter((item) => new Date(item.starts_at).getTime() <= now)
      .map((item) => item.foundry_tasks?.level_number ?? 1),
    ...journey.studioAssignments
      .filter((item) => new Date(item.starts_at).getTime() <= now)
      .map((item) => item.level_number),
    ...journey.notes.map((item) => classLevel.get(item.class_id) ?? 1),
  ];

  return Math.max(1, ...startedLevels);
}

export default async function FoundryMapPage({ searchParams }: Props) {
  const query = await searchParams;
  const { supabase, workspace } = await requireFounderFoundry();
  const { data } = await supabase
    .from("foundry_students")
    .select("id, foundry_id, full_name, department, level, next_action, lifecycle_status")
    .eq("workspace_id", workspace.id)
    .not("lifecycle_status", "in", '("inactive","graduated","rejected")')
    .order("foundry_id");

  const students = (data ?? []) as Student[];
  if (!students.length) {
    return (
      <div className="foundry-page">
        <EmptyFoundryState
          title="No active member yet"
          detail="Add a student first. Their complete level journey will appear here."
          href="/dashboard/foundry/students?mode=add"
          action="Add student"
        />
      </div>
    );
  }

  const journeys = await Promise.all(
    students.map(async (student) => ({
      student,
      journey: await loadFoundryJourney(
        supabase,
        workspace.id,
        student.id,
        student.department,
      ),
    })),
  );

  const selectedEntry = query.studentId
    ? journeys.find((entry) => entry.student.id === query.studentId) ?? null
    : null;

  if (selectedEntry && query.view === "student") {
    return (
      <div className="foundry-page">
        <Link
          className="foundry-back-inline"
          href={`/dashboard/foundry/map?studentId=${selectedEntry.student.id}`}
        >
          <ArrowLeft aria-hidden="true" size={16} />
          Back to admin map
        </Link>
        <StudentLearningMap
          journey={selectedEntry.journey}
          mode="student"
          student={selectedEntry.student}
        />
      </div>
    );
  }

  return (
    <div className="foundry-page">
      <section className="foundry-page-title">
        <div>
          <span className="foundry-kicker">Choose member → inspect journey → act</span>
          <h1>Journey Map</h1>
          <p>
            Start with the member list. Each row tells you who the student is, their
            department and the latest level they have actually reached. Open one row
            to inspect Classes, Notes, Tasks, evidence and Studio work on one map.
          </p>
        </div>
        <span className="foundry-title-stat">
          <UsersRound aria-hidden="true" size={20} />
          {students.length} mapped members
        </span>
      </section>

      <section className="foundry-summary-strip" aria-label="How Journey Map works">
        <span><b>1</b> Choose a member below</span>
        <span><b>2</b> Read the level path from top to bottom</span>
        <span><b>3</b> Use map controls to schedule, teach, assign or move to Studio</span>
      </section>

      <section className="foundry-card">
        <div className="foundry-card-head">
          <div>
            <span className="foundry-card-eyebrow">Member map directory</span>
            <h2>{selectedEntry ? "Switch member" : "Choose a student to inspect"}</h2>
          </div>
          <Map aria-hidden="true" size={20} />
        </div>

        <div className="foundry-data-list">
          {journeys.map(({ student, journey }) => {
            const currentLevel = currentJourneyLevel(journey);
            const selected = selectedEntry?.student.id === student.id;
            return (
              <Link
                className={`foundry-data-row ${selected ? "is-selected" : ""}`}
                href={`/dashboard/foundry/map?studentId=${student.id}`}
                key={student.id}
              >
                <span className="foundry-avatar">
                  {student.full_name
                    .split(" ")
                    .slice(0, 2)
                    .map((part) => part[0])
                    .join("")
                    .toUpperCase()}
                </span>
                <div>
                  <strong>{student.full_name}</strong>
                  <p>
                    {student.foundry_id} · {foundryDepartmentLabel(student.department)}
                  </p>
                </div>
                <span className="task-state task-state-scheduled">Level {currentLevel}</span>
                <ArrowUpRight aria-hidden="true" size={17} />
              </Link>
            );
          })}
        </div>
      </section>

      {selectedEntry ? (
        <StudentLearningMap
          journey={selectedEntry.journey}
          mode="admin"
          student={selectedEntry.student}
          studentViewHref={`/dashboard/foundry/map?studentId=${selectedEntry.student.id}&view=student`}
        />
      ) : (
        <section className="foundry-card">
          <div className="foundry-card-head">
            <div>
              <span className="foundry-card-eyebrow">Nothing hidden</span>
              <h2>The map opens after selection</h2>
            </div>
          </div>
          <p className="foundry-long-copy">
            Choose a student above. Orbit will load only that learner&apos;s relevant
            department classes, level resources, tasks, achievements and Studio work.
          </p>
        </section>
      )}
    </div>
  );
}
