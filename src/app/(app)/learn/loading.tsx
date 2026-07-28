export default function StudentLoading() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading your student space"
      className="student-portal-view student-loading"
    >
      <section className="student-role-context student-skeleton" aria-hidden="true" />
      <header className="student-loading-greeting" aria-hidden="true">
        <span />
        <strong />
      </header>
      <section className="student-primary-card student-skeleton is-tall" aria-hidden="true" />
      <section className="student-next-class student-skeleton" aria-hidden="true" />
      <span className="sr-only">Aap ka learning record load ho raha hai.</span>
    </div>
  );
}
