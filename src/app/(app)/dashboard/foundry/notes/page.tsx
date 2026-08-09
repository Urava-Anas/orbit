import type { Metadata } from "next";
import { randomUUID } from "node:crypto";
import Link from "next/link";
import {
  ArrowUpRight,
  Award,
  BookOpen,
  FileText,
  FolderOpen,
  History,
  Plus,
  Sparkles,
} from "lucide-react";
import { FoundryActionButton } from "@/components/foundry/FoundryActionButton";
import { EmptyFoundryState, FoundryNotice } from "@/components/foundry/FoundryUI";
import { formatFoundryDate, requireFounderFoundry } from "@/lib/foundry";
import { saveClassLearningNote } from "./actions";
import { addLevelResource, archiveLevelResource } from "./resource-actions";

export const metadata: Metadata = {
  title: "Foundry Notes & Level PDFs",
  robots: { index: false, follow: false },
};

type Props = {
  searchParams: Promise<{
    studentId?: string;
    classId?: string;
    notice?: string;
    error?: string;
  }>;
};

type Student = {
  id: string;
  foundry_id: string;
  full_name: string;
  department: string;
};

type FoundryClass = {
  id: string;
  title: string;
  starts_at: string;
  status: string;
  level_number: number;
};

type LearningNote = {
  id: string;
  student_id: string;
  class_id: string;
  class_title_snapshot: string;
  class_date: string;
  lesson_summary: string;
  key_concepts: string | null;
  student_notes: string;
  learning_state: string;
  understanding_level: number | null;
  progress_summary: string | null;
  support_note: string | null;
  next_step: string | null;
  resource_url: string | null;
  impact_title: string | null;
  impact_statement: string | null;
  achievement_title: string | null;
  achievement_description: string | null;
  evidence_requirement: string | null;
  xp_reward: number;
  updated_at: string;
};

type LevelResource = {
  id: string;
  student_id: string | null;
  department: string | null;
  level_number: number;
  title: string;
  resource_url: string;
  resource_kind: string;
  status: string;
};

