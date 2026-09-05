import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowUpRight,
  BarChart3,
  BookOpenCheck,
  Database,
  FileText,
  Gauge,
  Settings2,
  ShieldCheck,
  UsersRound,
  UserRoundCheck,
} from "lucide-react";
import { FoundryActionButton } from "@/components/foundry/FoundryActionButton";
import { FoundryNotice } from "@/components/foundry/FoundryUI";
import { getFoundrySettings } from "@/lib/foundry";
import { updateFoundryCapacity } from "../actions";

export const metadata: Metadata = {
  title: "Foundry Settings & Support",
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
    title: "Progress & readiness",
    detail: "Learning evidence, achievements and Studio readiness decisions.",
    icon: BarChart3,
  },
] as const;

type Props = {
  searchParams: Promise<{ notice?: string; error?: string }>;
};

export default async function FoundryMorePage({ searchParams }: Props) {
  const messages = await searchParams;
  const { moduleStatus, seatCapacity } = await getFoundrySettings();

  return (
    <div className="foundry-page">
      <FoundryNotice error={messages.error} notice={messages.notice} />
      <section className="foundry-page-title">
        <div>
          <span className="foundry-kicker">Foundry controls</span>
          <h1>Settings & Support</h1>
          <p>
            Open supporting workflows, control cohort capacity and understand the
            systems that keep Foundry records secure and consistent.
          </p>
        </div>
      </section>

      <section className="foundry-more-grid" aria-label="Supporting Foundry workflows">
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

      <section className="foundry-settings-grid">
        <article className="foundry-card">
          <div className="foundry-card-head">
            <div>
              <span className="foundry-card-eyebrow">Cohort control</span>
              <h2>Seat capacity</h2>
            </div>
            <UsersRound aria-hidden="true" size={20} />
          </div>
          <p className="foundry-long-copy">
            Available seats on Founder Command are calculated from this active-student capacity.
          </p>
          <form action={updateFoundryCapacity} className="foundry-inline-form">
            <label>
              Maximum active seats
              <input
                defaultValue={seatCapacity}
                max="500"
                min="1"
                name="seatCapacity"
                required
                type="number"
              />
            </label>
            <FoundryActionButton
              className="foundry-button foundry-button-dark"
              pendingLabel="Saving…"
            >
              Save capacity
            </FoundryActionButton>
          </form>
        </article>

        <article className="foundry-card foundry-settings-state">
          <span className="foundry-metric-icon is-green">
            <Gauge aria-hidden="true" size={20} />
          </span>
          <div>
            <small>Foundry system</small>
            <strong>{moduleStatus}</strong>
            <p>
              Identity, role access, audited actions and live updates share one secure operating boundary.
            </p>
          </div>
          <Settings2 aria-hidden="true" size={20} />
        </article>
      </section>

      <section className="foundry-card">
        <div className="foundry-card-head">
          <div>
            <span className="foundry-card-eyebrow">Data responsibilities</span>
            <h2>Where Foundry information lives</h2>
          </div>
          <ShieldCheck aria-hidden="true" size={20} />
        </div>
        <div className="foundry-system-grid">
          <article>
            <Database aria-hidden="true" size={20} />
            <strong>Supabase</strong>
            <p>Secure operational records, identity, permissions and workflow state.</p>
            <span>Primary record</span>
          </article>
          <article>
            <FileText aria-hidden="true" size={20} />
            <strong>Airtable</strong>
            <p>Admissions intake linked to each permanent Foundry ID.</p>
            <span>Admissions intake</span>
          </article>
          <article>
            <BookOpenCheck aria-hidden="true" size={20} />
            <strong>Notion</strong>
            <p>Curriculum, policies, decisions and implementation knowledge.</p>
            <span>Knowledge layer</span>
          </article>
        </div>
      </section>
    </div>
  );
}