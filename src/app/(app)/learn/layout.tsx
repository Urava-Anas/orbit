import Link from "next/link";
import { ShieldCheck, Sparkles } from "lucide-react";
import { StudentFoundryNavigation } from "@/components/foundry/FoundryNavigation";
import { requireWorkspace } from "@/lib/workspace";

export default async function LearnLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireWorkspace();
  return (
    <div className="student-shell">
      <a className="role-skip-link" href="#student-main">
        Seedha aaj ke task par jayen
      </a>
      <header className="student-shell-header">
        <Link className="student-brand" href="/learn">
          <span>
            <Sparkles aria-hidden="true" size={18} />
          </span>
          <strong>Urava Foundry</strong>
        </Link>
        <span className="student-header-promise">Seekho · Banao · Barho</span>
        <span
          className="student-role-pill"
          aria-label="Private student space showing only your learning record"
        >
          <ShieldCheck aria-hidden="true" size={16} />
          <span>
            <strong>Student space</strong>
            <small>Only your record</small>
          </span>
        </span>
      </header>
      <main className="student-shell-main" id="student-main">
        {children}
      </main>
      <StudentFoundryNavigation />
    </div>
  );
}
