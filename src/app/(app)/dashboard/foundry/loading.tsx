export default function FoundryLoading() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading Founder Command"
      className="foundry-page foundry-loading"
    >
      <section className="foundry-loading-hero">
        <span />
        <strong />
        <p />
      </section>
      <section className="foundry-metric-grid" aria-hidden="true">
        {["students", "attendance", "review", "support", "studio"].map((key) => (
          <article className="foundry-metric foundry-skeleton" key={key}>
            <span />
            <div>
              <small />
              <strong />
              <p />
            </div>
          </article>
        ))}
      </section>
      <section className="foundry-dashboard-grid" aria-hidden="true">
        <article className="foundry-card foundry-skeleton is-tall" />
        <article className="foundry-card foundry-skeleton is-tall" />
      </section>
      <span className="sr-only">Founder Command load ho raha hai.</span>
    </div>
  );
}
