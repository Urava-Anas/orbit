import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Check, UserRoundCheck } from "lucide-react";
import {
  EmptyFoundryState,
  FoundryNotice,
  HealthBadge,
} from "@/components/foundry/FoundryUI";
import { formatFoundryDate, listFoundryClasses } from "@/lib/foundry";
import { markFoundryAttendance } from "../actions";

export const metadata: Metadata = {
  title: "Foundry Attendance",
  robots: { index: false, follow: false },
};

type Props = {
  searchParams: Promise<{
    classId?: string;
    notice?: string;
    error?: string;
  }>;
};

export default async function FoundryAttendancePage({ searchParams }: Props) {
  const filters = await searchParams;
  const { classes, attendance, students } = await listFoundryClasses();
  const defaultClassId =
    filters.classId ??
    attendance[0]?.class_id ??
    classes.find((item) => item.status === "completed")?.id ??
    classes[0]?.id;
  const selectedClass = classes.find((item) => item.id === defaultClassId);
  const selectedAttendance = attendance.filter(
    (item) => item.class_id === defaultClassId,
  );
  const attendanceByStudent = new Map(
    selectedAttendance.map((item) => [item.student_id, item]),
  );

  return (
    <div className="foundry-page">
      <FoundryNotice error={filters.error} notice={filters.notice} />
      <Link className="foundry-back-inline" href="/dashboard/foundry/classes">
        <ArrowLeft aria-hidden="true" size={16} />
        Classes
      </Link>
      <section className="foundry-page-title">
        <div>
          <span className="foundry-kicker">Consistency signal</span>
          <h1>Attendance</h1>
          <p>Ek tap mein mark karein. Note sirf jab support context zaroori ho.</p>
        </div>
        {selectedClass ? (
          <span className="foundry-title-stat">
            <UserRoundCheck aria-hidden="true" size={20} />
            {
              selectedAttendance.filter((item) =>
                ["present", "late"].includes(item.status),
              ).length
            }
            /{students.length} attended
          </span>
        ) : null}
      </section>

      <form className="foundry-filter-bar" method="get">
        <label className="is-grow">
          Class
          <select defaultValue={defaultClassId} name="classId">
            {classes.map((foundryClass) => (
              <option key={foundryClass.id} value={foundryClass.id}>
                {foundryClass.title} · {formatFoundryDate(foundryClass.starts_at)}
              </option>
            ))}
          </select>
        </label>
        <button className="foundry-button foundry-button-dark" type="submit">
          Open class
        </button>
      </form>

      {selectedClass ? (
        <section className="foundry-card">
          <div className="foundry-card-head">
            <div>
              <span className="foundry-card-eyebrow">
                {formatFoundryDate(selectedClass.starts_at)}
              </span>
              <h2>{selectedClass.title}</h2>
            </div>
            <span className={`task-state task-state-${selectedClass.status}`}>
              {selectedClass.status}
            </span>
          </div>
          <div className="attendance-roster">
            {students.map((student) => {
              const existing = attendanceByStudent.get(student.id);
              return (
                <form
                  action={markFoundryAttendance}
                  className="attendance-student-row"
                  key={student.id}
                >
                  <input name="classId" type="hidden" value={selectedClass.id} />
                  <input name="studentId" type="hidden" value={student.id} />
                  <div className="attendance-student-identity">
                    <span className="foundry-avatar is-small">
                      {student.full_name
                        .split(" ")
                        .slice(0, 2)
                        .map((part) => part[0])
                        .join("")
                        .toUpperCase()}
                    </span>
                    <div>
                      <strong>{student.full_name}</strong>
                      <small>{student.foundry_id}</small>
                    </div>
                    <HealthBadge health={student.health_status} label="" />
                  </div>
                  <label>
                    <span className="sr-only">Attendance status</span>
                    <select defaultValue={existing?.status ?? "present"} name="status">
                      <option value="present">Present</option>
                      <option value="late">Late</option>
                      <option value="absent">Absent</option>
                      <option value="excused">Excused</option>
                    </select>
                  </label>
                  <label className="is-grow">
                    <span className="sr-only">Attendance note</span>
                    <input
                      defaultValue={existing?.note ?? ""}
                      name="note"
                      placeholder="Optional support note"
                    />
                  </label>
                  <button
                    className="foundry-button foundry-button-save"
                    type="submit"
                  >
                    <Check aria-hidden="true" size={15} />
                    Save
                  </button>
                </form>
              );
            })}
          </div>
        </section>
      ) : (
        <EmptyFoundryState
          title="Class select karein"
          detail="Attendance mark karne ke liye pehle class schedule karein."
          href="/dashboard/foundry/classes"
          action="Schedule class"
        />
      )}
    </div>
  );
}
