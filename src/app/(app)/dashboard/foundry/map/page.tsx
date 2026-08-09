import type { Metadata } from "next";
import Link from "next/link";
import { EmptyFoundryState } from "@/components/foundry/FoundryUI";
import { StudentLearningMap } from "@/components/foundry/StudentLearningMap";
import { requireFounderFoundry } from "@/lib/foundry";
import { loadFoundryJourney } from "@/lib/foundry-journey";

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
  const selected =
    students.find((student) => student.id === query.studentId) ?? students[0] ?? null;

  if (!selected) {
    return (
      <div className="foundry-page">
        <EmptyFoundryState
          title="No active member yet"
          detail="Add a member first. Their complete level journey will appear here."
          href="/dashboard/foundry/students"
          action="Open members"
        />
      </div>
    );
  }

  const journey = await loadFoundryJourney(
    supabase,
    workspace.id,
    selected.id,
    selected.department,
  );

  if (query.view === "student") {
    return (
      <div className="foundry-page">
        <StudentLearningMap journey={journey} mode="student" student={selected} />
      </div>
    );
  }

  return (
    <div className="foundry-page">
      <section className="foundry-page-title">
        <div>
          <span className="foundry-kicker">One map · all learning signals</span>
          <h1>Member Journey Map</h1>
          <p>
            Select a member. Orbit projects Classes, PDFs, Tasks, achievements and
            Studio work into the same level map.
          </p>
        </div>
        <div className="foundry-row-actions">
          {students.map((student) => (
            <Link
              className={`foundry-button ${
                student.id === selected.id ? "foundry-button-primary" : "foundry-button-quiet"
              }`}
              href={`/dashboard/foundry/map?studentId=${student.id}`}
              key={student.id}
            >
              {student.full_name}
            </Link>
          ))}
        </div>
      </section>

      <StudentLearningMap
        journey={journey}
        mode="admin"
        student={selected}
        studentViewHref={`/dashboard/foundry/map?studentId=${selected.id}&view=student`}
      />
    </div>
  );
}