function stageLabel(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default async function FoundryClassNotesPage({ searchParams }: Props) {
  const query = await searchParams;
  const { supabase, workspace } = await requireFounderFoundry();

  const [studentsResult, classesResult, notesResult, resourcesResult] = await Promise.all([
    supabase
      .from("foundry_students")
      .select("id, foundry_id, full_name, department")
      .eq("workspace_id", workspace.id)
      .not("lifecycle_status", "in", '("inactive","graduated","rejected")')
      .order("foundry_id"),
    supabase
      .from("foundry_classes")
      .select("id, title, starts_at, status, level_number")
      .eq("workspace_id", workspace.id)
      .eq("status", "completed")
      .order("level_number")
      .order("starts_at"),
    supabase
      .from("foundry_class_learning_notes")
      .select(
        "id, student_id, class_id, class_title_snapshot, class_date, lesson_summary, key_concepts, student_notes, learning_state, understanding_level, progress_summary, support_note, next_step, resource_url, impact_title, impact_statement, achievement_title, achievement_description, evidence_requirement, xp_reward, updated_at",
      )
      .eq("workspace_id", workspace.id)
      .order("class_date", { ascending: false }),
    supabase
      .from("foundry_level_resources")
      .select(
        "id, student_id, department, level_number, title, resource_url, resource_kind, status",
      )
      .eq("workspace_id", workspace.id)
      .order("level_number")
      .order("created_at"),
  ]);

  const students = (studentsResult.data ?? []) as Student[];
  const classes = (classesResult.data ?? []) as FoundryClass[];
  const notes = (notesResult.data ?? []) as LearningNote[];
  const resources = (resourcesResult.data ?? []) as LevelResource[];
  const studentsById = new Map(students.map((student) => [student.id, student]));
  const classesById = new Map(classes.map((item) => [item.id, item]));

  const editingNote = notes.find(
    (note) => note.student_id === query.studentId && note.class_id === query.classId,
  );
  const selectedStudent =
    students.find((student) => student.id === query.studentId) ?? students[0];
  const selectedClass =
    classes.find((item) => item.id === query.classId) ?? classes[0];

  return (
    <div className="foundry-page">
      <FoundryNotice error={query.error} notice={query.notice} />

      <section className="foundry-page-title">
        <div>
          <span className="foundry-kicker">Level memory → impact → achievement</span>
          <h1>Notes & Level PDFs</h1>
          <p>
            Keep detailed teaching notes here, attach PDFs to Level 1, 2, 3, 4… and
            define what capability and achievement each completed class creates on the map.
          </p>
        </div>
        {selectedStudent ? (
          <Link
            className="foundry-button foundry-button-primary"
            href={`/dashboard/foundry/map?studentId=${selectedStudent.id}`}
          >
            Open map
            <ArrowUpRight aria-hidden="true" size={16} />
          </Link>
        ) : null}
      </section>

      <section className="foundry-split-layout">
        <article className="foundry-card">
          <div className="foundry-card-head">
            <div>
              <span className="foundry-card-eyebrow">Class → impact → badge</span>
              <h2>{editingNote ? "Update mapped class record" : "Map a completed class"}</h2>
            </div>
            <Award aria-hidden="true" size={20} />
          </div>

          {students.length && classes.length ? (
            <form action={saveClassLearningNote} className="foundry-form">
              <div className="foundry-form-grid">
                <label>
                  Student
                  <select
                    defaultValue={editingNote?.student_id ?? selectedStudent?.id}
                    name="studentId"
                    required
                  >
                    {students.map((student) => (
                      <option key={student.id} value={student.id}>
                        {student.foundry_id} · {student.full_name}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Completed class
                  <select
                    defaultValue={editingNote?.class_id ?? selectedClass?.id}
                    name="classId"
                    required
                  >
                    {classes.map((item) => (
                      <option key={item.id} value={item.id}>
                        Level {item.level_number} · {item.title}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="is-wide">
                  Student-visible impact title
                  <input
                    defaultValue={editingNote?.impact_title ?? ""}
                    name="impactTitle"
                    placeholder="Think through a product like a designer"
                  />
                </label>

                <label className="is-wide">
                  Impact statement
                  <textarea
                    defaultValue={editingNote?.impact_statement ?? ""}
                    name="impactStatement"
                    placeholder="What can the member do now that they could not do before?"
                    rows={3}
                  />
                </label>

                <label>
                  Achievement / badge
                  <input
                    defaultValue={editingNote?.achievement_title ?? ""}
                    name="achievementTitle"
                    placeholder="Flow Thinker"
                  />
                </label>

                <label>
                  XP reward
                  <input
                    defaultValue={editingNote?.xp_reward ?? 0}
                    max="1000"
                    min="0"
                    name="xpReward"
                    type="number"
                  />
                </label>

                <label className="is-wide">
                  Achievement description
                  <textarea
                    defaultValue={editingNote?.achievement_description ?? ""}
                    name="achievementDescription"
                    placeholder="What does earning this prove?"
                    rows={2}
                  />
                </label>

                <label className="is-wide">
                  Proof required
                  <textarea
                    defaultValue={editingNote?.evidence_requirement ?? ""}
                    name="evidenceRequirement"
                    placeholder="What evidence must be submitted before this achievement is trusted?"
                    rows={3}
                  />
                </label>

                <label>
                  Learning stage
                  <select defaultValue={editingNote?.learning_state ?? "introduced"} name="learningState">
                    <option value="introduced">Introduced</option>
                    <option value="practising">Practising</option>
                    <option value="understood">Understood</option>
                    <option value="applied">Applied</option>
                    <option value="mastered">Mastered</option>
                  </select>
                </label>

                <label>
                  Understanding check
                  <select
                    defaultValue={editingNote?.understanding_level ?? ""}
                    name="understandingLevel"
                  >
                    <option value="">Not assessed</option>
                    <option value="1">1 — needs full reteaching</option>
                    <option value="2">2 — early understanding</option>
                    <option value="3">3 — basic understanding</option>
                    <option value="4">4 — strong understanding</option>
                    <option value="5">5 — can teach it back</option>
                  </select>
                </label>

                <label className="is-wide">
                  Lesson summary
                  <textarea
                    defaultValue={editingNote?.lesson_summary ?? ""}
                    name="lessonSummary"
                    placeholder="Detailed class record for the teacher and student."
                    required
                    rows={3}
                  />
                </label>

                <label className="is-wide">
                  Key concepts
                  <textarea
                    defaultValue={editingNote?.key_concepts ?? ""}
                    name="keyConcepts"
                    rows={2}
                  />
                </label>

                <label className="is-wide">
                  Student notes
                  <textarea
                    defaultValue={editingNote?.student_notes ?? ""}
                    name="studentNotes"
                    required
                    rows={4}
                  />
                </label>

                <label className="is-wide">
                  Evidence / progress summary
                  <textarea
                    defaultValue={editingNote?.progress_summary ?? ""}
                    name="progressSummary"
                    rows={3}
                  />
                </label>

                <label className="is-wide">
                  Learning support note
                  <textarea
                    defaultValue={editingNote?.support_note ?? ""}
                    name="supportNote"
                    rows={2}
                  />
                </label>

                <label className="is-wide">
                  Next move
                  <textarea
                    defaultValue={editingNote?.next_step ?? ""}
                    name="nextStep"
                    placeholder="One immediate action that keeps the loop moving."
                    rows={2}
                  />
                </label>

                <label className="is-wide">
                  Optional class resource link
                  <input
                    defaultValue={editingNote?.resource_url ?? ""}
                    name="resourceUrl"
                    placeholder="https://..."
                    type="url"
                  />
                </label>
              </div>

              <FoundryActionButton
                className="foundry-button foundry-button-dark"
                pendingLabel="Updating map…"
              >
                {editingNote ? "Update mapped record" : "Save to Journey Map"}
              </FoundryActionButton>
            </form>
          ) : (
            <EmptyFoundryState
              title="Complete a class first"
              detail="A class must be completed before its impact and achievement evidence can be recorded."
              href="/dashboard/foundry/classes"
              action="Open classes"
            />
          )}
        </article>

        <aside className="foundry-card">
          <div className="foundry-card-head">
            <div>
              <span className="foundry-card-eyebrow">Level resources</span>
              <h2>Add PDF / resource</h2>
            </div>
            <Plus aria-hidden="true" size={20} />
          </div>
          <form action={addLevelResource} className="foundry-form">
            <input name="requestId" type="hidden" value={randomUUID()} />
            <label>
              Level
              <input defaultValue="1" max="100" min="1" name="levelNumber" required type="number" />
            </label>
            <label>
              Specific student (optional)
              <select defaultValue={selectedStudent?.id ?? ""} name="studentId">
                <option value="">All matching members</option>
                {students.map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.foundry_id} · {student.full_name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Department (optional)
              <select defaultValue={selectedStudent?.department ?? ""} name="department">
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
              Title
              <input name="title" placeholder="Level 3 Visual Lecture PDF" required />
            </label>
            <label>
              Resource type
              <select defaultValue="pdf" name="resourceKind">
                <option value="pdf">PDF</option>
                <option value="file">File</option>
                <option value="video">Video</option>
                <option value="link">Link</option>
              </select>
            </label>
            <label>
              File / Drive URL
              <input name="resourceUrl" placeholder="https://drive.google.com/..." required type="url" />
            </label>
            <FoundryActionButton
              className="foundry-button foundry-button-dark"
              pendingLabel="Linking resource…"
            >
              Add to level map
            </FoundryActionButton>
          </form>
        </aside>
      </section>

      <section className="foundry-card">
        <div className="foundry-card-head">
          <div>
            <span className="foundry-card-eyebrow">Level library</span>
            <h2>PDFs & resources</h2>
          </div>
          <FolderOpen aria-hidden="true" size={20} />
        </div>
        {resources.length ? (
          <div className="foundry-data-list">
            {resources.map((resource) => {
              const student = resource.student_id
                ? studentsById.get(resource.student_id)
                : null;
              return (
                <article className="foundry-data-row" key={resource.id}>
                  <span className="foundry-avatar">L{resource.level_number}</span>
                  <div>
                    <strong>{resource.title}</strong>
                    <p>
                      {student?.full_name ?? resource.department ?? "All members"} ·{" "}
                      {resource.resource_kind.toUpperCase()} · {resource.status}
                    </p>
                  </div>
                  <div className="foundry-row-actions">
                    <a
                      className="foundry-button foundry-button-quiet"
                      href={resource.resource_url}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Open
                      <ArrowUpRight aria-hidden="true" size={14} />
                    </a>
                    {resource.status === "published" ? (
                      <form action={archiveLevelResource}>
                        <input name="resourceId" type="hidden" value={resource.id} />
                        <FoundryActionButton
                          className="foundry-button foundry-button-quiet"
                          pendingLabel="Archiving…"
                        >
                          Archive
                        </FoundryActionButton>
                      </form>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <EmptyFoundryState
            title="No level PDFs yet"
            detail="Add the first PDF above; it will immediately appear on the member Journey Map."
          />
        )}
      </section>

      <section className="foundry-card">
        <div className="foundry-card-head">
          <div>
            <span className="foundry-card-eyebrow">Detailed memory</span>
            <h2>Learning history</h2>
          </div>
          <History aria-hidden="true" size={20} />
        </div>

        {notes.length ? (
          <div className="foundry-data-list">
            {notes.map((note) => {
              const student = studentsById.get(note.student_id);
              const mappedClass = classesById.get(note.class_id);
              return (
                <article className="foundry-data-row" key={note.id}>
                  <span className="foundry-avatar">
                    {mappedClass ? `L${mappedClass.level_number}` : "N"}
                  </span>
                  <div>
                    <strong>
                      {student?.full_name ?? "Student"} ·{" "}
                      {note.impact_title ?? note.class_title_snapshot}
                    </strong>
                    <p>
                      {formatFoundryDate(note.class_date)} · {stageLabel(note.learning_state)}
                      {note.achievement_title ? ` · ${note.achievement_title}` : ""}
                    </p>
                    {note.next_step ? <p>Next: {note.next_step}</p> : null}
                  </div>
                  <div className="foundry-row-actions">
                    <Link
                      className="foundry-button"
                      href={`/dashboard/foundry/notes?studentId=${note.student_id}&classId=${note.class_id}`}
                    >
                      Edit
                    </Link>
                    <Link
                      className="foundry-button foundry-button-quiet"
                      href={`/dashboard/foundry/map?studentId=${note.student_id}`}
                    >
                      Map
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <EmptyFoundryState
            title="No completed-class records yet"
            detail="Map a completed class to define its impact, proof and achievement."
          />
        )}
      </section>
    </div>
  );
}
