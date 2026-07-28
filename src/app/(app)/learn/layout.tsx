import Link from "next/link";
import { LogOut, Sparkles } from "lucide-react";
import { StudentFoundryNavigation } from "@/components/foundry/FoundryNavigation";
import { requireWorkspace } from "@/lib/workspace";

export default async function LearnLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { user } = await requireWorkspace();
  return (
    <div className="student-shell">
      <header className="student-shell-header">
        <Link className="student-brand" href="/learn">
          <span>
            <Sparkles aria-hidden="true" size={18} />
          </span>
          <strong>Urava Foundry</strong>
        </Link>
        <span className="student-account">
          {user.email}
          <LogOut aria-hidden="true" size={15} />
        </span>
      </header>
      <main className="student-shell-main">{children}</main>
      <StudentFoundryNavigation />
    </div>
  );
}
