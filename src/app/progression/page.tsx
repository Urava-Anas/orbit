import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowUpRight,
  Award,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Compass,
  Flame,
  Layers3,
  Medal,
  ShieldCheck,
  Sparkles,
  Target,
} from "lucide-react";
import { OrbitMark } from "@/components/OrbitMark";
import {
  formatFoundryDate,
  foundryDepartmentLabel,
  foundryLevelLabel,
  getCurrentStudentPortal,
} from "@/lib/foundry";
import previewStyles from "../progression-preview/progression-preview.module.css";
import styles from "./progression.module.css";

export const metadata: Metadata = {
  title: "Progression · Orbit",
  description: "Your live Orbit capability, evidence and next-action loop.",
  robots: { index: false, follow: false },
};

function routeForNextAction(text: string) {
  const value = text.toLowerCase();
  if (value.includes("note") || value.includes("read")) return "/learn/notes";
  if (value.includes("submit") || value.includes("revision") || value.includes("revise")) {
    return "/learn/submit";
  }
  if (value.includes("progress") || value.includes("feedback") || value.includes("review")) {
    return "/learn/progress";
  }
  if (value.includes("profile") || value.includes("certificate")) return "/learn/profile";
  return "/learn";
}

function actionFromPortal(data: Awaited<ReturnType<typeof getCurrentStudentPortal>>) {
  if (!data.student) {
    return {
      eyebrow: "What's next?",
      title: "Open your learning space",
      detail: "Reconnect your Foundry record to continue.",
      href: "/learn",
      external: false,
    };
  }

  const now = Date.now();
  const nextClass = data.classes[0] ?? null;
  const minutesToClass = nextClass
    ? (new Date(nextClass.starts_at).getTime() - now) / 60_000
    : Number.POSITIVE_INFINITY;

  if (nextClass && minutesToClass <= 45 && minutesToClass > -180) {
    return {
      eyebrow: "What's next?",
      title: "Next lecture",
      detail: `${nextClass.title} · ${formatFoundryDate(nextClass.starts_at)}`,
      href: nextClass.join_url ?? "/learn",
      external: Boolean(nextClass.join_url),
    };
  }

  const revision = data.notifications.find(
    (notification) => notification.kind === "revision_requested" && !notification.read_at,
  );
  if (revision) {
    return {
      eyebrow: "What's next?",
      title: "Fix requested revision",
      detail: revision.title,
      href: "/learn/submit",
      external: false,
    };
  }

  const activeAssignment = data.assignments.find(
    (assignment) =>
      !["completed", "submitted", "under_review"].includes(assignment.status),
  );
  if (activeAssignment) {
    return {
      eyebrow: "What's next?",
      title: "Continue current task",
      detail: activeAssignment.foundry_tasks?.title ?? "Your active Foundry task",
      href: "/learn/learn",
      external: false,
    };
  }

  const pendingReview = data.submissions.find((submission) =>
    ["submitted", "under_review"].includes(submission.status),
  );
  if (pendingReview) {
    return {
      eyebrow: "What's next?",
      title: "Review in progress",
      detail: "Your work is with your mentor. Check the latest status.",
      href: "/learn/progress",
      external: false,
    };
  }

  const latestFeedback = data.submissions.find((submission) => submission.feedback?.trim());
  if (latestFeedback) {
    return {
      eyebrow: "What's next?",
      title: "Read feedback",
      detail: latestFeedback.feedback ?? "Your mentor left feedback.",
      href: "/learn/progress",
      external: false,
    };
  }

  if (nextClass) {
    return {
      eyebrow: "What's next?",
      title: "Next lecture",
      detail: `${nextClass.title} · ${formatFoundryDate(nextClass.starts_at)}`,
      href: "/learn",
      external: false,
    };
  }

  if (data.student.next_action?.trim()) {
    return {
      eyebrow: "What's next?",
      title: "Your next step",
      detail: data.student.next_action,
      href: routeForNextAction(data.student.next_action),
      external: false,
    };
  }

  return {
    eyebrow: "What's next?",
    title: "Check your progress",
    detail: "See what has been proven and what is ready to unlock next.",
    href: "/learn/progress",
    external: false,
  };
}

