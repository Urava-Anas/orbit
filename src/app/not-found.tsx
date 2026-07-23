import Link from "next/link";
import { OrbitMark } from "@/components/OrbitMark";

export default function NotFound() {
  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <OrbitMark />
        <div className="auth-form">
          <span className="eyebrow">404 · Outside orbit</span>
          <h1>Nothing here.</h1>
          <p>The requested route does not exist or is no longer available.</p>
          <Link className="button button-primary" href="/">
            Return home
          </Link>
        </div>
      </section>
      <aside className="auth-art" aria-hidden="true">
        <div className="auth-quote">
          <span className="eyebrow">Navigation state</span>
          <p>Strong systems make failure obvious and recovery simple.</p>
        </div>
      </aside>
    </main>
  );
}

