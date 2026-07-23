export default function DashboardLoading() {
  return (
    <div className="page" aria-busy="true" aria-label="Loading Orbit">
      <div className="page-header">
        <div>
          <span className="section-kicker">Synchronizing live state</span>
          <h1>Orbit is loading.</h1>
        </div>
      </div>
      <section className="metrics-grid">
        {["a", "b", "c", "d"].map((key) => (
          <article className="metric-card" key={key}>
            <span>Secure query</span>
            <strong>—</strong>
            <small>Reading workspace records</small>
          </article>
        ))}
      </section>
    </div>
  );
}

