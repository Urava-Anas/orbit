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
  Link2,
  NotebookPen,
  PlayCircle,
  Plus,
  Wrench,
} from "lucide-react";
import { FoundryActionButton } from "@/components/foundry/FoundryActionButton";
import { EmptyFoundryState, FoundryNotice } from "@/components/foundry/FoundryUI";
import { formatFoundryDate, foundryDepartmentLabel, requireFounderFoundry } from "@/lib/foundry";
import { saveClassLearningNote } from "./actions";
import { addLevelResource, archiveLevelResource } from "./resource-actions";

export const metadata: Metadata = {
  title: "Foundry Notes & Resources",
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
};

type LevelResource = {
  id: string;
  student_id: string | null;
  department: string | null;
  level_number: number;
  title: string;
  resource_url: string | null;
  content: string | null;
  resource_kind: string;
  status: string;
};

function stageLabel(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function resourceIcon(kind: string) {
  if (kind === "note") return <NotebookPen aria-hidden="true" size={18} />;
  if (kind === "tool") return <Wrench aria-hidden="true" size={18} />;
  if (kind === "video") return <PlayCircle aria-hidden="true" size={18} />;
  if (kind === "link") return <Link2 aria-hidden="true" size={18} />;
  return <FileText aria-hidden="true" size={18} />;
}

export default async function FoundryNotesPage({ searchParams }: Props) {
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
        "id, student_id, class_id, class_title_snapshot, class_date, lesson_summary, key_concepts, student_notes, learning_state, understanding_level, progress_summary, support_note, next_step, resource_url, impact_title, impact_statement, achievement_title, achievement_description, evidence_requirement, xp_reward",
      )
      .eq("workspace_id", workspace.id)
      .order("class_date", { ascending: false }),
    supabase
      .from("foundry_level_resources")
      .select(
        "id, student_id, department, level_number, title, resource_url, content, resource_kind, status",
      )
      .eq("workspace_id", workspace.id)
      .order("level_number")
      .order("created_at", { ascending: false }),
  ]);

  const students = (studentsResult.data ?? []) as Student[];
  const classes = (classesResult.data ?? []) as FoundryClass[];
  const notes = (notesResult.data ?? []) as LearningNote[];
  const resources = (resourcesResult.data ?? []) as LevelResource[];
  const studentsById = new Map(students.map((student) => [student.id, student]));
  const editingNote = notes.find(
    (note) => note.student_id === query.studentId && note.class_id === query.classId,
  );
  const selectedStudent = students.find((student) => student.id === query.studentId) ?? students[0];
  const selectedClass = classes.find((item) => item.id === query.classId) ?? classes[0];

  return (
    <div className="foundry-page">
      <FoundryNotice error={query.error} notice={query.notice} />

      <section className="foundry-page-title">
        <div>
          <span className="foundry-kicker">Teach → save → attach → revisit</span>
          <h1>Notes & Resources</h1>
          <p>
            Use this page for two things: record what happened in a completed class,
            and build the level library students can revisit. The library accepts
            written notes, tools, video tutorials, PDFs, files and links.
          </p>
        </div>
        {selectedStudent ? (
          <Link className="foundry-button foundry-button-primary" href={`/dashboard/foundry/map?studentId=${selectedStudent.id}`}>
            See it on the map <ArrowUpRight aria-hidden="true" size={15} />
          </Link>
        ) : null}
      </section>

      <section className="foundry-summary-strip" aria-label="How Notes works">
        <span><b>1</b> Class record = what was taught and understood</span>
        <span><b>2</b> Level library = notes, tools, videos and files</span>
        <span><b>3</b> Both feed the selected student&apos;s Journey Map</span>
      </section>

      <section className="foundry-split-layout">
        <article className="foundry-card">
          <div className="foundry-card-head">
            <div>
              <span className="foundry-card-eyebrow">Completed class record</span>
              <h2>{editingNote ? "Edit teaching record" : "Add class notes & learning outcome"}</h2>
            </div>
            <History aria-hidden="true" size={20} />
          </div>
          <p className="foundry-long-copy">
            This is not just a teacher diary. Impact, proof and achievement fields are
            what make the same class understandable on the student&apos;s map.
          </p>

          {students.length && classes.length ? (
            <form action={saveClassLearningNote} className="foundry-form">
              <div className="foundry-form-grid">
                <label>
                  Student
                  <select defaultValue={editingNote?.student_id ?? selectedStudent?.id} name="studentId" required>
                    {students.map((student) => (
                      <option key={student.id} value={student.id}>{student.foundry_id} · {student.full_name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Completed class
                  <select defaultValue={editingNote?.class_id ?? selectedClass?.id} name="classId" required>
                    {classes.map((item) => (
                      <option key={item.id} value={item.id}>Level {item.level_number} · {item.title}</option>
                    ))}
                  </select>
                </label>
                <label className="is-wide">
                  What was taught?
                  <textarea defaultValue={editingNote?.lesson_summary ?? ""} name="lessonSummary" placeholder="Clear summary of the class." required rows={3} />
                </label>
                <label className="is-wide">
                  Key concepts
                  <textarea defaultValue={editingNote?.key_concepts ?? ""} name="keyConcepts" placeholder="Methods, terms, tools or examples." rows={2} />
                </label>
                <label className="is-wide">
                  Student notes
                  <textarea defaultValue={editingNote?.student_notes ?? ""} name="studentNotes" placeholder="Simple notes the student can revisit." required rows={4} />
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
                  <select defaultValue={editingNote?.understanding_level ?? ""} name="understandingLevel">
                    <option value="">Not assessed</option>
                    <option value="1">1 — reteach</option>
                    <option value="2">2 — early</option>
                    <option value="3">3 — basic</option>
                    <option value="4">4 — strong</option>
                    <option value="5">5 — can teach back</option>
                  </select>
                </label>
                <label className="is-wide">
                  Student-visible impact
                  <input defaultValue={editingNote?.impact_title ?? ""} name="impactTitle" placeholder="e.g. Can structure a user flow" />
                </label>
                <label className="is-wide">
                  Impact explanation
                  <textarea defaultValue={editingNote?.impact_statement ?? ""} name="impactStatement" placeholder="What can the student now do better?" rows={2} />
                </label>
                <label>
                  Achievement / badge
                  <input defaultValue={editingNote?.achievement_title ?? ""} name="achievementTitle" placeholder="Flow Thinker" />
                </label>
                <label>
                  XP reward
                  <input defaultValue={editingNote?.xp_reward ?? 0} max="1000" min="0" name="xpReward" type="number" />
                </label>
                <label className="is-wide">
                  Achievement meaning
                  <textarea defaultValue={editingNote?.achievement_description ?? ""} name="achievementDescription" placeholder="What does earning this prove?" rows={2} />
                </label>
                <label className="is-wide">
                  Proof required
                  <textarea defaultValue={editingNote?.evidence_requirement ?? ""} name="evidenceRequirement" placeholder="What task/evidence proves the capability?" rows={2} />
                </label>
                <label className="is-wide">
                  Evidence / progress summary
                  <textarea defaultValue={editingNote?.progress_summary ?? ""} name="progressSummary" rows={2} />
                </label>
                <label className="is-wide">
                  Learning support note
                  <textarea defaultValue={editingNote?.support_note ?? ""} name="supportNote" placeholder="Pacing, language, repetition or device support." rows={2} />
                </label>
                <label className="is-wide">
                  Next move
                  <textarea defaultValue={editingNote?.next_step ?? ""} name="nextStep" placeholder="One immediate next action." rows={2} />
                </label>
                <label className="is-wide">
                  Optional class URL
                  <input defaultValue={editingNote?.resource_url ?? ""} name="resourceUrl" placeholder="https://..." type="url" />
                </label>
              </div>
              <FoundryActionButton className="foundry-button foundry-button-dark" pendingLabel="Saving teaching record…">
                {editingNote ? "Update teaching record" : "Save class record"}
              </FoundryActionButton>
            </form>
          ) : (
            <EmptyFoundryState
              title="Complete a class first"
              detail="Class notes become meaningful after a class is completed. Use Classes to schedule and complete the session first."
              href="/dashboard/foundry/classes"
              action="Open Classes"
            />
          )}
        </article>

        <aside className="foundry-card">
          <div className="foundry-card-head">
            <div>
              <span className="foundry-card-eyebrow">Level learning library</span>
              <h2>Add note, tool or tutorial</h2>
            </div>
            <Plus aria-hidden="true" size={20} />
          </div>
          <p className="foundry-long-copy">
            Pick the level and scope. A student-specific item only appears for that
            learner; a department item appears for everyone in that department.
          </p>
          <form action={addLevelResource} className="foundry-form">
            <input name="requestId" type="hidden" value={randomUUID()} />
            <label>
              Level
              <input defaultValue="1" max="100" min="1" name="levelNumber" required type="number" />
            </label>
            <label>
              Resource type
              <select defaultValue="note" name="resourceKind">
                <option value="note">Written note</option>
                <option value="tool">Tool</option>
                <option value="video">Video tutorial</option>
                <option value="pdf">PDF</option>
                <option value="file">File</option>
                <option value="link">Link</option>
              </select>
            </label>
            <label>
              Specific student (optional)
              <select defaultValue={selectedStudent?.id ?? ""} name="studentId">
                <option value="">All matching students</option>
                {students.map((student) => (
                  <option key={student.id} value={student.id}>{student.foundry_id} · {student.full_name}</option>
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
              <input name="title" placeholder="Figma Auto Layout quick guide" required />
            </label>
            <label>
              URL for tool / video / PDF / link
              <input name="resourceUrl" placeholder="https://..." type="url" />
              <small>Leave empty only when Resource type is Written note.</small>
            </label>
            <label>
              Written note content
              <textarea name="resourceContent" placeholder="Write the reusable note here. Required only for Written note." rows={5} />
            </label>
            <FoundryActionButton className="foundry-button foundry-button-dark" pendingLabel="Adding to library…">
              Add to level library
            </FoundryActionButton>
          </form>
        </aside>
      </section>

      <section className="foundry-card">
        <div className="foundry-card-head">
          <div>
            <span className="foundry-card-eyebrow">Reusable learning library</span>
            <h2>Notes, tools, tutorials & files</h2>
          </div>
          <FolderOpen aria-hidden="true" size={20} />
        </div>
        {resources.length ? (
          <div className="foundry-data-list">
            {resources.map((resource) => {
              const student = resource.student_id ? studentsById.get(resource.student_id) : null;
              return (
                <article className="foundry-data-row" key={resource.id}>
                  <span className="foundry-avatar">{resourceIcon(resource.resource_kind)}</span>
                  <div>
                    <strong>Level {resource.level_number} · {resource.title}</strong>
                    <p>
                      {student?.full_name ?? (resource.department ? foundryDepartmentLabel(resource.department) : "All students")} · {stageLabel(resource.resource_kind)} · {resource.status}
                    </p>
                    {resource.content ? <p>{resource.content}</p> : null}
                  </div>
                  <div className="foundry-row-actions">
                    {resource.resource_url ? (
                      <a className="foundry-button foundry-button-quiet" href={resource.resource_url} rel="noreferrer" target="_blank">
                        Open <ArrowUpRight aria-hidden="true" size={14} />
                      </a>
                    ) : null}
                    {resource.status === "published" ? (
                      <form action={archiveLevelResource}>
                        <input name="resourceId" type="hidden" value={resource.id} />
                        <FoundryActionButton className="foundry-button foundry-button-quiet" pendingLabel="Archiving…">
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
          <EmptyFoundryState title="Learning library is empty" detail="Add the first written note, tool, tutorial or PDF from the form above." />
        )}
      </section>

      <section className="foundry-card">
        <div className="foundry-card-head">
          <div>
            <span className="foundry-card-eyebrow">Permanent teaching history</span>
            <h2>Class records</h2>
          </div>
          <BookOpen aria-hidden="true" size={20} />
        </div>
        {notes.length ? (
          <div className="foundry-data-list">
            {notes.map((note) => {
              const student = studentsById.get(note.student_id);
              return (
                <article className="foundry-data-row" key={note.id}>
                  <span className="foundry-avatar"><Award aria-hidden="true" size={18} /></span>
                  <div>
                    <strong>{student?.full_name ?? "Student"} · {note.class_title_snapshot}</strong>
                    <p>{formatFoundryDate(note.class_date)} · {stageLabel(note.learning_state)}</p>
                    <p>{note.impact_title ?? note.lesson_summary}</p>
                  </div>
                  <div className="foundry-row-actions">
                    <Link className="foundry-button foundry-button-quiet" href={`/dashboard/foundry/notes?studentId=${note.student_id}&classId=${note.class_id}`}>
                      Edit
                    </Link>
                    <Link className="foundry-button foundry-button-quiet" href={`/dashboard/foundry/map?studentId=${note.student_id}`}>
                      Map
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <EmptyFoundryState title="No class records yet" detail="Complete a class, then save what was taught, understood and proven." />
        )}
      </section>
    </div>
  );
}
