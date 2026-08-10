import type { Metadata } from "next";
import Link from "next/link";
import { Building2, CheckCircle2, Layers3, PlugZap, Settings2, UsersRound } from "lucide-react";
import { requireOrbitAccess } from "@/lib/access";

export const metadata: Metadata = {
  title: "Set up organisation · Orbit",
  robots: { index: false, follow: false },
};

type ModuleRow = { module_key: string; status: string };

export default async function OnboardingPage() {
  const { access, supabase } = await requireOrbitAccess();

  if (!access.workspace) {
    return (
      <main className="auth-shell">
        <section className="auth-panel">
          <Link href="/" aria-label="Orbit home"><span className="wordmark"><span className="orbit-mark" aria-hidden="true" />Orbit <span style={{ color: "var(--muted)" }}>by Urava</span></span></Link>
          <div className="auth-form">
            <span className="eyebrow">Organisation setup</span>
            <h1>First, connect an organisation.</h1>
            <p>Orbit cannot create operating rules around an unverified workspace.</p>
            <Link className="button button-primary" href="/access-pending">Check access</Link>
          </div>
        </section>
        <aside className="auth-art" aria-hidden="true"><div className="auth-quote"><p>Identity → organisation → modules → workspace.</p></div></aside>
      </main>
    );
  }

  const { data } = await supabase
    .from("organisation_modules")
    .select("module_key, status")
    .eq("workspace_id", access.workspace.id)
    .neq("status", "disabled");
  const modules = (data ?? []) as ModuleRow[];

  const steps = [
    {
      title: "Organisation identity",
      detail: `${access.workspace.name} is the active organisation boundary.`,
      href: "/dashboard/organisation",
      icon: Building2,
      done: true,
    },
    {
      title: "People & roles",
      detail: "Confirm who belongs here and what authority each role receives.",
      href: "/dashboard/people",
      icon: UsersRound,
      done: Boolean(access.membershipRole),
    },
    {
      title: "Modules",
      detail: modules.length ? `${modules.length} module${modules.length === 1 ? "" : "s"} enabled or in pilot.` : "Choose only the capabilities this organisation needs.",
      href: "/dashboard/organisation",
      icon: Layers3,
      done: modules.length > 0,
    },
    {
      title: "Integrations",
      detail: "Connect the services the organisation actually uses.",
      href: "/dashboard/integrations",
      icon: PlugZap,
      done: false,
    },
    {
      title: "Policies & settings",
      detail: "Review identity, security and organisation controls before daily use.",
      href: "/dashboard/settings",
      icon: Settings2,
      done: true,
    },
  ];

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <Link href="/" aria-label="Orbit home"><span className="wordmark"><span className="orbit-mark" aria-hidden="true" />Orbit <span style={{ color: "var(--muted)" }}>by Urava</span></span></Link>
        <div className="auth-form">
          <span className="eyebrow">Organisation onboarding</span>
          <h1>Set up {access.workspace.name}.</h1>
          <p>Keep setup short. Orbit opens the organisation only after identity, modules and operating controls have a clear home.</p>

          <div className="settings-grid" style={{ marginTop: 24 }}>
            {steps.map(({ title, detail, href, icon: Icon, done }) => (
              <article className="panel settings-card" key={title}>
                <Icon aria-hidden="true" size={20} />
                <h2>{title}</h2>
                <p>{detail}</p>
                {done ? <span className="system-state"><CheckCircle2 aria-hidden="true" size={13} /> Ready</span> : null}
                <Link className="button" href={href}>Open</Link>
              </article>
            ))}
          </div>

          <Link className="button button-primary" href={access.accountRole === "student" ? "/portal" : "/dashboard"} style={{ marginTop: 20 }}>
            Enter Orbit
          </Link>
        </div>
      </section>
      <aside className="auth-art" aria-hidden="true">
        <div className="auth-quote">
          <span className="eyebrow">Minimal setup</span>
          <p>Organisation identity, people, modules, integrations and policies. Nothing else needs a separate onboarding page.</p>
        </div>
      </aside>
    </main>
  );
}