export default async function ProgressionPage() {
  const data = await getCurrentStudentPortal();
  if (!data.student) redirect("/learn");

  const { student, assignments, submissions, skills, progress, certificates } = data;
  const nextAction = actionFromPortal(data);
  const totalPoints = progress.reduce((sum, event) => sum + event.points, 0);
  const evidenceCount = skills.reduce((sum, skill) => sum + skill.evidence_count, 0);
  const completedAssignments = assignments.filter(
    (assignment) => assignment.status === "completed",
  ).length;
  const issuedCertificates = certificates.filter(
    (certificate) => certificate.status === "issued",
  ).length;

  const capabilityCards = skills.slice(0, 4).map((skill, index) => {
    const Icon = [Compass, Layers3, Target, ShieldCheck][index % 4];
    const state = skill.evidence_count >= 3 ? "Proven" : skill.evidence_count >= 1 ? "Growing" : "Learning";
    return {
      title: foundryLevelLabel(skill.dimension),
      impact: skill.note?.trim() || `${skill.evidence_count} verified evidence item${skill.evidence_count === 1 ? "" : "s"} recorded in Orbit.`,
      state,
      Icon,
    };
  });

  const recentAchievements = progress
    .filter((event) => event.points > 0 || event.evidence_url)
    .slice(0, 3);

  const firstName = student.full_name.split(" ")[0] || student.full_name;

  return (
    <main className={previewStyles.shell}>
      <div className={previewStyles.ambientOne} aria-hidden="true" />
      <div className={previewStyles.ambientTwo} aria-hidden="true" />

      <nav className={previewStyles.topbar} aria-label="Orbit progression navigation">
        <div className={previewStyles.brandWrap}>
          <OrbitMark />
          <div>
            <strong>Orbit</strong>
            <span>Progression Engine</span>
          </div>
        </div>
        <div className={previewStyles.topbarActions}>
          <span className={styles.livePill}>Live</span>
          <Link className={previewStyles.quietButton} href="/learn">
            Learning space
            <ArrowUpRight size={15} aria-hidden="true" />
          </Link>
        </div>
      </nav>

      <section className={previewStyles.workspace}>
        <header className={`${previewStyles.hero} ${styles.heroWithAction}`}>
          <div>
            <span className={previewStyles.eyebrow}>
              {foundryDepartmentLabel(student.department)} · Orbit profile
            </span>
            <h1>Good evening, {firstName}.</h1>
            <p>
              Orbit shows what you can do, what you have proven, and the single next action that keeps your journey moving.
            </p>
          </div>

          <div className={styles.heroRight}>
            <div className={previewStyles.heroMeta}>
              <span><Sparkles size={15} /> {totalPoints} points</span>
              <span><ShieldCheck size={15} /> {evidenceCount} proofs</span>
            </div>

            {nextAction.external ? (
              <a
                className={styles.nextAction}
                href={nextAction.href}
                rel="noreferrer"
                target="_blank"
              >
                <span className={styles.nextActionCopy}>
                  <small>{nextAction.eyebrow}</small>
                  <strong>{nextAction.title}</strong>
                  <em>{nextAction.detail}</em>
                </span>
                <span className={styles.nextActionArrow}><ArrowUpRight size={17} /></span>
              </a>
            ) : (
              <Link className={styles.nextAction} href={nextAction.href}>
                <span className={styles.nextActionCopy}>
                  <small>{nextAction.eyebrow}</small>
                  <strong>{nextAction.title}</strong>
                  <em>{nextAction.detail}</em>
                </span>
                <span className={styles.nextActionArrow}><ChevronRight size={18} /></span>
              </Link>
            )}
          </div>
        </header>

        <section className={previewStyles.rankGrid} aria-label="Current progression">
          <article className={`${previewStyles.glass} ${previewStyles.rankCard}`}>
            <div className={previewStyles.rankIdentity}>
              <div className={previewStyles.rankGlyph} aria-hidden="true">
                <span>{student.level.slice(0, 2).toUpperCase()}</span>
              </div>
              <div>
                <small>Current level</small>
                <h2>{foundryLevelLabel(student.level)}</h2>
                <p>{student.main_goal || "Build capability through real evidence and repeated application."}</p>
              </div>
            </div>

            <div className={previewStyles.rankProgress}>
              <div className={previewStyles.progressTopline}>
                <span>Verified progression</span>
                <strong>{totalPoints} earned points</strong>
              </div>
              <div className={styles.evidenceLine}>
                <span><CheckCircle2 size={14} /> {evidenceCount} evidence proofs</span>
                <span><Award size={14} /> {completedAssignments} completed tasks</span>
                <span><ShieldCheck size={14} /> {issuedCertificates} certificates</span>
              </div>
            </div>
          </article>

          <article className={`${previewStyles.glass} ${previewStyles.nextCard}`}>
            <span className={previewStyles.cardKicker}>Next unlock</span>
            <div className={previewStyles.nextIcon}><Medal size={24} /></div>
            <h2>Prove the next capability</h2>
            <p>Complete the next real action, submit evidence, and let Orbit update your record.</p>
            <Link className={previewStyles.primaryButton} href={nextAction.external ? "/learn" : nextAction.href}>
              Continue journey
              <ChevronRight size={16} aria-hidden="true" />
            </Link>
          </article>
        </section>

        <section className={previewStyles.sectionBlock}>
          <div className={previewStyles.sectionHeading}>
            <div>
              <span className={previewStyles.cardKicker}>Impact capabilities</span>
              <h2>What you can do now</h2>
            </div>
            <span className={previewStyles.sectionNote}>Evidence, not chapter completion</span>
          </div>

          {capabilityCards.length ? (
            <div className={previewStyles.capabilityGrid}>
              {capabilityCards.map(({ title, impact, state, Icon }) => (
                <article className={`${previewStyles.glass} ${previewStyles.capabilityCard}`} key={title}>
                  <div className={previewStyles.capabilityTop}>
                    <span className={previewStyles.capabilityIcon}><Icon size={18} /></span>
                    <span className={`${previewStyles.state} ${styles.capabilityState}`}>{state}</span>
                  </div>
                  <h3>{title}</h3>
                  <p>{impact}</p>
                </article>
              ))}
            </div>
          ) : (
            <article className={`${previewStyles.glass} ${styles.emptyCapability}`}>
              <Target size={20} />
              <div>
                <strong>Your first capability is waiting for evidence.</strong>
                <p>Complete your immediate action and Orbit will begin building this profile from verified work.</p>
              </div>
            </article>
          )}
        </section>

        <section className={previewStyles.lowerGrid}>
          <article className={`${previewStyles.glass} ${previewStyles.challengeCard}`}>
            <div className={previewStyles.challengeHead}>
              <div>
                <span className={previewStyles.cardKicker}>Immediate loop</span>
                <h2>{nextAction.title}</h2>
              </div>
              <span className={previewStyles.reward}><Clock3 size={13} /> Now</span>
            </div>
            <p className={previewStyles.challengeImpact}>
              <strong>Current position:</strong> {nextAction.detail}
            </p>
            <div className={previewStyles.challengeSteps}>
              <span><b>1</b> Act</span>
              <span><b>2</b> Show evidence</span>
              <span><b>3</b> Get verified</span>
              <span><b>4</b> Unlock next</span>
            </div>
            <Link className={previewStyles.primaryButton} href={nextAction.external ? "/learn" : nextAction.href}>
              Do the next thing
              <ArrowUpRight size={16} aria-hidden="true" />
            </Link>
          </article>

          <article className={`${previewStyles.glass} ${previewStyles.achievementCard}`}>
            <div className={previewStyles.sectionHeadingCompact}>
              <div>
                <span className={previewStyles.cardKicker}>Achievements</span>
                <h2>Recent proof</h2>
              </div>
              <Award size={20} />
            </div>
            <div className={previewStyles.achievementList}>
              {recentAchievements.length ? recentAchievements.map((event) => (
                <div className={previewStyles.achievementRow} key={event.id}>
                  <span className={previewStyles.achievementIcon}><CheckCircle2 size={17} /></span>
                  <div>
                    <strong>{event.title}</strong>
                    <small>{event.detail || formatFoundryDate(event.occurred_at)}</small>
                  </div>
                  <CheckCircle2 size={16} className={previewStyles.verifiedIcon} aria-label="Recorded" />
                </div>
              )) : (
                <div className={styles.noAchievement}>Your first verified achievement will appear here.</div>
              )}
            </div>
          </article>
        </section>

        <footer className={`${previewStyles.glass} ${previewStyles.profileStrip}`}>
          <div>
            <span className={previewStyles.profileIcon}><ShieldCheck size={18} /></span>
            <div>
              <strong>Orbit Profile</strong>
              <small>Your long-term record of capability, evidence, achievements and impact.</small>
            </div>
          </div>
          <Link className={previewStyles.quietButton} href="/learn/profile">
            Open profile
            <ArrowUpRight size={15} aria-hidden="true" />
          </Link>
        </footer>
      </section>
    </main>
  );
}
