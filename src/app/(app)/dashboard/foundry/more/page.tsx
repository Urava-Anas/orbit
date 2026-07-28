import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowUpRight,
  BarChart3,
  BookOpenCheck,
  Database,
  FileText,
  ShieldCheck,
  UserRoundCheck,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Foundry More",
  robots: { index: false, follow: false },
};

const moduleLinks = [
  {
    href: "/dashboard/foundry/attendance",
    title: "Attendance",
    detail: "Class check-ins, late patterns and support notes.",
    icon: UserRoundCheck,
  },
  {
    href: "/dashboard/foundry/submissions",
    title: "Submissions",
    detail: "Review queue, feedback, revisions and accepted evidence.",
    icon: BookOpenCheck,
  },
  {
    href: "/dashboard/foundry/progress",
    title: "Progress",
    detail: "Skill scores, achievements and Studio readiness.",
    icon: BarChart3,
  },
] as const;

export default function FoundryMorePage() {
  return (
    <div className="foundry-page">
      <section className="foundry-page-title">
        <div>
          <span className="foundry-kicker">MVP operations</span>
          <h1>More</h1>
          <p>Supporting modules and system boundaries for Foundry operators.</p>
        </div>
      </section>

      <section className="foundry-more-grid">
        {moduleLinks.map(({ href, title, detail, icon: Icon }) => (
          <Link className="foundry-more-card" href={href} key={href}>
            <span>
              <Icon aria-hidden="true" size={22} />
            </span>
            <div>
              <h2>{title}</h2>
              <p>{detail}</p>
            </div>
            <ArrowUpRight aria-hidden="true" size={18} />
          </Link>
        ))}
      </section>

      <section className="foundry-card">
        <div className="foundry-card-head">
          <div>
            <span className="foundry-card-eyebrow">Orbit boundary</span>
            <h2>Trusted system map</h2>
          </div>
          <ShieldCheck aria-hidden="true" size={20} />
        </div>
        <div className="foundry-system-grid">
          <article>
            <Database aria-hidden="true" size={20} />
            <strong>Supabase</strong>
            <p>Canonical operational data, auth, RLS and audited workflow state.</p>
            <span>Source of truth</span>
          </article>
          <article>
            <FileText aria-hidden="true" size={20} />
            <strong>Airtable</strong>
            <p>Admissions intake with permanent Foundry ID and sync timestamp.</p>
            <span>Intake only</span>
          </article>
          <article>
            <BookOpenCheck aria-hidden="true" size={20} />
            <strong>Notion</strong>
            <p>Curriculum, decisions, policies and implementation record.</p>
            <span>Knowledge layer</span>
          </article>
        </div>
      </section>
    </div>
  );
}
