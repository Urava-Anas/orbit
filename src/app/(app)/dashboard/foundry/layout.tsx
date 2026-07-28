import Link from "next/link";
import { ArrowLeft, Crown, Sparkles } from "lucide-react";
import {
  FounderFoundryNavigation,
  FoundryMiniMark,
} from "@/components/foundry/FoundryNavigation";
import { requireFounderFoundry } from "@/lib/foundry";

export default async function FoundryLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { workspace } = await requireFounderFoundry();

  return (
    <div className="foundry-shell">
      <header className="foundry-topline">
        <div className="foundry-brand">
          <FoundryMiniMark />
          <span>
            <strong>Urava Foundry OS</strong>
            <small>{workspace.name} · Orbit</small>
          </span>
        </div>
        <div className="foundry-top-actions">
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
      <main className="foundry-content">{children}</main>
      <div className="foundry-corner-character" aria-hidden="true">
        <Sparkles size={18} />
      </div>
    </div>
  );
}
