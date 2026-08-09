import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight, LockKeyhole, Radar, ShieldCheck } from "lucide-react";
import { OrbitMark } from "@/components/OrbitMark";
import { getOrbitAccess, orbitHomePath } from "@/lib/access";

type Props = {
  searchParams: Promise<{
    code?: string;
    error?: string;
    error_description?: string;
  }>;
};

export default async function HomePage({ searchParams }: Props) {
  const query = await searchParams;

  // Some OAuth providers may fall back to the configured Site URL. Never leave
  // the auth code on the public landing page: finish the callback immediately.
  if (query.code) {
    redirect(`/auth/callback?code=${encodeURIComponent(query.code)}`);
  }

  if (query.error || query.error_description) {
    redirect(
      `/login?error=${encodeURIComponent(
        query.error_description ?? query.error ?? "Authentication could not be completed.",
      )}`,
    );
  }

  const context = await getOrbitAccess();
  if (context) redirect(orbitHomePath(context.access));

  return (
    <main className="landing">
      <nav className="landing-nav" aria-label="Primary navigation">
        <OrbitMark />
        <div className="landing-nav-actions">
          <Link className="button button-quiet" href="/login">
            Sign in
          </Link>
          <Link className="button button-primary" href="/login">
            Open Orbit <ArrowUpRight size={15} aria-hidden="true" />
          </Link>
        </div>
      </nav>

      <section className="hero">
        <div>
          <span className="eyebrow">Founder-first. Organisation-ready.</span>
          <h1>
            Run the company. <span>Not the chaos.</span>
          </h1>
          <p className="hero-copy">
            Orbit is a secure operating system for founders. It brings leads,
            delivery, cash, proof, decisions, and controlled team access into one
            command layer—then grows with the organisation through isolated
            modules, workflows, and permissions.
          </p>
          <div className="hero-actions">
            <Link className="button button-primary" href="/login">
              Enter your workspace
              <ArrowUpRight size={15} aria-hidden="true" />
            </Link>
          </div>
          <div className="hero-proof" aria-label="Product foundations">
            <span>Organisation-scoped data</span>
            <span>Capability-based access</span>
            <span>Audited actions</span>
          </div>
        </div>

        <div className="control-preview" aria-label="Orbit operating model preview">
          <div className="preview-top">
            <OrbitMark />
            <span className="system-state">Founder in control</span>
          </div>
          <div className="preview-body">
            <article className="preview-card">
              <div className="preview-label">Product model</div>
              <div className="preview-value">Founder → Organisation</div>
            </article>
            <article className="preview-card">
              <div className="preview-label">Access model</div>
              <div className="preview-value">Deny by default</div>
            </article>
            <article className="preview-card preview-card-wide">
              <div className="preview-label">How Orbit works</div>
              <div className="preview-list">
                <div className="preview-list-row">
                  <i />
                  <span>The founder sees decisions, risks, money, and next actions</span>
                  <em>COMMAND</em>
                </div>
                <div className="preview-list-row">
                  <i />
                  <span>Teams work only inside approved modules and workflows</span>
                  <em>ACCESS</em>
                </div>
                <div className="preview-list-row">
                  <i />
                  <span>Every important action remains attributable and reviewable</span>
                  <em>AUDIT</em>
                </div>
              </div>
            </article>
            <article className="preview-card">
              <div className="preview-label">Security</div>
              <ShieldCheck size={30} color="var(--success)" aria-hidden="true" />
            </article>
            <article className="preview-card">
              <div className="preview-label">Architecture</div>
              <Radar size={30} color="var(--accent)" aria-hidden="true" />
            </article>
          </div>
          <span className="sr-only">
            <LockKeyhole /> Secure organisation authentication and controlled access.
          </span>
        </div>
      </section>
    </main>
  );
}
