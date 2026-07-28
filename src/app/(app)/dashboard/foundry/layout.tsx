import Link from "next/link";
import { ArrowLeft, Crown } from "lucide-react";
import {
  FounderFoundryNavigation,
  FoundryMiniMark,
} from "@/components/foundry/FoundryNavigation";
import { requireFounderFoundry } from "@/lib/foundry";

export default async function FoundryLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireFounderFoundry();

  return (
    <div className="foundry-shell">
      <a className="role-skip-link" href="#foundry-main">
        Skip to Founder Command
      </a>
      <header className="foundry-topline">
        <Link className="foundry-brand" href="/dashboard/foundry">
          <FoundryMiniMark />
          <span>
            <small>Orbit · Founder workspace</small>
            <strong>Urava Foundry</strong>
          </span>
        </Link>
        <div className="foundry-top-actions">
          <span className="foundry-live-pill" aria-label="Foundry live state">
            <i aria-hidden="true" />
            Live operating view
          </span>
          <span
            className="foundry-role-pill"
            aria-label="Founder mode with full Foundry control"
          >
            <Crown aria-hidden="true" size={15} />
            <span>
              <strong>Founder mode</strong>
              <small>Full control</small>
            </span>
          </span>
          <Link className="foundry-back-link" href="/dashboard">
            <ArrowLeft aria-hidden="true" size={15} />
            Orbit
          </Link>
        </div>
      </header>
      <FounderFoundryNavigation />
      <main className="foundry-content" id="foundry-main">
        {children}
      </main>
    </div>
  );
}
