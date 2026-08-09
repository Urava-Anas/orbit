import type { Metadata } from "next";
import {
  ArrowUpRight,
  Award,
  CheckCircle2,
  ChevronRight,
  Compass,
  Flame,
  Layers3,
  Medal,
  ShieldCheck,
  Sparkles,
  Target,
  UserRoundCheck,
} from "lucide-react";
import { OrbitMark } from "@/components/OrbitMark";
import styles from "./progression-preview.module.css";

export const metadata: Metadata = {
  title: "Progression Preview · Orbit",
  description: "Preview of Orbit's capability-based progression system.",
  robots: { index: false, follow: false },
};

const capabilities = [
  {
    title: "Understand people",
    impact: "Can identify user needs and explain the real problem before designing.",
    state: "Proven",
    icon: UserRoundCheck,
  },
  {
    title: "Structure journeys",
    impact: "Can turn a messy process into a clear user flow with logical steps.",
    state: "Proven",
    icon: Compass,
  },
  {
    title: "Design interfaces",
    impact: "Can create clean, usable screens with clear hierarchy and intent.",
    state: "Growing",
    icon: Layers3,
  },
  {
    title: "Create measurable impact",
    impact: "Can connect design decisions to a real user or business outcome.",
    state: "Locked",
    icon: Target,
  },
];

const achievements = [
  { title: "Flow Thinker", detail: "3 verified flow challenges", icon: Compass },
  { title: "Consistency", detail: "7-day contribution streak", icon: Flame },
  { title: "Quality Proof", detail: "5 mentor-approved submissions", icon: ShieldCheck },
];

export default function ProgressionPreviewPage() {
  return (
    <main className={styles.shell}>
      <div className={styles.ambientOne} aria-hidden="true" />
      <div className={styles.ambientTwo} aria-hidden="true" />

      <nav className={styles.topbar} aria-label="Orbit preview navigation">
        <div className={styles.brandWrap}>
          <OrbitMark />
          <div>
            <strong>Orbit</strong>
            <span>Progression Engine</span>
          </div>
        </div>
        <div className={styles.topbarActions}>
          <span className={styles.previewPill}>Preview mode</span>
          <a className={styles.quietButton} href="/">
            Back to Orbit
            <ArrowUpRight size={15} aria-hidden="true" />
          </a>
        </div>
      </nav>

      <section className={styles.workspace}>
        <header className={styles.hero}>
          <div>
            <span className={styles.eyebrow}>Urava Foundry · Learner profile</span>
            <h1>Good evening, Rubab.</h1>
            <p>
              No chapters. Orbit shows what you can do, what you have proven, and what you are ready to unlock next.
            </p>
          </div>
          <div className={styles.heroMeta}>
            <span><Sparkles size={15} /> 2,450 XP</span>
            <span><Flame size={15} /> 12 day streak</span>
          </div>
        </header>

        <section className={styles.rankGrid} aria-label="Current progression">
          <article className={`${styles.glass} ${styles.rankCard}`}>
            <div className={styles.rankIdentity}>
              <div className={styles.rankGlyph} aria-hidden="true">
                <span>07</span>
              </div>
              <div>
                <small>Current rank</small>
                <h2>Creator</h2>
                <p>You create with purpose and can explain why your work matters.</p>
              </div>
            </div>

            <div className={styles.rankProgress}>
              <div className={styles.progressTopline}>
                <span>Progress to Innovator</span>
                <strong>2,450 / 3,000 XP</strong>
              </div>
              <div className={styles.progressTrack} aria-label="82 percent to next level">
                <span style={{ width: "82%" }} />
              </div>
              <div className={styles.rankSignals}>
                <span><CheckCircle2 size={14} /> 8 capabilities proven</span>
                <span><Award size={14} /> 6 achievements</span>
                <span><ShieldCheck size={14} /> 14 verified proofs</span>
              </div>
            </div>
          </article>

          <article className={`${styles.glass} ${styles.nextCard}`}>
            <span className={styles.cardKicker}>Next rank</span>
            <div className={styles.nextIcon}><Medal size={24} /></div>
            <h2>Innovator</h2>
            <p>Solve a real problem independently and show measurable impact.</p>
            <button type="button" className={styles.primaryButton}>
              View unlock requirements
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          </article>
        </section>

        <section className={styles.sectionBlock}>
          <div className={styles.sectionHeading}>
            <div>
              <span className={styles.cardKicker}>Impact capabilities</span>
              <h2>What you can do now</h2>
            </div>
            <span className={styles.sectionNote}>Capability + evidence, not lecture completion</span>
          </div>

          <div className={styles.capabilityGrid}>
            {capabilities.map(({ title, impact, state, icon: Icon }) => (
              <article className={`${styles.glass} ${styles.capabilityCard}`} key={title}>
                <div className={styles.capabilityTop}>
                  <span className={styles.capabilityIcon}><Icon size={18} /></span>
                  <span className={`${styles.state} ${styles[`state${state}`]}`}>{state}</span>
                </div>
                <h3>{title}</h3>
                <p>{impact}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.lowerGrid}>
          <article className={`${styles.glass} ${styles.challengeCard}`}>
            <div className={styles.challengeHead}>
              <div>
                <span className={styles.cardKicker}>Current challenge</span>
                <h2>Design a mobile onboarding flow</h2>
              </div>
              <span className={styles.reward}>+350 XP</span>
            </div>
            <p className={styles.challengeImpact}>
              <strong>Impact to unlock:</strong> prove that you can guide a first-time user from confusion to confidence in three screens.
            </p>
            <div className={styles.challengeSteps}>
              <span><b>1</b> Build</span>
              <span><b>2</b> Submit evidence</span>
              <span><b>3</b> Get verified</span>
              <span><b>4</b> Earn progression</span>
            </div>
            <button type="button" className={styles.primaryButton}>
              Continue challenge
              <ArrowUpRight size={16} aria-hidden="true" />
            </button>
          </article>

          <article className={`${styles.glass} ${styles.achievementCard}`}>
            <div className={styles.sectionHeadingCompact}>
              <div>
                <span className={styles.cardKicker}>Achievements</span>
                <h2>Proof earned</h2>
              </div>
              <Award size={20} />
            </div>
            <div className={styles.achievementList}>
              {achievements.map(({ title, detail, icon: Icon }) => (
                <div className={styles.achievementRow} key={title}>
                  <span className={styles.achievementIcon}><Icon size={17} /></span>
                  <div>
                    <strong>{title}</strong>
                    <small>{detail}</small>
                  </div>
                  <CheckCircle2 size={16} className={styles.verifiedIcon} aria-label="Verified" />
                </div>
              ))}
            </div>
          </article>
        </section>

        <footer className={`${styles.glass} ${styles.profileStrip}`}>
          <div>
            <span className={styles.profileIcon}><ShieldCheck size={18} /></span>
            <div>
              <strong>Orbit Profile</strong>
              <small>Your long-term capability record: ranks, evidence, achievements and verified impact.</small>
            </div>
          </div>
          <button type="button" className={styles.quietButton}>
            Preview profile
            <ArrowUpRight size={15} aria-hidden="true" />
          </button>
        </footer>
      </section>
    </main>
  );
}
