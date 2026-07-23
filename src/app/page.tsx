import Link from "next/link";
import { ArrowUpRight, LockKeyhole, Radar, ShieldCheck } from "lucide-react";
import { OrbitMark } from "@/components/OrbitMark";

export default function HomePage() {
  return (
    <main className="landing">
      <nav className="landing-nav" aria-label="Primary navigation">
        <OrbitMark />
        <div className="landing-nav-actions">
          <Link className="button button-quiet" href="/login">
            Sign in
          </Link>
          <Link className="button button-primary" href="/login?mode=signup">
            Start workspace <ArrowUpRight size={15} aria-hidden="true" />
          </Link>
        </div>
      </nav>

      <section className="hero">
        <div>
          <span className="eyebrow">Founder control plane</span>
          <h1>
            See the business. <span>Move what matters.</span>
          </h1>
          <p className="hero-copy">
            Orbit gives founders one trustworthy view of leads, client delivery,
            cash, proof, and the next action—without fake intelligence or invented
            metrics.
          </p>
          <div className="hero-actions">
            <Link className="button button-primary" href="/login?mode=signup">
              Build your command center
              <ArrowUpRight size={15} aria-hidden="true" />
            </Link>
            <Link className="button" href="/login">
              Open Orbit
            </Link>
          </div>
          <div className="hero-proof" aria-label="Product foundations">
            <span>Database-enforced isolation</span>
            <span>Verified auth</span>
            <span>Audited changes</span>
          </div>
        </div>

        <div className="control-preview" aria-label="Orbit product preview">
          <div className="preview-top">
            <OrbitMark />
            <span className="system-state">System truthful</span>
          </div>
          <div className="preview-body">
            <article className="preview-card">
              <div className="preview-label">Pipeline</div>
              <div className="preview-value">Lead → Proof</div>
            </article>
            <article className="preview-card">
              <div className="preview-label">Access model</div>
              <div className="preview-value">RLS</div>
            </article>
            <article className="preview-card preview-card-wide">
              <div className="preview-label">Operating loop</div>
              <div className="preview-list">
                <div className="preview-list-row">
                  <i />
                  <span>Qualified lead receives a next action</span>
                  <em>LEADS</em>
                </div>
                <div className="preview-list-row">
                  <i />
                  <span>Client delivery becomes measurable proof</span>
                  <em>PROJECTS</em>
                </div>
                <div className="preview-list-row">
                  <i />
                  <span>Approved proof becomes honest content</span>
                  <em>CONTENT</em>
                </div>
              </div>
            </article>
            <article className="preview-card">
              <div className="preview-label">Security</div>
              <ShieldCheck size={30} color="var(--success)" aria-hidden="true" />
            </article>
            <article className="preview-card">
              <div className="preview-label">Control</div>
              <Radar size={30} color="var(--accent)" aria-hidden="true" />
            </article>
          </div>
          <span className="sr-only">
            <LockKeyhole /> Secure workspace authentication.
          </span>
        </div>
      </section>
    </main>
  );
}
